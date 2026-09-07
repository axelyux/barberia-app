// Lógica pura de horarios: sin Prisma, sin Next — la usan tanto el bot (WhatsApp) como el dashboard.

// Se usa solo si por algún motivo no hay horario configurado para ese día.
export const FALLBACK_HOURS = { isClosed: false, openMin: 9 * 60, closeMin: 20 * 60 };

export const getBookingRange = (scheduledAt, durationMin) => {
    const start = new Date(scheduledAt);
    const end = new Date(start.getTime() + (durationMin || 30) * 60000);
    return [start, end];
};

export const minutesSinceMidnight = (date) => date.getHours() * 60 + date.getMinutes();

export const formatMinutesLabel = (min) => {
    const d = new Date();
    d.setHours(Math.floor(min / 60), min % 60, 0, 0);
    return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/^0/, "");
};

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// Devuelve la cita existente con la que choca el horario propuesto, o null si está libre.
// Si `barberId` viene definido, solo se compara contra citas de ESE barbero (dos barberos
// distintos pueden atender clientes distintos a la misma hora); si no viene (ej. el bot de
// WhatsApp, que nunca asigna barbero), se mantiene el choque a nivel de toda la barbería.
export function findConflict(candidateStart, durationMin, existingBookings, excludeId = null, barberId = null) {
    const [cStart, cEnd] = getBookingRange(candidateStart, durationMin);
    for (const b of existingBookings) {
        if (!b.scheduledAt || b.id === excludeId) continue;
        if (barberId && b.barberId && b.barberId !== barberId) continue;
        const [bStart, bEnd] = getBookingRange(b.scheduledAt, b.durationMin || 30);
        if (overlaps(cStart, cEnd, bStart, bEnd)) return b;
    }
    return null;
}

// ¿La barbería está abierta y el servicio cabe completo antes de cerrar? `dayHours` = { isClosed, openMin, closeMin }.
export function isWithinBusinessHours(candidateStart, durationMin, dayHours = FALLBACK_HOURS) {
    if (!dayHours || dayHours.isClosed) return false;
    const [start, end] = getBookingRange(candidateStart, durationMin);
    const open = new Date(start);
    open.setHours(0, dayHours.openMin, 0, 0);
    const close = new Date(start);
    close.setHours(0, dayHours.closeMin, 0, 0);
    return start >= open && end <= close;
}

// Busca huecos libres del tamaño pedido el mismo día, empezando cerca de la hora deseada
// y alejándose en pasos de `stepMin` hasta encontrar `maxSuggestions` horarios libres.
export function findNearestAvailableSlots(candidateStart, durationMin, existingBookings, dayHours = FALLBACK_HOURS, options = {}) {
    const { stepMin = 30, maxSuggestions = 2 } = options;
    const found = [];
    for (let offset = stepMin; offset <= 6 * 60 && found.length < maxSuggestions; offset += stepMin) {
        for (const dir of [-1, 1]) {
            const candidate = new Date(candidateStart.getTime() + dir * offset * 60000);
            if (!isWithinBusinessHours(candidate, durationMin, dayHours)) continue;
            if (!findConflict(candidate, durationMin, existingBookings)) {
                if (!found.some((d) => d.getTime() === candidate.getTime())) found.push(candidate);
            }
            if (found.length >= maxSuggestions) break;
        }
    }
    return found.sort((a, b) => Math.abs(a - candidateStart) - Math.abs(b - candidateStart)).slice(0, maxSuggestions);
}

// ¿La cita respeta la anticipación mínima de la barbería? Evita agendar en el pasado
// o "para ya mismo" cuando no hay margen para atender.
export function meetsMinimumNotice(candidateStart, minNoticeMin = 0, now = new Date()) {
    const earliest = new Date(now.getTime() + (minNoticeMin || 0) * 60000);
    return new Date(candidateStart) >= earliest;
}

// Horarios libres del día, ya filtrados por horario de atención, citas existentes y
// anticipación mínima. Se usa para ofrecerle botones al cliente en vez de texto libre.
export function buildAvailableSlots(dayStart, durationMin, existingBookings, dayHours = FALLBACK_HOURS, options = {}) {
    const { stepMin = 30, maxSlots = 3, minNoticeMin = 0, now = new Date(), barberId = null } = options;
    if (!dayHours || dayHours.isClosed) return [];

    const slots = [];
    const duration = durationMin || 30;
    for (let m = dayHours.openMin; m + duration <= dayHours.closeMin && slots.length < maxSlots; m += stepMin) {
        const candidate = new Date(dayStart);
        candidate.setHours(0, m, 0, 0);
        if (!meetsMinimumNotice(candidate, minNoticeMin, now)) continue;
        if (findConflict(candidate, duration, existingBookings, null, barberId)) continue;
        slots.push(candidate);
    }
    return slots;
}

export const formatTime12h = (date) =>
    new Date(date).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/^0/, "");

// Punto único de validación de disponibilidad, usado tanto por el panel (createBooking/
// updateBooking en dashboard/app/t/[slug]/actions.js) como por el bot de WhatsApp
// (whatsapp-meta-bot.js), para que agendar desde cualquiera de los dos lados respete
// exactamente las mismas reglas: horario de atención, anticipación mínima y choque con
// otra cita (del mismo barbero si se especifica uno).
//
// Recibe el cliente de Prisma por parámetro en vez de importar uno propio: el panel usa
// el singleton de "@/lib/db" y el bot su propio PrismaClient — esta función es agnóstica
// de cuál le pasen, así ambos comparten una sola implementación real.
//
// Devuelve { ok: true } o { ok: false, error, alternatives } (alternatives = horarios
// cercanos libres, para que el llamador arme su propio mensaje de sugerencia).
export async function validateBookingAvailability({
    prisma,
    tenantId,
    scheduledAt,
    durationMin,
    barberId = null,
    minNoticeMin = 0,
    excludeBookingId = null,
}) {
    const dayStart = new Date(scheduledAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [dayHours, existing] = await Promise.all([
        prisma.businessHour.findUnique({ where: { tenantId_weekday: { tenantId, weekday: dayStart.getDay() } } }),
        prisma.booking.findMany({
            where: {
                tenantId,
                scheduledAt: { gte: dayStart, lt: dayEnd },
                status: { not: "CANCELLED" },
                id: excludeBookingId ? { not: excludeBookingId } : undefined,
            },
        }),
    ]);
    const hours = dayHours ?? FALLBACK_HOURS;

    if (!meetsMinimumNotice(scheduledAt, minNoticeMin)) {
        return { ok: false, error: "Esa hora ya pasó o es demasiado pronto.", alternatives: [] };
    }
    if (!isWithinBusinessHours(scheduledAt, durationMin, hours)) {
        return { ok: false, error: "Esa hora está fuera del horario de atención.", alternatives: [] };
    }
    const conflict = findConflict(scheduledAt, durationMin, existing, excludeBookingId, barberId);
    if (conflict) {
        const alternatives = findNearestAvailableSlots(scheduledAt, durationMin, existing, hours).filter((d) =>
            meetsMinimumNotice(d, minNoticeMin)
        );
        return { ok: false, error: "Esa hora ya está ocupada.", alternatives };
    }
    return { ok: true };
}
