// Lógica de conversación del bot de WhatsApp, para correr como función serverless de
// Vercel (dashboard/app/api/whatsapp/webhook/route.js) en vez de un proceso persistente.
// Mismo flujo que whatsapp-meta-bot.js (VPS, respaldo opcional), pero sin @builderbot/bot:
// el progreso de cada conversación se lee/escribe en Postgres (ConversationState) en
// cada mensaje, nunca en memoria — así no hace falta un proceso que se quede prendido.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendText as sendTextRaw, sendButtons as sendButtonsRaw, sendList as sendListRaw } from "@/lib/whatsapp-graph";
import { notifyHumanRequested } from "@/lib/push";
import {
    validateBookingAvailability,
    buildAvailableSlots,
    meetsMinimumNotice,
    isWithinBusinessHours,
    formatTime12h,
    formatMinutesLabel,
    FALLBACK_HOURS,
    zonedNow,
} from "@/lib/scheduling";
import { parseTimeText, parseDayChoice, matchServiceChoice, matchBarberChoice, findCatalogMatch } from "../../lib/parsing.js";

const stripAccents = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u").replace(/ñ/g, "n")
        .trim();

const matchesAny = (normalized, keywords) => keywords.some((k) => normalized.includes(k));

const centsToText = (cents) => `$${(cents / 100).toFixed(0)}`;

const CONVERSATION_TTL_MS = 2 * 60 * 60 * 1000;
const PAUSED_NOTICE = "Este servicio está temporalmente pausado. Contacta directamente a la barbería.";

// --- Utilidades de datos (tenant-scoped, usan el prisma compartido de @/lib/db) ---

const normalizePhone = (phone) => {
    let digits = String(phone ?? "").replace(/\D/g, "");
    if (digits.startsWith("521") && digits.length === 13) digits = digits.slice(3);
    else if (digits.startsWith("52") && digits.length === 12) digits = digits.slice(2);
    return digits;
};

async function logMessage(tenantId, phone, direction, body, sentByName) {
    try {
        await prisma.whatsappMessage.create({
            data: {
                tenantId,
                phone: normalizePhone(phone),
                direction,
                body: String(body ?? "").slice(0, 4000),
                sentByName: sentByName?.trim() || null,
            },
        });
    } catch (err) {
        console.error("❌ [whatsapp-flow] No se pudo registrar el mensaje:", err);
    }
}

async function sendText(tenant, to, text) {
    await sendTextRaw(tenant, to, text);
    await logMessage(tenant.id, to, "OUT", text);
}

async function sendButtons(tenant, to, text, buttons) {
    await sendButtonsRaw(tenant, to, text, buttons);
    await logMessage(tenant.id, to, "OUT", text);
}

async function sendList(tenant, to, opts) {
    await sendListRaw(tenant, to, opts);
    await logMessage(tenant.id, to, "OUT", opts?.body);
}

async function findOrCreateCustomer(tx, tenantId, phone, name) {
    const normalized = normalizePhone(phone);
    const existing = await tx.customer.findUnique({ where: { tenantId_phone: { tenantId, phone: normalized } } });
    if (existing) return existing;
    return tx.customer.create({ data: { tenantId, phone: normalized, name: name?.trim() || normalized } });
}

async function getFlowMessage(tenantId, key, fallback) {
    const row = await prisma.flowMessage.findUnique({ where: { tenantId_key: { tenantId, key } } });
    return row?.text ?? fallback;
}

async function getBusinessHoursFor(tenantId, date) {
    const row = await prisma.businessHour.findUnique({ where: { tenantId_weekday: { tenantId, weekday: date.getDay() } } });
    return row ?? FALLBACK_HOURS;
}

async function checkOpenNow(tenantId) {
    const now = zonedNow();
    const hours = await getBusinessHoursFor(tenantId, now);
    const open = isWithinBusinessHours(now, 1, hours);
    const hoursText = hours.isClosed ? "cerrado hoy" : `de ${formatMinutesLabel(hours.openMin)} a ${formatMinutesLabel(hours.closeMin)}`;
    return { open, hoursText };
}

