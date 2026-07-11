process.env.TZ = 'America/Mexico_City'

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../dashboard/lib/password.js'

const prisma = new PrismaClient()

const todayAt = (hour, minute) => {
    const d = new Date()
    d.setHours(hour, minute, 0, 0)
    return d
}

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000)
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000)
const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000)

const main = async () => {
    // ---------------------------------------------------------------
    // Tenant real: Sable Barber Studio
    // ---------------------------------------------------------------
    const sable = await prisma.tenant.upsert({
        where: { slug: 'sable-barber-studio' },
        update: { ownerName: 'Arman Grijalva' },
        create: {
            slug: 'sable-barber-studio',
            name: 'Sable Barber Studio',
            ownerName: 'Arman Grijalva',
            status: 'ACTIVE',
            planPriceCents: 20000,
            nextDueDate: daysFromNow(30),
        },
    })

    const [corte, barba, combo] = await Promise.all([
        prisma.service.findFirst({ where: { tenantId: sable.id, name: 'Corte' } }),
        prisma.service.findFirst({ where: { tenantId: sable.id, name: 'Barba' } }),
        prisma.service.findFirst({ where: { tenantId: sable.id, name: 'Combo (Corte + Barba)' } }),
    ])

    if (!corte || !barba || !combo) {
        await prisma.service.createMany({
            data: [
                { tenantId: sable.id, name: 'Corte', priceCents: 15000, durationMin: 30, sortOrder: 1 },
                { tenantId: sable.id, name: 'Barba', priceCents: 10000, durationMin: 20, sortOrder: 2 },
                { tenantId: sable.id, name: 'Combo (Corte + Barba)', priceCents: 22000, durationMin: 45, sortOrder: 3 },
            ],
        })
    }
    const services = await prisma.service.findMany({ where: { tenantId: sable.id } })
    const svc = (name) => services.find((s) => s.name === name)

    const flowMessages = [
        {
            key: 'WELCOME',
            text: [
                '👋 ¡Hola! Bienvenido a *Sable Barber Studio*.',
                '',
                '¿En qué podemos ayudarte hoy?',
                '',
                '1. Agendar cita',
                '2. Ver servicios',
                '3. Contacto',
                '',
                'Responde con el número de la opción que necesites.',
            ].join('\n'),
        },
        { key: 'SERVICES_INTRO', text: '💈 *Nuestros servicios:*' },
        { key: 'BOOKING_ASK_DAY', text: '📅 Vamos a agendar tu cita. ¿Qué día te gustaría venir?' },
        { key: 'BOOKING_ASK_TIME', text: '🕒 Perfecto. ¿A qué hora te gustaría tu cita?' },
        { key: 'BOOKING_CONFIRMED', text: 'Te esperamos en Sable Barber Studio. ¡Gracias por tu preferencia!' },
        { key: 'CONTACT', text: 'Si necesitas atención personalizada, puedes comunicarte con administración al número: 8333438501' },
        { key: 'CLOSED', text: '🕒 En este momento estamos cerrados. En cuanto abramos con gusto te atendemos — ¡gracias por tu paciencia!' },
    ]
    for (const msg of flowMessages) {
        await prisma.flowMessage.upsert({
            where: { tenantId_key: { tenantId: sable.id, key: msg.key } },
            update: { text: msg.text },
            create: { tenantId: sable.id, key: msg.key, text: msg.text },
        })
    }

    // Horario de atención (0=domingo … 6=sábado): lunes a sábado 9am-8pm, domingo cerrado.
    for (let weekday = 0; weekday <= 6; weekday++) {
        const isClosed = weekday === 0
        await prisma.businessHour.upsert({
            where: { tenantId_weekday: { tenantId: sable.id, weekday } },
            update: { isClosed, openMin: 9 * 60, closeMin: 20 * 60 },
            create: { tenantId: sable.id, weekday, isClosed, openMin: 9 * 60, closeMin: 20 * 60 },
        })
    }

    // Productos (para el módulo de ventas rápidas)
    const existingProducts = await prisma.product.findMany({ where: { tenantId: sable.id } })
    let [cera, shampoo, aceite] = ['Cera moldeadora', 'Shampoo anticaída', 'Aceite para barba'].map((n) =>
        existingProducts.find((p) => p.name === n)
    )
    if (!cera) cera = await prisma.product.create({ data: { tenantId: sable.id, name: 'Cera moldeadora', priceCents: 18000, stock: 12, sortOrder: 1 } })
    if (!shampoo) shampoo = await prisma.product.create({ data: { tenantId: sable.id, name: 'Shampoo anticaída', priceCents: 22000, stock: 8, sortOrder: 2 } })
    if (!aceite) aceite = await prisma.product.create({ data: { tenantId: sable.id, name: 'Aceite para barba', priceCents: 15000, stock: 15, sortOrder: 3 } })

    // Citas de hoy (borra las de hoy antes de re-sembrar, para poder correr el seed varias veces)
    const startOfToday = todayAt(0, 0)
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)
    await prisma.booking.deleteMany({
        where: { tenantId: sable.id, scheduledAt: { gte: startOfToday, lt: startOfTomorrow } },
    })

    const todaysBookings = [
        { name: 'Carlos Medina', phone: '5219981234567', service: corte, hour: 9, min: 0, status: 'COMPLETED' },
        { name: 'Jorge Ibarra', phone: '5219981234568', service: combo, hour: 9, min: 40, status: 'COMPLETED' },
        { name: 'Ricardo Paz', phone: '5219981234569', service: barba, hour: 10, min: 30, status: 'COMPLETED' },
        { name: 'Daniel Reyes', phone: '5219981234570', service: corte, hour: 11, min: 15, status: 'COMPLETED' },
        { name: 'Emilio Vidal', phone: '5219981234571', service: combo, hour: 12, min: 0, status: 'CANCELLED' },
        { name: 'Sergio Nava', phone: '5219981234572', service: corte, hour: 13, min: 0, status: 'COMPLETED' },
        { name: 'Iván Delgado', phone: '5219981234573', service: barba, hour: 14, min: 30, status: 'PENDING' },
        { name: 'Marco Vega', phone: '5219981234574', service: combo, hour: 16, min: 0, status: 'PENDING' },
    ]
    for (const b of todaysBookings) {
        const when = todayAt(b.hour, b.min)
        await prisma.booking.create({
            data: {
                tenantId: sable.id,
                customerName: b.name,
                customerPhone: b.phone,
                serviceId: b.service?.id,
                day: when.toLocaleDateString('es-MX'),
                time: when.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                scheduledAt: when,
                status: b.status,
                priceChargedCents: b.status === 'CANCELLED' ? null : b.service?.priceCents,
            },
        })
    }

    // Ventas de productos recientes
    await prisma.productSale.deleteMany({ where: { tenantId: sable.id, createdAt: { gte: daysAgo(1) } } })
    await prisma.productSale.createMany({
        data: [
            { tenantId: sable.id, productId: cera.id, productName: cera.name, priceCents: cera.priceCents, createdAt: hoursAgo(0.67) },
            { tenantId: sable.id, productId: shampoo.id, productName: shampoo.name, priceCents: shampoo.priceCents, createdAt: hoursAgo(2) },
            { tenantId: sable.id, productId: aceite.id, productName: aceite.name, priceCents: aceite.priceCents, createdAt: hoursAgo(3) },
        ],
    })

    // Historial de los últimos 6 días (para que la gráfica de la semana tenga datos)
    await prisma.booking.deleteMany({ where: { tenantId: sable.id, scheduledAt: { gte: daysAgo(7), lt: startOfToday } } })
    await prisma.productSale.deleteMany({ where: { tenantId: sable.id, createdAt: { gte: daysAgo(7), lt: startOfToday } } })
    const historyNames = ['Pedro Salas', 'Luis Mata', 'Andrés Cota', 'Beto Rivas', 'Iker Solís', 'Toño Bravo']
    for (let d = 1; d <= 6; d++) {
        const dayServices = [corte, combo, barba]
        for (let i = 0; i < 3; i++) {
            const svcPick = dayServices[(d + i) % 3]
            const when = new Date(daysAgo(d).getTime())
            when.setHours(9 + i * 3, 0, 0, 0)
            await prisma.booking.create({
                data: {
                    tenantId: sable.id,
                    customerName: historyNames[(d + i) % historyNames.length],
                    customerPhone: `52199812345${d}${i}`,
                    serviceId: svcPick?.id,
                    day: when.toLocaleDateString('es-MX'),
                    time: when.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                    scheduledAt: when,
                    status: 'COMPLETED',
                    priceChargedCents: svcPick?.priceCents,
                },
            })
        }
        const prodPick = [cera, shampoo, aceite][d % 3]
        await prisma.productSale.create({
            data: {
                tenantId: sable.id,
                productId: prodPick.id,
                productName: prodPick.name,
                priceCents: prodPick.priceCents,
                createdAt: daysAgo(d),
            },
        })
    }

    // ---------------------------------------------------------------
    // Barberías de ejemplo (para poblar el panel de súper-admin)
    // ---------------------------------------------------------------
    const demoTenants = [
        {
            slug: 'fade-king-barberia',
            name: 'Fade King Barbería',
            ownerName: 'Luis Torres',
            whatsappNumber: '5218332149012',
            status: 'PAST_DUE',
            planPriceCents: 20000,
            nextDueDate: daysFromNow(3),
            brandColor: '#3B82F6',
        },
        {
            slug: 'el-barbero-de-la-5ta',
            name: 'El Barbero de la 5ta',
            ownerName: 'Ricardo Núñez',
            whatsappNumber: '5218335590044',
            status: 'PAUSED',
            planPriceCents: 35000,
            nextDueDate: daysAgo(6),
            brandColor: '#B91C1C',
        },
        {
            slug: 'corte-real',
            name: 'Corte Real',
            ownerName: 'Miguel Ángel Soto',
            whatsappNumber: '5218338872201',
            status: 'ACTIVE',
            planPriceCents: 20000,
            nextDueDate: daysFromNow(19),
            brandColor: '#6366F1',
        },
    ]
    for (const t of demoTenants) {
        await prisma.tenant.upsert({ where: { slug: t.slug }, update: t, create: t })
    }

    // ---------------------------------------------------------------
    // Usuarios de prueba con login real y permisos granulares por módulo
    // ---------------------------------------------------------------
    const FULL = { canView: true, canAdd: true, canEdit: true, canDelete: true }
    const VIEW = { canView: true, canAdd: false, canEdit: false, canDelete: false }
    const VIEW_ADD = { canView: true, canAdd: true, canEdit: false, canDelete: false }
    const VIEW_ADD_EDIT = { canView: true, canAdd: true, canEdit: true, canDelete: false }
    const NONE = { canView: false, canAdd: false, canEdit: false, canDelete: false }

    const staffUsers = [
        {
            username: 'admin',
            name: 'Arman Grijalva',
            role: 'ADMIN',
            password: 'admin123',
            permissions: { CITAS: FULL, SERVICIOS: FULL, PRODUCTOS: FULL, FINANZAS: FULL, BOT: FULL, SEGURIDAD: FULL },
        },
        {
            username: 'recepcion',
            name: 'Vale (Recepción)',
            role: 'USUARIO',
            password: 'recepcion123',
            permissions: { CITAS: VIEW_ADD_EDIT, SERVICIOS: VIEW, PRODUCTOS: VIEW_ADD, FINANZAS: NONE, BOT: NONE, SEGURIDAD: NONE },
        },
        {
            username: 'gerente',
            name: 'Diego (Gerente)',
            role: 'USUARIO',
            password: 'gerente123',
            permissions: { CITAS: VIEW_ADD_EDIT, SERVICIOS: VIEW_ADD_EDIT, PRODUCTOS: VIEW_ADD_EDIT, FINANZAS: VIEW_ADD, BOT: NONE, SEGURIDAD: NONE },
        },
    ]
    for (const u of staffUsers) {
        const staffUser = await prisma.staffUser.upsert({
            where: { tenantId_username: { tenantId: sable.id, username: u.username } },
            update: { name: u.name, role: u.role, passwordHash: hashPassword(u.password) },
            create: { tenantId: sable.id, name: u.name, username: u.username, role: u.role, passwordHash: hashPassword(u.password) },
        })
        for (const [module, perm] of Object.entries(u.permissions)) {
            await prisma.permission.upsert({
                where: { staffUserId_module: { staffUserId: staffUser.id, module } },
                update: perm,
                create: { staffUserId: staffUser.id, module, ...perm },
            })
        }
    }

    // ---------------------------------------------------------------
    // Gastos de prueba (últimos 30 días, varias categorías)
    // ---------------------------------------------------------------
    await prisma.expense.deleteMany({ where: { tenantId: sable.id, createdAt: { gte: daysAgo(30) } } })
    const testExpenses = [
        { category: 'RENTA', description: 'Renta del local', amountCents: 800000, days: 28 },
        { category: 'NOMINA', description: 'Pago quincenal staff', amountCents: 600000, days: 25 },
        { category: 'INSUMOS', description: 'Navajas y cuchillas', amountCents: 45000, days: 21 },
        { category: 'INSUMOS', description: 'Shampoo y toallas', amountCents: 32000, days: 14 },
        { category: 'SERVICIOS', description: 'Luz y agua', amountCents: 95000, days: 12 },
        { category: 'SERVICIOS', description: 'Internet', amountCents: 60000, days: 12 },
        { category: 'NOMINA', description: 'Pago quincenal staff', amountCents: 600000, days: 10 },
        { category: 'OTRO', description: 'Mantenimiento sillón', amountCents: 25000, days: 8 },
        { category: 'INSUMOS', description: 'Cera y productos de venta', amountCents: 54000, days: 6 },
        { category: 'OTRO', description: 'Publicidad local', amountCents: 30000, days: 4 },
        { category: 'INSUMOS', description: 'Toallas desechables', amountCents: 18000, days: 2 },
        { category: 'SERVICIOS', description: 'Limpieza', amountCents: 40000, days: 1 },
    ]
    for (const e of testExpenses) {
        await prisma.expense.create({
            data: {
                tenantId: sable.id,
                category: e.category,
                description: e.description,
                amountCents: e.amountCents,
                createdAt: daysAgo(e.days),
            },
        })
    }

    console.log(`✅ Tenant principal: ${sable.name} (${sable.slug}) — ${todaysBookings.length} citas de hoy sembradas`)
    console.log(`✅ ${staffUsers.length} usuarios de prueba y ${testExpenses.length} gastos sembrados`)
    console.log(`✅ ${demoTenants.length} barberías de ejemplo sembradas para el panel de admin`)
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
