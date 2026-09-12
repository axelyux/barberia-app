"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { validateBookingAvailability, formatTime12h } from "@/lib/scheduling";
import { findOwnedOrThrow, updateOwned, deleteOwned } from "@/lib/tenant-guard";
import { problem } from "@/lib/action-result";

// Devuelve el texto a mostrar, no un Error: estos son problemas que el usuario puede
// corregir (elegir otra hora), y los mensajes de los errores lanzados no sobreviven a
// producción — ver lib/action-result.js.
function conflictMessage({ error, alternatives }) {
    const suggestionText = alternatives?.length
        ? ` ¿Te sirve a las ${alternatives.map(formatTime12h).join(" o a las ")}?`
        : " No hay otro horario libre cerca ese día.";
    return `${error}${suggestionText}`;
}

// Reintenta una vez si Postgres detecta un conflicto de serialización entre dos
// solicitudes casi simultáneas para el mismo horario (ver sección "Concurrencia" del
// encargo) — evita la doble reserva sin construir un sistema de locks propio.
async function withSerializableRetry(fn) {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
            return await fn();
        }
        throw err;
    }
}

export async function getBookingsForDate(slug, dateISO) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "view");
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
    const { tenantId } = await requireTenantSession(slug, "CITAS", "edit");
    const booking = await findOwnedOrThrow("booking", bookingId, tenantId, "Cita no encontrada");

    const fullPrice = booking.priceChargedCents ?? 0;
    const paid = paymentStatus === "NO_PAGADO" ? 0 : paymentStatus === "PARCIAL" ? Math.max(0, Math.min(fullPrice, Math.round(amountPaidCents) || 0)) : fullPrice;

    await updateOwned("booking", bookingId, tenantId, {
        status: "COMPLETED",
        paymentMethod,
        paymentStatus,
        amountPaidCents: paid,
        completedAt: new Date(),
    });
    revalidatePath(`/t/${slug}`);
}

export async function cancelBooking(bookingId, slug) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "edit");
    await updateOwned("booking", bookingId, tenantId, { status: "CANCELLED" }, "Cita no encontrada");
    revalidatePath(`/t/${slug}`);
}

export async function createBooking(slug, { customerName, customerPhone, serviceId, barberId, dateISO, hour, minute }) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "add");
    if (!customerName?.trim()) return problem("El nombre del cliente es obligatorio.");

    const dayStart = new Date(dateISO);
    dayStart.setHours(0, 0, 0, 0);
    const scheduledAt = new Date(dayStart);
    scheduledAt.setHours(hour, minute, 0, 0);

    const service = serviceId ? await findOwnedOrThrow("service", serviceId, tenantId, "Servicio no encontrado") : null;
    const barber = barberId ? await findOwnedOrThrow("barber", barberId, tenantId, "Barbero no encontrado") : null;
    const durationMin = service?.durationMin ?? 30;

    const conflict = await withSerializableRetry(() =>
        prisma.$transaction(
            async (tx) => {
                const result = await validateBookingAvailability({
                    prisma: tx,
                    tenantId,
                    scheduledAt,
                    durationMin,
                    barberId: barber?.id ?? null,
                });
                // Salir de la transacción devolviendo el motivo (en vez de lanzarlo) deja
                // la validación intacta: no se creó nada, y el texto sí llega a pantalla.
                if (!result.ok) return conflictMessage(result);

                await tx.booking.create({
                    data: {
                        tenantId,
                        customerName: customerName.trim(),
                        customerPhone: customerPhone?.trim() || "—",
                        serviceId: service?.id,
                        barberId: barber?.id ?? null,
                        day: dayStart.toLocaleDateString("es-MX"),
                        time: formatTime12h(scheduledAt),
                        scheduledAt,
                        durationMin,
                        status: "PENDING",
                        priceChargedCents: service?.priceCents,
                    },
                });
                return null;
            },
            { isolation: Prisma.TransactionIsolationLevel.Serializable }
        )
    );
    if (conflict) return problem(conflict);
    revalidatePath(`/t/${slug}`);
}

export async function updateBooking(bookingId, slug, { customerName, customerPhone, serviceId, barberId }) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "edit");
    if (!customerName?.trim()) return problem("El nombre del cliente es obligatorio.");

    const existing = await findOwnedOrThrow("booking", bookingId, tenantId, "Cita no encontrada");
    const service = serviceId ? await findOwnedOrThrow("service", serviceId, tenantId, "Servicio no encontrado") : null;
    const barber = barberId ? await findOwnedOrThrow("barber", barberId, tenantId, "Barbero no encontrado") : null;
    const durationMin = service?.durationMin ?? existing.durationMin;

    // A diferencia del comportamiento anterior (que no validaba nada al editar), reusamos
    // la misma validación que al crear — cambiar de servicio o de barbero puede cambiar
    // la duración o dejar la cita chocando con otra que antes no chocaba.
    if (existing.scheduledAt) {
        const conflict = await withSerializableRetry(() =>
            prisma.$transaction(
                async (tx) => {
                    const result = await validateBookingAvailability({
                        prisma: tx,
                        tenantId,
                        scheduledAt: existing.scheduledAt,
                        durationMin,
                        barberId: barber?.id ?? null,
                        excludeBookingId: bookingId,
                    });
                    if (!result.ok) return conflictMessage(result);

                    await tx.booking.update({
                        where: { id: bookingId },
                        data: {
                            customerName: customerName.trim(),
                            customerPhone: customerPhone?.trim() || "—",
                            serviceId: service?.id ?? null,
                            barberId: barber?.id ?? null,
                            durationMin,
                            priceChargedCents: service?.priceCents ?? existing.priceChargedCents,
                        },
                    });
                    return null;
                },
                { isolation: Prisma.TransactionIsolationLevel.Serializable }
            )
        );
        if (conflict) return problem(conflict);
    } else {
        await updateOwned("booking", bookingId, tenantId, {
            customerName: customerName.trim(),
            customerPhone: customerPhone?.trim() || "—",
            serviceId: service?.id ?? null,
            barberId: barber?.id ?? null,
            durationMin,
            priceChargedCents: service?.priceCents ?? existing.priceChargedCents,
        });
    }
    revalidatePath(`/t/${slug}`);
}

export async function deleteBooking(bookingId, slug) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "delete");
    await deleteOwned("booking", bookingId, tenantId, "Cita no encontrada");
    revalidatePath(`/t/${slug}`);
}