async function getBookingsForDay(tenantId, dayStart) {
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return prisma.booking.findMany({
        where: { tenantId, scheduledAt: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
    });
}

async function buildServicesText(tenantId) {
    const intro = await getFlowMessage(tenantId, "SERVICES_INTRO", "💈 *Nuestros servicios:*");
    const services = await prisma.service.findMany({ where: { tenantId, active: true }, orderBy: { sortOrder: "asc" } });
    const serviceLines = services.map((s, i) => `${i + 1}. ${s.name} — ${centsToText(s.priceCents)} (${s.durationMin} min)`);
    const promos = await prisma.promotion.findMany({
        where: {
            tenantId,
            active: true,
            OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }],
        },
    });
    const promoLines = promos.length ? ["", "🔥 *Promociones:*", ...promos.map((p) => `• ${p.text}`)] : [];
    return [intro, "", ...serviceLines, ...promoLines, "", "Escribe *agendar* si deseas reservar una cita."].join("\n");
}

async function setStep(tenantId, phone, step, data) {
    const normalized = normalizePhone(phone);
    await prisma.conversationState.upsert({
        where: { tenantId_phone: { tenantId, phone: normalized } },
        update: { step, data },
        create: { tenantId, phone: normalized, step, data },
    });
}

async function clearStep(tenantId, phone) {
    await prisma.conversationState.deleteMany({ where: { tenantId, phone: normalizePhone(phone) } });
}

async function getStep(tenantId, phone) {
    const row = await prisma.conversationState.findUnique({
        where: { tenantId_phone: { tenantId, phone: normalizePhone(phone) } },
    });
    if (!row) return null;
    if (Date.now() - row.updatedAt.getTime() > CONVERSATION_TTL_MS) return null;
    return row;
}

// --- Pasos del flujo de agendar cita ---

async function askServiceStep(tenant, from) {
    const { open, hoursText } = await checkOpenNow(tenant.id);
    if (!open) {
        const closedText = await getFlowMessage(
            tenant.id,
            "CLOSED",
            `Ahora mismo estamos cerrados (hoy ${hoursText}). Escríbenos cuando abramos y con gusto te agendamos.`
        );
        await sendText(tenant, from, closedText);
        return;
    }
    const services = await prisma.service.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { sortOrder: "asc" } });
    if (services.length === 0) {
        await sendText(tenant, from, "Por ahora no tenemos servicios configurados. Contáctanos directamente para agendar.");
        return;
    }
    await sendList(tenant, from, {
        body: "💈 ¿Qué servicio te gustaría agendar?",
        buttonLabel: "Ver servicios",
        sections: [
            {
                title: "Servicios",
                rows: services.slice(0, 10).map((s) => ({
                    id: `svc_${s.id}`,
                    title: s.name.slice(0, 24),
                    description: `${centsToText(s.priceCents)} · ${s.durationMin} min`.slice(0, 72),
                })),
            },
        ],
    });
    await setStep(tenant.id, from, "ask_service", {});
}

async function askDayStep(tenant, from, data) {
    const askDay = await getFlowMessage(tenant.id, "BOOKING_ASK_DAY", "📅 ¿Para cuándo la quieres?");
    await sendButtons(tenant, from, askDay, [{ body: "Hoy" }, { body: "Mañana" }]);
    await setStep(tenant.id, from, "ask_day", data);
}

async function handleServiceCapture(tenant, from, body) {
    const services = await prisma.service.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { sortOrder: "asc" } });
    const service = matchServiceChoice(body, services);
    if (!service) {
        await sendText(tenant, from, "No reconocí ese servicio. Responde con el número de la lista (ej: \"1\").");
        return;
    }
    const data = { serviceId: service.id, serviceName: service.name, durationMin: service.durationMin, priceCents: service.priceCents };

    // Con un solo barbero activo no hace falta preguntar — se asigna directo. Con 2+, se le
    // pregunta al cliente (o "cualquiera"), para que dos barberos puedan atender clientes
    // distintos a la misma hora sin que el bot marque falso choque de horario.
    const barbers = await prisma.barber.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" } });
    if (barbers.length === 1) {
        return askDayStep(tenant, from, { ...data, barberId: barbers[0].id, barberName: barbers[0].name });
    }
    if (barbers.length === 0) {
        return askDayStep(tenant, from, data);
    }

    await sendList(tenant, from, {
        body: "💇 ¿Con cuál barbero te gustaría tu cita?",
        buttonLabel: "Ver barberos",
        sections: [
            {
                title: "Barberos",
                rows: [
                    ...barbers.slice(0, 9).map((b) => ({ id: `brb_${b.id}`, title: b.name.slice(0, 24) })),
                    { id: "brb_any", title: "Cualquiera disponible" },
                ],
            },
        ],
    });
    await setStep(tenant.id, from, "ask_barber", data);
}

