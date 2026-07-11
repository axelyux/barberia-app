import { PrismaClient } from '@prisma/client'
import { isWithinBusinessHours, FALLBACK_HOURS, formatMinutesLabel } from '../dashboard/lib/scheduling.js'

const prisma = new PrismaClient()
const TENANT_SLUG = process.env.TENANT_SLUG ?? 'sable-barber-studio'

let cachedTenantId = null

const requireTenantId = async () => {
    if (cachedTenantId) return cachedTenantId
    const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } })
    if (!tenant) {
        throw new Error(`No existe ningún tenant con slug "${TENANT_SLUG}". Corre "npm run db:seed" o créalo en la base de datos.`)
    }
    cachedTenantId = tenant.id
    return cachedTenantId
}

export const getTenant = async () => {
    const tenantId = await requireTenantId()
    return prisma.tenant.findUnique({ where: { id: tenantId } })
}

export const isTenantActive = async () => {
    const tenant = await getTenant()
    return tenant.status !== 'PAUSED'
}

export const getFlowMessage = async (key, fallback = '') => {
    const tenantId = await requireTenantId()
    const message = await prisma.flowMessage.findUnique({
        where: { tenantId_key: { tenantId, key } },
    })
    return message?.text ?? fallback
}

export const getActiveServices = async () => {
    const tenantId = await requireTenantId()
    return prisma.service.findMany({
        where: { tenantId, active: true },
        orderBy: { sortOrder: 'asc' },
    })
}

export const getActiveProducts = async () => {
    const tenantId = await requireTenantId()
    return prisma.product.findMany({
        where: { tenantId, active: true },
        orderBy: { sortOrder: 'asc' },
    })
}

export const getActivePromotions = async () => {
    const tenantId = await requireTenantId()
    const now = new Date()
    return prisma.promotion.findMany({
        where: {
            tenantId,
            active: true,
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        },
    })
}

export const getBookingsForDay = async (dayStart) => {
    const tenantId = await requireTenantId()
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    return prisma.booking.findMany({
        where: { tenantId, scheduledAt: { gte: dayStart, lt: dayEnd }, status: { not: 'CANCELLED' } },
    })
}

export const getBusinessHoursFor = async (date) => {
    const tenantId = await requireTenantId()
    const row = await prisma.businessHour.findUnique({
        where: { tenantId_weekday: { tenantId, weekday: date.getDay() } },
    })
    return row ?? FALLBACK_HOURS
}

// ¿Está la barbería abierta justo ahora? Usa la hora real del proceso (America/Mexico_City).
export const checkOpenNow = async () => {
    const now = new Date()
    const hours = await getBusinessHoursFor(now)
    const open = isWithinBusinessHours(now, 1, hours)
    const hoursText = hours.isClosed ? 'cerrado hoy' : `de ${formatMinutesLabel(hours.openMin)} a ${formatMinutesLabel(hours.closeMin)}`
    return { open, hoursText }
}

export const saveBooking = async ({ customerPhone, serviceId, durationMin, priceChargedCents, scheduledAt, day, time }) => {
    const tenantId = await requireTenantId()
    return prisma.booking.create({
        data: { tenantId, customerPhone, serviceId, durationMin, priceChargedCents, scheduledAt, day, time },
    })
}

// Números que el bot debe ignorar por completo (ej. contactos personales, si la barbería usa su número propio).
export const getIgnoredNumbers = async () => {
    const tenantId = await requireTenantId()
    const rows = await prisma.ignoredContact.findMany({ where: { tenantId } })
    return rows.map((r) => r.phone)
}

export const setTenantWhatsappNumber = async (number) => {
    const tenantId = await requireTenantId()
    await prisma.tenant.update({ where: { id: tenantId }, data: { whatsappNumber: number } })
}

export const centsToText = (cents) => `$${(cents / 100).toFixed(0)}`
