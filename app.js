// Fija la zona horaria real de la barbería sin importar en qué servidor corra el proceso
// (si no, "hoy" y el horario de atención se calculan mal cuando el servidor está en UTC).
process.env.TZ = 'America/Mexico_City'

import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot'
import { BaileysProvider } from '@builderbot/provider-baileys'
import { JsonFileDB } from '@builderbot/database-json'
import { fetchLatestBaileysVersion } from 'baileys'
import qrcodeTerminal from 'qrcode-terminal'
import {
    getFlowMessage,
    getActiveServices,
    getActiveProducts,
    getActivePromotions,
    getBookingsForDay,
    getBusinessHoursFor,
    checkOpenNow,
    getIgnoredNumbers,
    saveBooking,
    setTenantWhatsappNumber,
    centsToText,
    getBookingsNeedingReminder,
    markReminderSent,
    getTenantId,
} from './lib/tenant.js'
import { notifyNewBooking, notifyConnectionLost } from './dashboard/lib/push.js'
import { parseTimeText, parseDayChoice, matchServiceChoice, findCatalogMatch } from './lib/parsing.js'
import { findConflict, findNearestAvailableSlots, isWithinBusinessHours, formatTime12h, formatMinutesLabel } from './dashboard/lib/scheduling.js'

const PORT = process.env.PORT ?? 3008

const buildServicesText = async () => {
    const intro = await getFlowMessage('SERVICES_INTRO', '💈 *Nuestros servicios:*')
    const services = await getActiveServices()
    const serviceLines = services.map((s, i) => `${i + 1}. ${s.name} — ${centsToText(s.priceCents)} (${s.durationMin} min)`)
    const promos = await getActivePromotions()
    const promoLines = promos.length ? ['', '🔥 *Promociones:*', ...promos.map((p) => `• ${p.text}`)] : []
    return [intro, '', ...serviceLines, ...promoLines, '', 'Escribe *agendar* si deseas reservar una cita.'].join('\n')
}

/**
 * Flujo de contacto: entrega el número de administración configurado por el tenant.
 */
const flowContacto = addKeyword(['3', 'contacto', 'ayuda', 'asesor'])
    .addAnswer(null, null, async (ctx, { flowDynamic }) => {
        const text = await getFlowMessage('CONTACT', 'Contacta a administración.')
        await flowDynamic(text)
    })

/**
 * Flujo de servicios: arma la lista de servicios, precios y promociones del tenant.
 */
const flowServicios = addKeyword(['2', 'servicios', 'precios'])
    .addAnswer(null, null, async (ctx, { flowDynamic }) => {
        await flowDynamic(await buildServicesText())
    })

/**
 * Flujo de precios puntuales: si preguntan por un producto/servicio específico, responde
 * con su precio real de la base de datos (coincidencia de texto, no IA). Si no reconoce
 * ningún nombre, cae de vuelta a la lista completa.
 */
const flowPrecioEspecifico = addKeyword([
    'cuanto cuesta', 'cuánto cuesta', 'cuanto vale', 'cuánto vale', 'costo de', 'precio de', 'que precio tiene', 'qué precio tiene',
])
    .addAnswer(null, null, async (ctx, { flowDynamic }) => {
        const [services, products] = await Promise.all([getActiveServices(), getActiveProducts()])
        const match = findCatalogMatch(ctx.body, services, products)
        if (match) {
            await flowDynamic(`💈 *${match.name}* (${match.type}): ${centsToText(match.priceCents)}`)
            return
        }
        await flowDynamic(await buildServicesText())
    })

/**
 * Flujo de citas: pide servicio, día (hoy/mañana) y hora — validando que no choque con
 * otra cita ya agendada, respetando el horario real de esa barbería, y sugiriendo horas
 * libres cuando hay un choque o la hora pedida está fuera de horario.
 */
