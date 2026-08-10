import { PrismaClient } from '@prisma/client'
import { isWithinBusinessHours, FALLBACK_HOURS, formatMinutesLabel } from '../dashboard/lib/scheduling.js'

const prisma = new PrismaClient()
const TENANT_SLUG = process.env.TENANT_SLUG ?? 'sable-barber-studio'

let cachedTenantId = null

// Resuelve el tenant vía TENANT_SLUG (proceso de un solo tenant, ej. app.js con Baileys).
// Todas las funciones de abajo aceptan un tenantId explícito como primer argumento —
// úsalo cuando un mismo proceso atiende a varias barberías (ej. el bot multi-tenant de
// Meta, donde el tenant depende de qué número recibió el mensaje, no de una env var fija).
const requireTenantId = async () => {
    if (cachedTenantId) return cachedTenantId
    const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } })
    if (!tenant) {
        throw new Error(`No existe ningún tenant con slug "${TENANT_SLUG}". Corre "npm run db:seed" o créalo en la base de datos.`)
    }
    cachedTenantId = tenant.id
    return cachedTenantId
}

const resolveTenantId = async (tenantId) => tenantId ?? (await requireTenantId())

export const getTenant = async (tenantId) => {
    const id = await resolveTenantId(tenantId)
    return prisma.tenant.findUnique({ where: { id } })
}

export const getTenantByMetaPhoneNumberId = async (metaPhoneNumberId) => {
    return prisma.tenant.findUnique({ where: { metaPhoneNumberId } })
}

export const isTenantActive = async (tenantId) => {
    const tenant = await getTenant(tenantId)
    return tenant.status !== 'PAUSED'
}

export const getFlowMessage = async (key, fallback = '', tenantId) => {
    const id = await resolveTenantId(tenantId)
    const message = await prisma.flowMessage.findUnique({
        where: { tenantId_key: { tenantId: id, key } },
    })
    return message?.text ?? fallback
}

export const getActiveServices = async (tenantId) => {
    const id = await resolveTenantId(tenantId)
    return prisma.service.findMany({
        where: { tenantId: id, active: true },
        orderBy: { sortOrder: 'asc' },
    })
}

export const getActiveProducts = async (tenantId) => {
    const id = await resolveTenantId(tenantId)
    return prisma.product.findMany({
        where: { tenantId: id, active: true },
        orderBy: { sortOrder: 'asc' },
    })
}

export const getActivePromotions = async (tenantId) => {
    const id = await resolveTenantId(tenantId)
    const now = new Date()
    return prisma.promotion.findMany({
        where: {
            tenantId: id,
            active: true,
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        },
    })
}

export const getBookingsForDay = async (dayStart, tenantId) => {
    const id = await resolveTenantId(tenantId)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    return prisma.booking.findMany({
        where: { tenantId: id, scheduledAt: { gte: dayStart, lt: dayEnd }, status: { not: 'CANCELLED' } },
    })
}

export const getBusinessHoursFor = async (date, tenantId) => {
    const id = await resolveTenantId(tenantId)
    const row = await prisma.businessHour.findUnique({
        where: { tenantId_weekday: { tenantId: id, weekday: date.getDay() } },
    })
    return row ?? FALLBACK_HOURS
}

// ¿Está la barbería abierta justo ahora? Usa la hora real del proceso (America/Mexico_City).
export const checkOpenNow = async (tenantId) => {
    const now = new Date()
    const hours = await getBusinessHoursFor(now, tenantId)
    const open = isWithinBusinessHours(now, 1, hours)
    const hoursText = hours.isClosed ? 'cerrado hoy' : `de ${formatMinutesLabel(hours.openMin)} a ${formatMinutesLabel(hours.closeMin)}`
    return { open, hoursText }
}

export const saveBooking = async ({ customerPhone, serviceId, durationMin, priceChargedCents, scheduledAt, day, time }, tenantId) => {
    const id = await resolveTenantId(tenantId)
    return prisma.booking.create({
        data: { tenantId: id, customerPhone, serviceId, durationMin, priceChargedCents, scheduledAt, day, time },
    })
}

// Citas pendientes que empiezan entre 55 y 65 minutos a partir de ahora y a las que no se les
// ha mandado recordatorio todavía. Se revisa cada 5 min, así que esta ventana de 10 min asegura
// que cada cita se detecte al menos una vez sin mandar el recordatorio dos veces.
export const getBookingsNeedingReminder = async (tenantId) => {
    const id = await resolveTenantId(tenantId)
    const now = new Date()
    const from = new Date(now.getTime() + 55 * 60 * 1000)
    const to = new Date(now.getTime() + 65 * 60 * 1000)
    return prisma.booking.findMany({
        where: { tenantId: id, status: 'PENDING', reminderSentAt: null, scheduledAt: { gte: from, lte: to } },
        include: { service: true },
    })
}

export const markReminderSent = async (bookingId) => {
    await prisma.booking.update({ where: { id: bookingId }, data: { reminderSentAt: new Date() } })
}

export const getTenantId = (tenantId) => resolveTenantId(tenantId)

// Números que el bot debe ignorar por completo (ej. contactos personales, si la barbería usa su número propio).
export const getIgnoredNumbers = async (tenantId) => {
    const id = await resolveTenantId(tenantId)
    const rows = await prisma.ignoredContact.findMany({ where: { tenantId: id } })
    return rows.map((r) => r.phone)
}

export const setTenantWhatsappNumber = async (number, tenantId) => {
    const id = await resolveTenantId(tenantId)
    await prisma.tenant.update({ where: { id }, data: { whatsappNumber: number } })
}

export const centsToText = (cents) => `$${(cents / 100).toFixed(0)}`
