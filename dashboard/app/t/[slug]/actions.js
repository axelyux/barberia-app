"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { validateBookingAvailability, formatTime12h } from "@/lib/scheduling";
import { findOwnedOrThrow, updateOwned, deleteOwned } from "@/lib/tenant-guard";
import { problem } from "@/lib/action-result";

// El panel manda el día como fecha de calendario ("2026-09-12"). Se arma en el marco UTC,
// el mismo en el que se guardan las horas de las citas (ver la convención en lib/scheduling.js).
function dayKeyToUTC(dayKey) {
    const [y, m, d] = String(dayKey).split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) {
        // Tolera el formato viejo (instante ISO completo) por si queda alguna pantalla abierta.
        const fallback = new Date(dayKey);
        return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate()));
    }
    return new Date(Date.UTC(y, m - 1, d));
}

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
    const dayStart = dayKeyToUTC(dateISO);
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

// Citas que el CLIENTE canceló por WhatsApp desde cierto momento. Alimenta el contador
// rojo de la pestaña Agenda: el barbero está cortando, no viendo la pantalla, y enterarse
// a tiempo es lo que le da chance de meter a alguien más en ese hueco.
//
// Solo mira las últimas 24 h: una cancelación de hace tres días ya no es noticia, y así el
// contador no se vuelve un número enorme que nadie limpia.
export async function getRecentCancellations(slug, sinceISO) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "view");
    const unDiaAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const desde = sinceISO ? new Date(sinceISO) : unDiaAtras;

    const bookings = await prisma.booking.findMany({
        where: {
            tenantId,
            status: "CANCELLED",
            cancelledByCustomer: true,
            cancelledAt: { gte: desde > unDiaAtras ? desde : unDiaAtras },
        },
        include: { service: true },
        orderBy: { cancelledAt: "desc" },
        take: 20,
    });

    return bookings.map((b) => ({
        id: b.id,
        customerName: b.customerName,
        serviceName: b.service?.name ?? null,
        scheduledAt: b.scheduledAt?.toISOString() ?? null,
        cancelledAt: b.cancelledAt?.toISOString() ?? null,
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
    // cancelledByCustomer se queda en false: la canceló la propia barbería desde el panel,
    // así que no tiene caso avisarle de algo que acaba de hacer.
    await updateOwned("booking", bookingId, tenantId, { status: "CANCELLED", cancelledAt: new Date() }, "Cita no encontrada");
    revalidatePath(`/t/${slug}`);
}

export async function createBooking(slug, { customerName, customerPhone, serviceId, barberId, dateISO, hour, minute }) {
    const { tenantId, timeZone } = await requireTenantSession(slug, "CITAS", "add");
    if (!customerName?.trim()) return problem("El nombre del cliente es obligatorio.");

    const dayStart = dayKeyToUTC(dateISO);
    const scheduledAt = new Date(dayStart);
    scheduledAt.setUTCHours(hour, minute, 0, 0);

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
                    timeZone,
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
                        day: dayStart.toLocaleDateString("es-MX", { timeZone: "UTC" }),
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
    const { tenantId, timeZone } = await requireTenantSession(slug, "CITAS", "edit");
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
                        timeZone,
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