async function handleBarberCapture(tenant, from, body, data) {
    const barbers = await prisma.barber.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" } });
    const choice = matchBarberChoice(body, barbers);
    if (choice === undefined) {
        await sendText(tenant, from, "No reconocí a ese barbero. Responde con el número de la lista.");
        return;
    }
    await askDayStep(tenant, from, choice ? { ...data, barberId: choice.id, barberName: choice.name } : data);
}

async function handleDayCapture(tenant, from, body, data) {
    const day = parseDayChoice(body);
    if (day === null) {
        await sendText(tenant, from, "No entendí. Elige *Hoy* o *Mañana* con los botones.");
        return;
    }
    const dayStart = zonedNow();
    dayStart.setDate(dayStart.getDate() + day);
    dayStart.setHours(0, 0, 0, 0);
    const dayHours = await getBusinessHoursFor(tenant.id, dayStart);

    if (dayHours.isClosed) {
        await sendText(tenant, from, "Ese día no abrimos. Escribe *agendar* de nuevo para elegir otro día.");
        await clearStep(tenant.id, from);
        return;
    }

    const existing = await getBookingsForDay(tenant.id, dayStart);
    const slots = buildAvailableSlots(dayStart, data.durationMin, existing, dayHours, {
        minNoticeMin: tenant.bookingMinNoticeMin,
        maxSlots: 10,
        barberId: data.barberId ?? null,
    });
    if (slots.length === 0) {
        await sendText(
            tenant,
            from,
            `Ya no tenemos horarios disponibles para ese día (atendemos de ${formatMinutesLabel(dayHours.openMin)} a ${formatMinutesLabel(dayHours.closeMin)}). Escribe *agendar* para intentar con otro día.`
        );
        await clearStep(tenant.id, from);
        return;
    }

    const askTime = await getFlowMessage(tenant.id, "BOOKING_ASK_TIME", "🕒 ¿A qué hora te queda mejor?");
    await sendList(tenant, from, {
        body: askTime,
        footer: "Solo se muestran horarios disponibles",
        buttonLabel: "Ver horarios",
        sections: [
            {
                title: "Horarios libres",
                rows: slots.map((s) => ({
                    id: `time_${String(s.getHours()).padStart(2, "0")}${String(s.getMinutes()).padStart(2, "0")}`,
                    title: formatTime12h(s),
                })),
            },
        ],
    });
    await setStep(tenant.id, from, "ask_time", { ...data, dayOffset: day });
}

async function handleTimeCapture(tenant, from, body, data, pushName) {
    const parsed = parseTimeText(body);
    if (!parsed) {
        await sendText(tenant, from, "No entendí la hora. Escríbela así: \"3:30 pm\" o \"15:30\".");
        return;
    }

    const dayStart = zonedNow();
    dayStart.setDate(dayStart.getDate() + data.dayOffset);
    dayStart.setHours(0, 0, 0, 0);
    const scheduledAt = new Date(dayStart);
    scheduledAt.setHours(parsed.hour, parsed.minute, 0, 0);

    // Si no dijo am/pm y la hora ya no alcanza, se asume que quiso decir tarde/noche
    // ("9:00" a las 8pm es 9pm, no 9am) — evita agendar citas en el pasado.
    if (!parsed.explicitMeridiem && !meetsMinimumNotice(scheduledAt, tenant.bookingMinNoticeMin) && parsed.hour < 12) {
        scheduledAt.setHours(parsed.hour + 12, parsed.minute, 0, 0);
    }

    const check = await validateBookingAvailability({
        prisma,
        tenantId: tenant.id,
        scheduledAt,
        durationMin: data.durationMin,
        minNoticeMin: tenant.bookingMinNoticeMin,
        barberId: data.barberId ?? null,
    });
    if (!check.ok) {
        const suggestion = check.alternatives?.length
            ? `¿Qué tal a las ${check.alternatives.map(formatTime12h).join(" o a las ")}?`
            : "No encuentro otro horario libre cerca ese día — prueba otro día.";
        await sendText(tenant, from, `ⓘ ${check.error} ${suggestion}`);
        return;
    }

    await finalizeBooking(tenant, from, { ...data, scheduledAt }, pushName);
}