const flowCitas = addKeyword(['1', 'agendar', 'cita', 'reservar'])
    .addAnswer(null, null, async (ctx, { flowDynamic, endFlow }) => {
        const { open, hoursText } = await checkOpenNow()
        if (!open) {
            const closedText = await getFlowMessage('CLOSED', `Ahora mismo estamos cerrados (hoy ${hoursText}). Escríbenos cuando abramos y con gusto te agendamos.`)
            return endFlow(closedText)
        }

        const services = await getActiveServices()
        if (services.length === 0) {
            return endFlow('Por ahora no tenemos servicios configurados. Contáctanos directamente para agendar.')
        }
        const lines = services.map((s, i) => `${i + 1}. ${s.name} — ${centsToText(s.priceCents)} (${s.durationMin} min)`)
        await flowDynamic(['💈 ¿Qué servicio te gustaría agendar?', '', ...lines].join('\n'))
    })
    .addAnswer(null, { capture: true }, async (ctx, { state, fallBack }) => {
        const services = await getActiveServices()
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
    .addAnswer(null, null, async (ctx, { flowDynamic }) => {
        await flowDynamic('📅 ¿Para hoy o mañana? (Responde 1 para hoy, 2 para mañana)')
    })
    .addAnswer(null, { capture: true }, async (ctx, { state, fallBack }) => {
        const day = parseDayChoice(ctx.body)
        if (day === null) return fallBack('No entendí. Responde 1 para hoy o 2 para mañana.')
        await state.update({ dayOffset: day })
    })
    .addAnswer(null, null, async (ctx, { state, flowDynamic }) => {
        const { dayOffset } = state.getMyState()
        const dayStart = new Date()
        dayStart.setDate(dayStart.getDate() + dayOffset)
        dayStart.setHours(0, 0, 0, 0)
        const dayHours = await getBusinessHoursFor(dayStart)

        if (dayHours.isClosed) {
            await flowDynamic(`Ese día no abrimos. ¿Quieres intentar con otro día? Escribe *agendar* de nuevo.`)
            return
        }
        await flowDynamic(`🕒 ¿A qué hora? Ese día atendemos de ${formatMinutesLabel(dayHours.openMin)} a ${formatMinutesLabel(dayHours.closeMin)} (ej: "3:30 pm").`)
    })
    .addAnswer(null, { capture: true }, async (ctx, { state, fallBack }) => {
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

        const dayHours = await getBusinessHoursFor(dayStart)
        if (!isWithinBusinessHours(scheduledAt, durationMin, dayHours)) {
            return fallBack(`Esa hora está fuera de nuestro horario (${formatMinutesLabel(dayHours.openMin)} a ${formatMinutesLabel(dayHours.closeMin)}). ¿A qué otra hora te gustaría?`)
        }

        const existing = await getBookingsForDay(dayStart)
        const conflict = findConflict(scheduledAt, durationMin, existing)
        if (conflict) {
            const alternatives = findNearestAvailableSlots(scheduledAt, durationMin, existing, dayHours)
            const suggestion = alternatives.length
                ? `¿Qué tal a las ${alternatives.map(formatTime12h).join(' o a las ')}?`
                : 'No encuentro otro horario libre cerca ese día — prueba otro día.'
            return fallBack(`ⓘ ${formatTime12h(scheduledAt)} ya está ocupado. ${suggestion}`)
        }

        await state.update({ scheduledAt: scheduledAt.toISOString() })
    })
    .addAnswer(null, null, async (ctx, { state, flowDynamic, endFlow }) => {
        const { serviceName, priceCents, durationMin, scheduledAt, serviceId } = state.getMyState()
        const when = new Date(scheduledAt)

        // Si la base de datos falla justo aquí (ej. se cayó la conexión un instante), avisamos
        // en vez de dejar al cliente sin respuesta pensando que su cita ya quedó agendada.
        try {
            await saveBooking({
                customerPhone: ctx.from,
                serviceId: serviceId ?? undefined,
                durationMin,
                priceChargedCents: priceCents ?? undefined,
                scheduledAt: when,
                day: when.toLocaleDateString('es-MX'),
                time: formatTime12h(when),
            })
        } catch (err) {
            console.error('❌ No se pudo guardar la cita:', err)
            return endFlow('Tuvimos un problema guardando tu cita. Por favor intenta de nuevo en un momento, o contáctanos directo.')
        }

        const tenantId = await getTenantId()
        notifyNewBooking(tenantId, { when, serviceName }).catch((err) => console.error('❌ No se pudo enviar la notificación push:', err))

        const confirmText = await getFlowMessage('BOOKING_CONFIRMED', 'Te esperamos.')
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

/**
 * Flujo de bienvenida: responde a saludos con el menú, o con el aviso de "cerrado" si
 * están fuera del horario configurado por la barbería.
 */
const flowBienvenida = addKeyword(EVENTS.WELCOME)
    .addAnswer(null, null, async (ctx, { flowDynamic }) => {
        const { open, hoursText } = await checkOpenNow()
        if (!open) {
            const closedText = await getFlowMessage('CLOSED', `Ahora mismo estamos cerrados (hoy ${hoursText}). Escríbenos cuando abramos.`)
            await flowDynamic(closedText)
            return
        }
        const text = await getFlowMessage(
            'WELCOME',
            '👋 ¡Hola! ¿En qué podemos ayudarte?\n\n1. Agendar cita\n2. Ver servicios\n3. Contacto'
        )
        await flowDynamic(text)
    })

const getLatestVersion = async () => {
    try {
        const timeout = new Promise((resolve) => setTimeout(() => resolve(undefined), 5000))
        const fetched = fetchLatestBaileysVersion().then((r) => r.version)
        return await Promise.race([fetched, timeout])
    } catch {
        return undefined
    }
}

const main = async () => {
    const version = await getLatestVersion()

    const adapterDB = new JsonFileDB({ filename: 'db.json' })
    const adapterFlow = createFlow([flowBienvenida, flowServicios, flowPrecioEspecifico, flowCitas, flowContacto])
    // Todos los flujos de arriba solo hablan con el `provider` de builderbot, nunca
    // directo con Baileys. El día que se necesite migrar a la API oficial de Meta,
    // basta con cambiar esta línea por `createProvider(MetaProvider, {...})` usando
    // el paquete `@builderbot/provider-meta` (ya publicado, misma versión que el
    // resto de builderbot) — ningún flujo de arriba necesita reescribirse.
    const adapterProvider = createProvider(BaileysProvider, version ? { version } : {})

    adapterProvider.on('require_action', (data) => {
        const qr = data?.payload?.qr
        if (!qr) return
        console.log('\n📲 Escanea este código QR con WhatsApp (Ajustes > Dispositivos vinculados):\n')
        qrcodeTerminal.generate(qr, { small: true })
    })

    adapterProvider.on('host', async (host) => {
        if (host?.phone) await setTenantWhatsappNumber(host.phone)
    })

    // El proveedor ya reintenta reconectar solo (con backoff); esto solo nos avisa cuando
    // se le acabaron los intentos, para no quedarnos sin saber que el bot dejó de contestar.
    adapterProvider.on('auth_failure', async (payload) => {
        console.error('⚠️ El bot perdió la conexión con WhatsApp:', payload)
        try {
            const tenantId = await getTenantId()
            await notifyConnectionLost(tenantId)
        } catch (err) {
            console.error('❌ No se pudo avisar de la desconexión:', err)
        }
    })

    const initialIgnored = await getIgnoredNumbers()
    const bot = await createBot(
        {
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
        },
        { blackList: initialIgnored }
    )

    // Sincroniza cada minuto la lista de números ignorados (por si se edita desde el dashboard
    // mientras el bot ya está corriendo, sin necesidad de reiniciar el proceso).
    setInterval(async () => {
        try {
            const current = new Set(await getIgnoredNumbers())
            const active = new Set(bot.dynamicBlacklist.getList())
            for (const phone of current) if (!active.has(phone)) bot.dynamicBlacklist.add(phone)
            for (const phone of active) if (!current.has(phone)) bot.dynamicBlacklist.remove(phone)
        } catch (err) {
            console.error('❌ No se pudo sincronizar la lista de contactos ignorados:', err)
        }
    }, 60_000)

    // Recordatorio de cita ~1h antes, por WhatsApp.
    setInterval(async () => {
        try {
            const bookings = await getBookingsNeedingReminder()
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
    console.log(`✅ Bot corriendo en el puerto ${PORT} (tenant: ${process.env.TENANT_SLUG ?? 'sable-barber-studio'})`)
}

process.on('unhandledRejection', (err) => {
    console.error('❌ Error no controlado (unhandledRejection):', err)
})

process.on('uncaughtException', (err) => {
    console.error('❌ Error no controlado (uncaughtException):', err)
})

main()
