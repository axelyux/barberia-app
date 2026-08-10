// Proceso de UNA barbería usando la Cloud API oficial de Meta, en vez de Baileys.
// Se identifica por METATENANT_SLUG (no TENANT_SLUG, para no chocar con app.js/Baileys
// si algún día ambos corren en la misma máquina durante una migración gradual).
//
// A diferencia de Baileys, aquí Meta solo permite UNA url de webhook por App —
// por eso este proceso no expone su puerto directo a internet: el enrutador
// (webhook-router.js) es quien recibe el webhook público y le reenvía a este
// proceso por su puerto local, según el phone_number_id del mensaje.
process.env.TZ = 'America/Mexico_City'

import { createBot, createProvider, createFlow, addKeyword, MemoryDB } from '@builderbot/bot'
import { MetaProvider } from '@builderbot/provider-meta'
import { PrismaClient } from '@prisma/client'
import {
    getTenant,
    getFlowMessage,
    getActiveServices,
    getActiveProducts,
    getActivePromotions,
    getBookingsForDay,
    getBusinessHoursFor,
    checkOpenNow,
    getIgnoredNumbers,
    saveBooking,
    centsToText,
    getBookingsNeedingReminder,
    markReminderSent,
} from './lib/tenant.js'
import { parseTimeText, parseDayChoice, matchServiceChoice, findCatalogMatch } from './lib/parsing.js'
import {
    findConflict,
    findNearestAvailableSlots,
    isWithinBusinessHours,
    meetsMinimumNotice,
    buildAvailableSlots,
    formatTime12h,
    formatMinutesLabel,
} from './dashboard/lib/scheduling.js'

const prisma = new PrismaClient()
const TENANT_SLUG = process.env.METATENANT_SLUG
if (!TENANT_SLUG) {
    console.error('❌ Falta METATENANT_SLUG (slug de la barbería que corre en este proceso).')
    process.exit(1)
}

const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } })
if (!tenant) {
    console.error(`❌ No existe ninguna barbería con slug "${TENANT_SLUG}".`)
    process.exit(1)
}
if (!tenant.metaPhoneNumberId || !tenant.metaAccessToken || !tenant.metaPort) {
    console.error(`❌ La barbería "${TENANT_SLUG}" no tiene configurados metaPhoneNumberId/metaAccessToken/metaPort.`)
    process.exit(1)
}
const tenantId = tenant.id
const PORT = tenant.metaPort

// ---- Los mismos flujos de conversación que app.js (Baileys), pero pasando
// tenantId explícito en cada llamada a lib/tenant.js, porque este proceso solo
// atiende A ESTA barbería (el enrutador ya se encargó de mandarle solo lo suyo).

const buildServicesText = async () => {
    const intro = await getFlowMessage('SERVICES_INTRO', '💈 *Nuestros servicios:*', tenantId)
    const services = await getActiveServices(tenantId)
    const serviceLines = services.map((s, i) => `${i + 1}. ${s.name} — ${centsToText(s.priceCents)} (${s.durationMin} min)`)
    const promos = await getActivePromotions(tenantId)
    const promoLines = promos.length ? ['', '🔥 *Promociones:*', ...promos.map((p) => `• ${p.text}`)] : []
    return [intro, '', ...serviceLines, ...promoLines, '', 'Escribe *agendar* si deseas reservar una cita.'].join('\n')
}

// Nota: el disparador de bienvenida usa palabras clave explícitas, no EVENTS.WELCOME —
// con el proveedor de Meta ese evento automático no se dispara (ver hallazgo de la sesión
// de pruebas). Con Baileys (app.js) sí funciona EVENTS.WELCOME, así que allá se deja igual.
// Importante: aquí se usa addAction (no addAnswer(null, null, cb)) para toda la lógica
// dinámica. Con el proveedor de Meta, el patrón addAnswer con respuesta nula nunca
// ejecuta su callback (probado a fondo: los mensajes con texto fijo sí respondían y
// los de callback jamás, ni siquiera imprimían un console.log). addAction es la API
// correcta para "ejecuta código y responde con texto calculado".
// Los títulos de los botones son también las palabras clave que disparan cada flujo:
// WhatsApp devuelve el título del botón como texto del mensaje. Por eso NO se usan
// números sueltos ("1", "2", "3") como palabras clave: chocaban con las respuestas
// numéricas de los pasos de captura y disparaban dos flujos a la vez.
const BTN_AGENDAR = 'Agendar cita'
const BTN_SERVICIOS = 'Ver servicios'
const BTN_CONTACTO = 'Contacto'