async function finalizeBooking(tenant, from, data, pushName) {
    const { serviceId, serviceName, priceCents, durationMin, scheduledAt, barberId, barberName } = data;
    const when = new Date(scheduledAt);

    try {
        await prisma.$transaction(
            async (tx) => {
                const check = await validateBookingAvailability({
                    prisma: tx,
                    tenantId: tenant.id,
                    scheduledAt: when,
                    durationMin,
                    minNoticeMin: tenant.bookingMinNoticeMin,
                    barberId: barberId ?? null,
                });
                if (!check.ok) throw new Error("SLOT_TAKEN");

                const customer = await findOrCreateCustomer(tx, tenant.id, from, pushName);
                await tx.booking.create({
                    data: {
                        tenantId: tenant.id,
                        customerPhone: customer.phone,
                        customerName: pushName?.trim() || customer.name,
                        customerId: customer.id,
                        serviceId: serviceId ?? undefined,
                        barberId: barberId ?? undefined,
                        durationMin,
                        priceChargedCents: priceCents ?? undefined,
                        scheduledAt: when,
                        day: when.toLocaleDateString("es-MX"),
                        time: formatTime12h(when),
                    },
                });
            },
            { isolation: Prisma.TransactionIsolationLevel.Serializable }
        );
    } catch (err) {
        await clearStep(tenant.id, from);
        if (err?.message === "SLOT_TAKEN" || err?.code === "P2034") {
            await sendText(tenant, from, "Justo se ocupó ese horario. Escribe *agendar* de nuevo para elegir otro.");
            return;
        }
        console.error("❌ [whatsapp-flow] No se pudo guardar la cita:", err);
        await sendText(tenant, from, "Tuvimos un problema guardando tu cita. Por favor intenta de nuevo en un momento, o contáctanos directo.");
        return;
    }

    await clearStep(tenant.id, from);
    const confirmText = await getFlowMessage(tenant.id, "BOOKING_CONFIRMED", "Te esperamos.");
    const serviceLine = serviceName ? `💈 Servicio: ${serviceName} — ${centsToText(priceCents)}` : null;
    const barberLine = barberName ? `✂️ Barbero: ${barberName}` : null;
    await sendText(
        tenant,
        from,
        [
            "✅ *¡Cita confirmada!*",
            "",
            `📅 Día: ${when.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}`,
            `🕒 Hora: ${formatTime12h(when)}`,
            ...(serviceLine ? [serviceLine] : []),
            ...(barberLine ? [barberLine] : []),
            "",
            confirmText,
        ].join("\n")
    );
}

// --- Flujos de entrada libre (sin captura activa) ---

const BTN_AGENDAR = "Agendar cita";
const BTN_SERVICIOS = "Ver servicios";
const BTN_CONTACTO = "Contacto";
const GREETING_KEYWORDS = ["hola", "ola", "buenas", "buen dia", "buenos dias", "hello", "menu", "inicio"];
const SERVICES_KEYWORDS = ["servicios", "precios", "catalogo"];
const PRICE_KEYWORDS = ["cuanto cuesta", "cuanto vale", "costo de", "precio de", "que precio tiene"];
const CONTACT_KEYWORDS = ["contacto", "ayuda", "asesor"];
const BOOKING_KEYWORDS = ["agendar", "cita", "reservar"];
const HUMAN_HANDOFF_KEYWORDS = [
    "hablar con alguien",
    "hablar con una persona",
    "hablar con un humano",
    "persona real",
    "agente humano",
    "necesito un humano",
    "quiero hablar con alguien",
    "quiero hablar con una persona",
];
const HUMAN_TAKEOVER_MS = 2 * 60 * 60 * 1000;

