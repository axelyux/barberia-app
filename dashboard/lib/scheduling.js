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
export function findConflict(candidateStart, durationMin, existingBookings, excludeId = null) {
    const [cStart, cEnd] = getBookingRange(candidateStart, durationMin);
    for (const b of existingBookings) {
        if (!b.scheduledAt || b.id === excludeId) continue;
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
    const { stepMin = 30, maxSlots = 3, minNoticeMin = 0, now = new Date() } = options;
    if (!dayHours || dayHours.isClosed) return [];

    const slots = [];
    const duration = durationMin || 30;
    for (let m = dayHours.openMin; m + duration <= dayHours.closeMin && slots.length < maxSlots; m += stepMin) {
        const candidate = new Date(dayStart);
        candidate.setHours(0, m, 0, 0);
        if (!meetsMinimumNotice(candidate, minNoticeMin, now)) continue;
        if (findConflict(candidate, duration, existingBookings)) continue;
        slots.push(candidate);
    }
    return slots;
}

export const formatTime12h = (date) =>
    new Date(date).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/^0/, "");
