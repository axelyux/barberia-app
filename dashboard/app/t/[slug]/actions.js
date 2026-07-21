"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { findConflict, findNearestAvailableSlots, formatTime12h, FALLBACK_HOURS } from "@/lib/scheduling";

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

async function bookingsForDay(tenantId, dayStart, excludeId = null) {
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const rows = await prisma.booking.findMany({
        where: { tenantId, scheduledAt: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" }, id: excludeId ? { not: excludeId } : undefined },
    });
    return rows;
}

async function dayHoursFor(tenantId, dayStart) {
    const row = await prisma.businessHour.findUnique({ where: { tenantId_weekday: { tenantId, weekday: dayStart.getDay() } } });
    return row ?? FALLBACK_HOURS;
}

function conflictError(candidateStart, durationMin, existing, dayHours) {
    const alternatives = findNearestAvailableSlots(candidateStart, durationMin, existing, dayHours);
    const suggestionText = alternatives.length
        ? ` ¿Te sirve a las ${alternatives.map(formatTime12h).join(" o a las ")}?`
        : " No hay otro horario libre cerca ese día.";
    return new Error(`Esa hora ya está ocupada.${suggestionText}`);
}

export async function getBookingsForDate(slug, dateISO) {
    await requirePermission("CITAS", "view");
    const tenantId = await tenantIdFromSlug(slug);
    const dayStart = new Date(dateISO);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const bookings = await prisma.booking.findMany({
        where: { tenantId, scheduledAt: { gte: dayStart, lt: dayEnd } },
        include: { service: true, barber: true },
        orderBy: { scheduledAt: "asc" },
    });
    return bookings.map((b) => ({
        ...b,
        scheduledAt: b.scheduledAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
        completedAt: b.completedAt?.toISOString() ?? null,
    }));
}

export async function markBookingCompleted(bookingId, slug, { paymentMethod = "EFECTIVO", paymentStatus = "PAGADO", amountPaidCents } = {}) {
    await requirePermission("CITAS", "edit");
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error("Cita no encontrada");

    const fullPrice = booking.priceChargedCents ?? 0;
    const paid = paymentStatus === "NO_PAGADO" ? 0 : paymentStatus === "PARCIAL" ? Math.max(0, Math.min(fullPrice, Math.round(amountPaidCents) || 0)) : fullPrice;

    await prisma.booking.update({
        where: { id: bookingId },
        data: { status: "COMPLETED", paymentMethod, paymentStatus, amountPaidCents: paid, completedAt: new Date() },
    });
    revalidatePath(`/t/${slug}`);
}

export async function cancelBooking(bookingId, slug) {
    await requirePermission("CITAS", "edit");
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
    revalidatePath(`/t/${slug}`);
}

export async function createBooking(slug, { customerName, customerPhone, serviceId, barberId, dateISO, hour, minute }) {
    await requirePermission("CITAS", "add");
    if (!customerName?.trim()) throw new Error("El nombre del cliente es obligatorio");
    const tenantId = await tenantIdFromSlug(slug);

    const dayStart = new Date(dateISO);
    dayStart.setHours(0, 0, 0, 0);
    const scheduledAt = new Date(dayStart);
    scheduledAt.setHours(hour, minute, 0, 0);

    const service = serviceId ? await prisma.service.findUnique({ where: { id: serviceId } }) : null;
    const durationMin = service?.durationMin ?? 30;

    const [existing, dayHours] = await Promise.all([bookingsForDay(tenantId, dayStart), dayHoursFor(tenantId, dayStart)]);
    const conflict = findConflict(scheduledAt, durationMin, existing);
    if (conflict) throw conflictError(scheduledAt, durationMin, existing, dayHours);

    await prisma.booking.create({
        data: {
            tenantId,
            customerName: customerName.trim(),
            customerPhone: customerPhone?.trim() || "—",
            serviceId: service?.id,
            barberId: barberId || null,
            day: dayStart.toLocaleDateString("es-MX"),
            time: formatTime12h(scheduledAt),
            scheduledAt,
            durationMin,
            status: "PENDING",
            priceChargedCents: service?.priceCents,
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function updateBooking(bookingId, slug, { customerName, customerPhone, serviceId, barberId }) {
    await requirePermission("CITAS", "edit");
    if (!customerName?.trim()) throw new Error("El nombre del cliente es obligatorio");
    const service = serviceId ? await prisma.service.findUnique({ where: { id: serviceId } }) : null;

    await prisma.booking.update({
        where: { id: bookingId },
        data: {
            customerName: customerName.trim(),
            customerPhone: customerPhone?.trim() || "—",
            serviceId: service?.id ?? null,
            barberId: barberId || null,
            durationMin: service?.durationMin ?? undefined,
            priceChargedCents: service?.priceCents,
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function deleteBooking(bookingId, slug) {
    await requirePermission("CITAS", "delete");
    await prisma.booking.delete({ where: { id: bookingId } });
    revalidatePath(`/t/${slug}`);
}