async function replyWelcome(tenant, from) {
    const { open, hoursText } = await checkOpenNow(tenant.id);
    if (!open) {
        const closedText = await getFlowMessage(tenant.id, "CLOSED", `Ahora mismo estamos cerrados (hoy ${hoursText}). Escríbenos cuando abramos.`);
        await sendText(tenant, from, closedText);
        return;
    }

    // Si el cliente tenía una cita a medio agendar, se lo recordamos en vez de que
    // sienta que se perdió su avance.
    const pending = await getStep(tenant.id, from);
    if (pending?.step && pending.step !== "done" && pending.data?.serviceName) {
        await sendText(tenant, from, `Vi que ya habías elegido *${pending.data.serviceName}*. Escribe *agendar* para continuar donde te quedaste.`);
    }

    const text = await getFlowMessage(tenant.id, "WELCOME", "👋 ¡Hola! ¿En qué podemos ayudarte?");
    await sendButtons(tenant, from, text, [{ body: BTN_AGENDAR }, { body: BTN_SERVICIOS }, { body: BTN_CONTACTO }]);
}

// --- Punto de entrada ---

export async function handleIncomingMessage({ tenant, from, body, pushName }) {
    await logMessage(tenant.id, from, "IN", body, pushName);

    if (tenant.status === "PAUSED") {
        await sendText(tenant, from, PAUSED_NOTICE);
        return;
    }

    const ignored = await prisma.ignoredContact.findUnique({
        where: { tenantId_phone: { tenantId: tenant.id, phone: normalizePhone(from) } },
    });
    if (ignored) return;

    // Si un barbero ya tomó la conversación manualmente desde la bandeja del panel, el
    // bot se calla por un rato para no interrumpir ni contestar encima de la persona real.
    const conversationRow = await prisma.conversationState.findUnique({
        where: { tenantId_phone: { tenantId: tenant.id, phone: normalizePhone(from) } },
    });
    if (conversationRow?.humanUntil && conversationRow.humanUntil.getTime() > Date.now()) {
        return;
    }

    const normalized = stripAccents(body);
    if (matchesAny(normalized, HUMAN_HANDOFF_KEYWORDS)) {
        const humanUntil = new Date(Date.now() + HUMAN_TAKEOVER_MS);
        await prisma.conversationState.upsert({
            where: { tenantId_phone: { tenantId: tenant.id, phone: normalizePhone(from) } },
            update: { humanUntil },
            create: { tenantId: tenant.id, phone: normalizePhone(from), humanUntil, data: {} },
        });
        await sendText(tenant, from, "🙋 Listo, ya le avisamos a alguien de nuestro equipo. En un momento te contestamos por aquí mismo.");
        await notifyHumanRequested(tenant.id, { customerName: pushName, phone: from });
        return;
    }

    const state = await getStep(tenant.id, from);
    if (state?.step === "ask_service") return handleServiceCapture(tenant, from, body);
    if (state?.step === "ask_barber") return handleBarberCapture(tenant, from, body, state.data);
    if (state?.step === "ask_day") return handleDayCapture(tenant, from, body, state.data);
    if (state?.step === "ask_time") return handleTimeCapture(tenant, from, body, state.data, pushName);

    if (matchesAny(normalized, GREETING_KEYWORDS)) return replyWelcome(tenant, from);
    if (matchesAny(normalized, SERVICES_KEYWORDS)) return sendText(tenant, from, await buildServicesText(tenant.id));
    if (matchesAny(normalized, PRICE_KEYWORDS)) {
        const [services, products] = await Promise.all([
            prisma.service.findMany({ where: { tenantId: tenant.id, active: true } }),
            prisma.product.findMany({ where: { tenantId: tenant.id, active: true } }),
        ]);
        const match = findCatalogMatch(body, services, products);
        if (match) return sendText(tenant, from, `💈 *${match.name}* (${match.type}): ${centsToText(match.priceCents)}`);
        return sendText(tenant, from, await buildServicesText(tenant.id));
    }
    if (matchesAny(normalized, CONTACT_KEYWORDS)) {
        return sendText(tenant, from, await getFlowMessage(tenant.id, "CONTACT", "Contacta a administración."));
    }
    if (matchesAny(normalized, BOOKING_KEYWORDS)) return askServiceStep(tenant, from);
    // Sin coincidencia: no se responde (mismo comportamiento que antes — no hay flujo de
    // respaldo registrado para mensajes que no calzan con ningún trigger).
}
