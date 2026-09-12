// Lógica pura de horarios: sin Prisma, sin Next — la usan tanto el bot (WhatsApp) como el dashboard.

// Se usa solo si por algún motivo no hay horario configurado para ese día.
export const FALLBACK_HOURS = { isClosed: false, openMin: 9 * 60, closeMin: 20 * 60 };

// Zona por defecto para una barbería que todavía no eligió la suya (Tenant.timeZone).
export const DEFAULT_TIME_ZONE = "America/Mexico_City";

// Zonas horarias que cubren todo México. Si algún día se vende fuera del país, aquí se
// agregan las que hagan falta: el resto del código ya no asume ninguna en particular.
export const TIME_ZONES = [
    { value: "America/Mexico_City", label: "Centro (CDMX, Guadalajara, Monterrey)" },
    { value: "America/Cancun", label: "Sureste (Cancún, Quintana Roo)" },
    { value: "America/Chihuahua", label: "Pacífico (Chihuahua)" },
    { value: "America/Hermosillo", label: "Sonora (Hermosillo)" },
    { value: "America/Mazatlan", label: "Pacífico (Mazatlán, La Paz)" },
    { value: "America/Tijuana", label: "Noroeste (Tijuana, Mexicali)" },
];

// ---------------------------------------------------------------------------------------
// CONVENCIÓN DE HORARIOS
//
// Una hora de cita ("el viernes a las 3 p.m.") es hora de PARED de la barbería, y se guarda
// escribiendo esos mismos componentes en UTC: las 3 p.m. se guardan como 15:00Z.
//
// El marco es UTC a propósito, no la hora local del proceso. Vercel corre cada función
// serverless en UTC e ignora el process.env.TZ del proyecto — y eso ya cambió una vez sin
// avisar, dejando citas guardadas con 6 horas de desfase respecto a las nuevas. Usando
// siempre getUTC*/setUTC*, la interpretación no depende de dónde ni cómo corra el servidor.
//
// Por eso toda esta lógica usa métodos UTC. Para saber qué hora es AHORA en la barbería se
// usa zonedNow(timeZone), que traduce el instante real a la hora de pared de esa zona,
// expresada en el mismo marco.
// ---------------------------------------------------------------------------------------

// "Ahora" en la hora de pared de la barbería, expresado en el marco UTC descrito arriba.
export function zonedNow(timeZone = DEFAULT_TIME_ZONE) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")));
}

// Fecha de calendario ("2026-09-12") de la barbería para un instante real dado. Es el
// criterio para decidir a qué día pertenece una venta: una venta de las 7 p.m. es de ese
// día, aunque en UTC ya sea el día siguiente.
export function tenantDayKey(instant, timeZone = DEFAULT_TIME_ZONE) {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}

// Instante real en el que empieza un día de calendario de la barbería. Con esto se arman
// los rangos de los reportes: "del 1 al 12" significa del 1 a las 00:00 hora de la
// barbería, no a las 00:00 UTC.
export function tenantDayStartInstant(dayKey, timeZone = DEFAULT_TIME_ZONE) {
    const [y, m, d] = String(dayKey).split("-").map((n) => parseInt(n, 10));
    // Se parte de una estimación en UTC y se corrige con el desfase real de esa zona ESE
    // día (así el horario de verano no lo descuadra).
    const estimado = Date.UTC(y, m - 1, d, 0, 0, 0);
    const leidoEnZona = new Date(estimado);
    const partes = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(leidoEnZona);
    const g = (t) => Number(partes.find((p) => p.type === t)?.value);
    const desfase = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - estimado;
    return new Date(estimado - desfase);
}

export const getBookingRange = (scheduledAt, durationMin) => {
    const start = new Date(scheduledAt);
    const end = new Date(start.getTime() + (durationMin || 30) * 60000);
    return [start, end];
};

export const minutesSinceMidnight = (date) => date.getUTCHours() * 60 + date.getUTCMinutes();

export const formatMinutesLabel = (min) => {
    const d = new Date(Date.UTC(2000, 0, 1, Math.floor(min / 60), min % 60, 0, 0));
    return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).replace(/^0/, "");
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
    open.setUTCHours(0, dayHours.openMin, 0, 0);
    const close = new Date(start);
    close.setUTCHours(0, dayHours.closeMin, 0, 0);
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
export function meetsMinimumNotice(candidateStart, minNoticeMin = 0, now = zonedNow()) {
    const earliest = new Date(now.getTime() + (minNoticeMin || 0) * 60000);
    return new Date(candidateStart) >= earliest;
}

// Horarios libres del día, ya filtrados por horario de atención, citas existentes y
// anticipación mínima. Se usa para ofrecerle botones al cliente en vez de texto libre.
export function buildAvailableSlots(dayStart, durationMin, existingBookings, dayHours = FALLBACK_HOURS, options = {}) {
    const { stepMin = 30, maxSlots = 3, minNoticeMin = 0, now = zonedNow(), barberId = null } = options;
    if (!dayHours || dayHours.isClosed) return [];

    const slots = [];
    const duration = durationMin || 30;
    for (let m = dayHours.openMin; m + duration <= dayHours.closeMin && slots.length < maxSlots; m += stepMin) {
        const candidate = new Date(dayStart);
        candidate.setUTCHours(0, m, 0, 0);
        if (!meetsMinimumNotice(candidate, minNoticeMin, now)) continue;
        if (findConflict(candidate, duration, existingBookings, null, barberId)) continue;
        slots.push(candidate);
    }
    return slots;
}

// timeZone "UTC" no significa "hora UTC": estas fechas ya traen la hora de pared de la
// barbería escrita en componentes UTC (ver la convención arriba), así que leerlas en UTC es
// justo lo que devuelve la hora que el cliente eligió.
export const formatTime12h = (date) =>
    new Date(date).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).replace(/^0/, "");

export const formatDayMonth = (date) =>
    new Date(date).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });

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
    timeZone = DEFAULT_TIME_ZONE,
}) {
    const dayStart = new Date(scheduledAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [dayHours, existing] = await Promise.all([
        prisma.businessHour.findUnique({ where: { tenantId_weekday: { tenantId, weekday: dayStart.getUTCDay() } } }),
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

    const ahoraEnLaBarberia = zonedNow(timeZone);
    if (!meetsMinimumNotice(scheduledAt, minNoticeMin, ahoraEnLaBarberia)) {
        // Se dice QUÉ entendió el sistema, no solo que no se puede: si la fecha/hora que
        // leyó no es la que el usuario eligió (por diferencias de zona horaria entre el
        // celular y el servidor), el desfase se ve de inmediato en el propio mensaje.
        const ahora = ahoraEnLaBarberia;
        const cuando = `${formatDayMonth(scheduledAt)} a las ${formatTime12h(scheduledAt)}`;
        const margen = minNoticeMin > 0 ? ` Hay que agendar con al menos ${minNoticeMin} minutos de anticipación.` : "";
        return {
            ok: false,
            error: `Estás agendando para el ${cuando}, y ahora son las ${formatTime12h(ahora)} del ${formatDayMonth(ahora)}.${margen}`,
            alternatives: [],
        };
    }
    if (!isWithinBusinessHours(scheduledAt, durationMin, hours)) {
        const horario = hours.isClosed
            ? "Ese día la barbería está cerrada."
            : `Ese día se atiende de ${formatMinutesLabel(hours.openMin)} a ${formatMinutesLabel(hours.closeMin)}.`;
        return {
            ok: false,
            error: `Las ${formatTime12h(scheduledAt)} quedan fuera del horario de atención. ${horario}`,
            alternatives: [],
        };
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