const flowBienvenida = addKeyword(['hola', 'ola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'hello', 'menu', 'inicio'])
    .addAction(async (ctx, { flowDynamic }) => {
        const { open, hoursText } = await checkOpenNow(tenantId)
        if (!open) {
            const closedText = await getFlowMessage('CLOSED', `Ahora mismo estamos cerrados (hoy ${hoursText}). Escríbenos cuando abramos.`, tenantId)
            await flowDynamic(closedText)
            return
        }
        const text = await getFlowMessage('WELCOME', '👋 ¡Hola! ¿En qué podemos ayudarte?', tenantId)
        await flowDynamic([
            {
                body: text,
                buttons: [{ body: BTN_AGENDAR }, { body: BTN_SERVICIOS }, { body: BTN_CONTACTO }],
            },
        ])
    })

const flowServicios = addKeyword(['servicios', 'precios', 'catalogo'])
    .addAction(async (ctx, { flowDynamic }) => {
        await flowDynamic(await buildServicesText())
    })

const flowPrecioEspecifico = addKeyword([
    'cuanto cuesta', 'cuánto cuesta', 'cuanto vale', 'cuánto vale', 'costo de', 'precio de', 'que precio tiene', 'qué precio tiene',
])
    .addAction(async (ctx, { flowDynamic }) => {
        const [services, products] = await Promise.all([getActiveServices(tenantId), getActiveProducts(tenantId)])
        const match = findCatalogMatch(ctx.body, services, products)
        if (match) {
            await flowDynamic(`💈 *${match.name}* (${match.type}): ${centsToText(match.priceCents)}`)
            return
        }
        await flowDynamic(await buildServicesText())
    })

const flowContacto = addKeyword(['contacto', 'ayuda', 'asesor'])
    .addAction(async (ctx, { flowDynamic }) => {
        const text = await getFlowMessage('CONTACT', 'Contacta a administración.', tenantId)
        await flowDynamic(text)
    })

const flowCitas = addKeyword(['agendar', 'cita', 'reservar', 'agendar cita'])
    .addAction(async (ctx, { provider, endFlow }) => {
        const { open, hoursText } = await checkOpenNow(tenantId)
        if (!open) {
            const closedText = await getFlowMessage('CLOSED', `Ahora mismo estamos cerrados (hoy ${hoursText}). Escríbenos cuando abramos y con gusto te agendamos.`, tenantId)
            return endFlow(closedText)
        }
        const services = await getActiveServices(tenantId)
        if (services.length === 0) {
            return endFlow('Por ahora no tenemos servicios configurados. Contáctanos directamente para agendar.')
        }

        // Lista interactiva: el cliente elige de un desplegable en vez de escribir un número.
        // WhatsApp devuelve el "id" de la fila, por eso usamos "svc_<id>" y no un número suelto.
        // Límites de WhatsApp: título de fila 24 caracteres, descripción 72, botón 20.
        await provider.sendList(ctx.from, {
            body: { text: '💈 ¿Qué servicio te gustaría agendar?' },
            action: {
                button: 'Ver servicios',
                sections: [
                    {
                        title: 'Servicios',
                        rows: services.slice(0, 10).map((s) => ({
                            id: `svc_${s.id}`,
                            title: s.name.slice(0, 24),
                            description: `${centsToText(s.priceCents)} · ${s.durationMin} min`.slice(0, 72),
                        })),
                    },
                ],
            },
        })
    })
    .addAction({ capture: true }, async (ctx, { state, fallBack }) => {
        const services = await getActiveServices(tenantId)
        const service = matchServiceChoice(ctx.body, services)
        if (!service) {
            return fallBack('No reconocí ese servicio. Responde con el número de la lista (ej: "1").')
        }
        await state.update({
            serviceId: service.id,
            serviceName: service.name,
            durationMin: service.durationMin,
            priceCents: service.priceCents,
        })
    })
    .addAction(async (ctx, { flowDynamic }) => {
        const askDay = await getFlowMessage('BOOKING_ASK_DAY', '📅 ¿Para cuándo la quieres?', tenantId)
        await flowDynamic([{ body: askDay, buttons: [{ body: 'Hoy' }, { body: 'Mañana' }] }])
    })
    .addAction({ capture: true }, async (ctx, { state, fallBack }) => {
        const day = parseDayChoice(ctx.body)
        if (day === null) return fallBack('No entendí. Elige *Hoy* o *Mañana* con los botones.')
        await state.update({ dayOffset: day })
    })
    .addAction(async (ctx, { state, provider, endFlow }) => {
        const { dayOffset, durationMin } = state.getMyState()
        const dayStart = new Date()
        dayStart.setDate(dayStart.getDate() + dayOffset)
        dayStart.setHours(0, 0, 0, 0)
        const dayHours = await getBusinessHoursFor(dayStart, tenantId)

        if (dayHours.isClosed) {
            return endFlow('Ese día no abrimos. Escribe *agendar* de nuevo para elegir otro día.')
        }

        // Se ofrecen horarios ya libres y que respetan la anticipación mínima, para que el
        // cliente no pueda elegir una hora que ya pasó o que no alcanza a atenderse.
        const { bookingMinNoticeMin } = await getTenant(tenantId)
        const existing = await getBookingsForDay(dayStart, tenantId)
        const slots = buildAvailableSlots(dayStart, durationMin, existing, dayHours, {
            minNoticeMin: bookingMinNoticeMin,
            maxSlots: 10,
        })

        if (slots.length === 0) {
            return endFlow(
                `Ya no tenemos horarios disponibles para ese día (atendemos de ${formatMinutesLabel(dayHours.openMin)} a ${formatMinutesLabel(dayHours.closeMin)}). Escribe *agendar* para intentar con otro día.`
            )
        }

        // Lista de horarios en vez de texto libre: cada opción manda un id exacto
        // ("time_2130"), así no hay forma de malinterpretar lo que el cliente quiso decir.
        const askTime = await getFlowMessage('BOOKING_ASK_TIME', '🕒 ¿A qué hora te queda mejor?', tenantId)
        await provider.sendList(ctx.from, {
            body: { text: askTime },
            footer: { text: 'Solo se muestran horarios disponibles' },
            action: {
                button: 'Ver horarios',
                sections: [
                    {
                        title: 'Horarios libres',
                        rows: slots.map((s) => ({
                            id: `time_${String(s.getHours()).padStart(2, '0')}${String(s.getMinutes()).padStart(2, '0')}`,
                            title: formatTime12h(s),
                        })),
                    },
                ],
            },
        })
    })
    .addAction({ capture: true }, async (ctx, { state, fallBack }) => {
        const { dayOffset, durationMin } = state.getMyState()
        const parsed = parseTimeText(ctx.body)
        if (!parsed) {
            return fallBack('No entendí la hora. Escríbela así: "3:30 pm" o "15:30".')
        }

        const dayStart = new Date()
        dayStart.setDate(dayStart.getDate() + dayOffset)
        dayStart.setHours(0, 0, 0, 0)
        const scheduledAt = new Date(dayStart)
        scheduledAt.setHours(parsed.hour, parsed.minute, 0, 0)

        const dayHours = await getBusinessHoursFor(dayStart, tenantId)
        const { bookingMinNoticeMin } = await getTenant(tenantId)

        // Si el cliente no dijo am/pm y la hora ya pasó, se asume que se refería a la tarde/noche
        // ("9:00" a las 8 pm es 9 pm, no 9 am). Sin esto se agendaban citas en el pasado.
        if (!parsed.explicitMeridiem && !meetsMinimumNotice(scheduledAt, bookingMinNoticeMin) && parsed.hour < 12) {
            scheduledAt.setHours(parsed.hour + 12, parsed.minute, 0, 0)
        }

        if (!meetsMinimumNotice(scheduledAt, bookingMinNoticeMin)) {
            const minAviso = bookingMinNoticeMin > 0 ? ` Necesitamos al menos ${bookingMinNoticeMin} minutos de anticipación.` : ''
            return fallBack(`Esa hora ya pasó o es demasiado pronto.${minAviso} ¿A qué otra hora te gustaría?`)
        }

        if (!isWithinBusinessHours(scheduledAt, durationMin, dayHours)) {
            return fallBack(`Esa hora está fuera de nuestro horario (${formatMinutesLabel(dayHours.openMin)} a ${formatMinutesLabel(dayHours.closeMin)}) o el servicio no alcanza a terminar antes de cerrar. ¿A qué otra hora te gustaría?`)
        }

        const existing = await getBookingsForDay(dayStart, tenantId)
        const conflict = findConflict(scheduledAt, durationMin, existing)
        if (conflict) {
            const alternatives = findNearestAvailableSlots(scheduledAt, durationMin, existing, dayHours).filter((d) =>
                meetsMinimumNotice(d, bookingMinNoticeMin)
            )
            const suggestion = alternatives.length
                ? `¿Qué tal a las ${alternatives.map(formatTime12h).join(' o a las ')}?`
                : 'No encuentro otro horario libre cerca ese día — prueba otro día.'
            return fallBack(`ⓘ ${formatTime12h(scheduledAt)} ya está ocupado. ${suggestion}`)
        }

        await state.update({ scheduledAt: scheduledAt.toISOString() })
    })
    .addAction(async (ctx, { state, flowDynamic, endFlow }) => {
        const { serviceName, priceCents, durationMin, scheduledAt, serviceId } = state.getMyState()
        const when = new Date(scheduledAt)

        try {
            await saveBooking(
                {
                    customerPhone: ctx.from,
                    serviceId: serviceId ?? undefined,
                    durationMin,
                    priceChargedCents: priceCents ?? undefined,
                    scheduledAt: when,
                    day: when.toLocaleDateString('es-MX'),
                    time: formatTime12h(when),
                },
                tenantId
            )
        } catch (err) {
            console.error('❌ No se pudo guardar la cita:', err)
            return endFlow('Tuvimos un problema guardando tu cita. Por favor intenta de nuevo en un momento, o contáctanos directo.')
        }

        const confirmText = await getFlowMessage('BOOKING_CONFIRMED', 'Te esperamos.', tenantId)
        const serviceLine = serviceName ? `💈 Servicio: ${serviceName} — ${centsToText(priceCents)}` : null

        await flowDynamic(
            [
                '✅ *¡Cita confirmada!*',
                '',
                `📅 Día: ${when.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}`,
                `🕒 Hora: ${formatTime12h(when)}`,
                ...(serviceLine ? [serviceLine] : []),
                '',
                confirmText,
            ].join('\n')
        )
    })

const main = async () => {
    const adapterDB = new MemoryDB()
    const adapterFlow = createFlow([flowBienvenida, flowServicios, flowPrecioEspecifico, flowCitas, flowContacto])
    const adapterProvider = createProvider(MetaProvider, {
        jwtToken: tenant.metaAccessToken,
        numberId: tenant.metaPhoneNumberId,
        verifyToken: process.env.META_VERIFY_TOKEN ?? 'barbersaas2026',
        version: 'v25.0',
    })

    const initialIgnored = await getIgnoredNumbers(tenantId)
    const bot = await createBot(
        { flow: adapterFlow, provider: adapterProvider, database: adapterDB },
        { blackList: initialIgnored }
    )

    setInterval(async () => {
        try {
            const current = new Set(await getIgnoredNumbers(tenantId))
            const active = new Set(bot.dynamicBlacklist.getList())
            for (const phone of current) if (!active.has(phone)) bot.dynamicBlacklist.add(phone)
            for (const phone of active) if (!current.has(phone)) bot.dynamicBlacklist.remove(phone)
        } catch (err) {
            console.error('❌ No se pudo sincronizar la lista de contactos ignorados:', err)
        }
    }, 60_000)

    setInterval(async () => {
        try {
            const bookings = await getBookingsNeedingReminder(tenantId)
            for (const booking of bookings) {
                const when = formatTime12h(new Date(booking.scheduledAt))
                const serviceLine = booking.service ? ` (${booking.service.name})` : ''
                await adapterProvider.sendMessage(
                    booking.customerPhone,
                    `⏰ Recordatorio: tienes una cita hoy a las ${when}${serviceLine}. ¡Te esperamos!`
                )
                await markReminderSent(booking.id)
            }
        } catch (err) {
            console.error('❌ No se pudieron enviar los recordatorios de citas:', err)
        }
    }, 5 * 60_000)

    bot.httpServer(PORT)
    console.log(`✅ Bot de Meta (${TENANT_SLUG}) corriendo en el puerto local ${PORT} — el enrutador le reenvía el tráfico.`)
}

process.on('unhandledRejection', (err) => {
    console.error('❌ Error no controlado (unhandledRejection):', err)
})

process.on('uncaughtException', (err) => {
    console.error('❌ Error no controlado (uncaughtException):', err)
})

main()
