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

    const hasServices = (await prisma.service.count({ where: { tenantId: sable.id } })) > 0
    if (!hasServices) {
        await prisma.service.createMany({
            data: [
                { tenantId: sable.id, name: 'Corte', priceCents: 15000, durationMin: 30, sortOrder: 1 },
                { tenantId: sable.id, name: 'Barba', priceCents: 10000, durationMin: 20, sortOrder: 2 },
                { tenantId: sable.id, name: 'Combo (Corte + Barba)', priceCents: 22000, durationMin: 45, sortOrder: 3 },
            ],
        })
    }
    // Antes esto se guardaba en el destructuring de arriba (findFirst, antes de crear),
    // así que en una base de datos nueva "corte"/"barba"/"combo" quedaban en null para
    // siempre aunque el createMany sí los hubiera creado — había que releerlos después.
    const services = await prisma.service.findMany({ where: { tenantId: sable.id } })
    const svc = (name) => services.find((s) => s.name === name)
    const corte = svc('Corte')
    const barba = svc('Barba')
    const combo = svc('Combo (Corte + Barba)')

    const flowMessages = [
        {
            key: 'WELCOME',
            // El menú se manda como botones de WhatsApp, así que este texto ya no debe
            // enumerar opciones ni pedir que respondan con un número.
            text: [
                '👋 ¡Hola! Bienvenido a *Sable Barber Studio*.',
                '',
                '¿En qué podemos ayudarte hoy?',
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

    // Productos (para el módulo de inventario/ventas — 6 para poder ver la paginación del grid)
    const existingProducts = await prisma.product.findMany({ where: { tenantId: sable.id } })
    const productDefs = [
        { name: 'Cera moldeadora', priceCents: 18000, stock: 12, sortOrder: 1 },
        { name: 'Shampoo anticaída', priceCents: 22000, stock: 8, sortOrder: 2 },
        { name: 'Aceite para barba', priceCents: 15000, stock: 15, sortOrder: 3 },
        { name: 'Peine profesional', priceCents: 9000, stock: 20, sortOrder: 4 },
        { name: 'Talco para barba', priceCents: 12000, stock: 2, lowStockThreshold: 5, sortOrder: 5 },
        { name: 'Loción aftershave', priceCents: 16000, stock: 10, sortOrder: 6 },
    ]
    const productByName = {}
    for (const def of productDefs) {
        productByName[def.name] = existingProducts.find((p) => p.name === def.name) ?? (await prisma.product.create({ data: { tenantId: sable.id, ...def } }))
    }
    const [cera, shampoo, aceite, peine, talco, locion] = productDefs.map((d) => productByName[d.name])

    // Equipo: 3 barberos con distintos tipos de pago (comisión, sueldo fijo, mixto)
    const barberDefs = [
        { name: 'Luis Torres', phone: '5219980001111', specialty: 'Fades, diseño de barba', paymentType: 'COMISION', commissionPercent: 45, salaryCents: null },
        { name: 'Miguel Ángel Soto', phone: '5219980002222', specialty: 'Cortes clásicos', paymentType: 'SUELDO', commissionPercent: 0, salaryCents: 700000 },
        { name: 'Ricardo Núñez', phone: '5219980003333', specialty: 'Barba y afeitado', paymentType: 'MIXTO', commissionPercent: 20, salaryCents: 350000 },
    ]
    const barbersByName = {}
    for (const def of barberDefs) {
        const existing = await prisma.barber.findFirst({ where: { tenantId: sable.id, name: def.name } })
        barbersByName[def.name] = existing
            ? await prisma.barber.update({ where: { id: existing.id }, data: def })
            : await prisma.barber.create({ data: { tenantId: sable.id, ...def } })
    }
    const [luis, miguel, ricardo] = barberDefs.map((d) => barbersByName[d.name])

    // Clientes frecuentes (con cumpleaños, correo y barbero preferido)
    const customerDefs = [
        { name: 'Carlos Medina', phone: '5219981234567', email: 'carlos.medina@gmail.com', birthDate: new Date('1992-07-15'), preferredBarberId: luis.id },
        { name: 'Jorge Ibarra', phone: '5219981234568', email: 'jorge.ibarra@gmail.com', birthDate: new Date('1988-11-02'), preferredBarberId: miguel.id },
        { name: 'Daniel Reyes', phone: '5219981234570', notes: 'Prefiere cita temprano', preferredBarberId: ricardo.id },
    ]
    const customersByPhone = {}
    for (const def of customerDefs) {
        customersByPhone[def.phone] = await prisma.customer.upsert({
            where: { tenantId_phone: { tenantId: sable.id, phone: def.phone } },
            update: def,
            create: { tenantId: sable.id, ...def },
        })
    }
    const [carlosC, jorgeC, danielC] = customerDefs.map((d) => customersByPhone[d.phone])

    // Citas de hoy (borra las de hoy antes de re-sembrar, para poder correr el seed varias veces)
    const startOfToday = todayAt(0, 0)
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)
    await prisma.booking.deleteMany({
        where: { tenantId: sable.id, scheduledAt: { gte: startOfToday, lt: startOfTomorrow } },
    })

    const todaysBookings = [
        { name: 'Carlos Medina', phone: '5219981234567', service: corte, barber: luis, customer: carlosC, hour: 9, min: 0, status: 'COMPLETED', pay: 'PAGADO' },
        { name: 'Jorge Ibarra', phone: '5219981234568', service: combo, barber: miguel, customer: jorgeC, hour: 9, min: 40, status: 'COMPLETED', pay: 'PAGADO' },
        { name: 'Ricardo Paz', phone: '5219981234569', service: barba, barber: ricardo, hour: 10, min: 30, status: 'COMPLETED', pay: 'PAGADO' },
        { name: 'Daniel Reyes', phone: '5219981234570', service: corte, barber: ricardo, customer: danielC, hour: 11, min: 15, status: 'COMPLETED', pay: 'PARCIAL', paidCents: 8000 },
        { name: 'Emilio Vidal', phone: '5219981234571', service: combo, hour: 12, min: 0, status: 'CANCELLED', pay: 'PAGADO' },
        { name: 'Sergio Nava', phone: '5219981234572', service: corte, barber: luis, hour: 13, min: 0, status: 'COMPLETED', pay: 'NO_PAGADO', paidCents: 0 },
        { name: 'Iván Delgado', phone: '5219981234573', service: barba, hour: 14, min: 30, status: 'PENDING', pay: 'PAGADO' },
        { name: 'Marco Vega', phone: '5219981234574', service: combo, hour: 16, min: 0, status: 'PENDING', pay: 'PAGADO' },
    ]
    for (const b of todaysBookings) {
        const when = todayAt(b.hour, b.min)
        const price = b.status === 'CANCELLED' ? null : b.service?.priceCents ?? null
        const paid = b.status !== 'COMPLETED' ? 0 : (b.paidCents ?? price ?? 0)
        await prisma.booking.create({
            data: {
                tenantId: sable.id,
                customerName: b.name,
                customerPhone: b.phone,
                serviceId: b.service?.id,
                barberId: b.barber?.id ?? null,
                customerId: b.customer?.id ?? null,
                day: when.toLocaleDateString('es-MX'),
                time: when.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                scheduledAt: when,
                status: b.status,
                priceChargedCents: price,
                paymentStatus: b.pay,
                amountPaidCents: paid,
                paymentMethod: b.status === 'COMPLETED' ? 'EFECTIVO' : null,
                completedAt: b.status === 'COMPLETED' ? when : null,
            },
        })
    }

    // Ventas de hoy: productos y servicios de mostrador (6 y 6, para ver bien la lista de Ventas)
    await prisma.productSale.deleteMany({ where: { tenantId: sable.id, createdAt: { gte: daysAgo(1) } } })
    await prisma.serviceSale.deleteMany({ where: { tenantId: sable.id, createdAt: { gte: daysAgo(1) } } })
    await prisma.productSale.createMany({
        data: [
            { tenantId: sable.id, productId: cera.id, productName: cera.name, priceCents: cera.priceCents, tipCents: 2000, amountPaidCents: cera.priceCents + 2000, barberId: luis.id, customerId: carlosC.id, paymentMethod: 'EFECTIVO', createdAt: hoursAgo(0.67) },
            { tenantId: sable.id, productId: shampoo.id, productName: shampoo.name, priceCents: shampoo.priceCents, amountPaidCents: shampoo.priceCents, barberId: miguel.id, paymentMethod: 'TARJETA_DEBITO', createdAt: hoursAgo(2) },
            { tenantId: sable.id, productId: aceite.id, productName: aceite.name, priceCents: aceite.priceCents, quantity: 2, amountPaidCents: aceite.priceCents * 2, barberId: ricardo.id, paymentMethod: 'EFECTIVO', createdAt: hoursAgo(3) },
            { tenantId: sable.id, productId: peine.id, productName: peine.name, priceCents: peine.priceCents, amountPaidCents: peine.priceCents, paymentMethod: 'MERCADO_PAGO', createdAt: hoursAgo(4) },
            { tenantId: sable.id, productId: talco.id, productName: talco.name, priceCents: talco.priceCents, paymentStatus: 'NO_PAGADO', amountPaidCents: 0, paymentMethod: 'EFECTIVO', createdAt: hoursAgo(5) },
            { tenantId: sable.id, productId: locion.id, productName: locion.name, priceCents: locion.priceCents, amountPaidCents: locion.priceCents, paymentMethod: 'CODI', createdAt: hoursAgo(6) },
        ],
    })
    await prisma.serviceSale.createMany({
        data: [
            { tenantId: sable.id, serviceId: corte.id, serviceName: corte.name, priceCents: corte.priceCents, discountCents: 3000, amountPaidCents: corte.priceCents - 3000, barberId: luis.id, customerId: carlosC.id, notes: 'Cliente frecuente, descuento por lealtad', paymentMethod: 'EFECTIVO', createdAt: hoursAgo(0.5) },
            { tenantId: sable.id, serviceId: barba.id, serviceName: barba.name, priceCents: barba.priceCents, amountPaidCents: barba.priceCents, barberId: ricardo.id, paymentMethod: 'EFECTIVO', createdAt: hoursAgo(1.5) },
            { tenantId: sable.id, serviceId: combo.id, serviceName: combo.name, priceCents: combo.priceCents, paymentStatus: 'PARCIAL', amountPaidCents: 12000, barberId: miguel.id, paymentMethod: 'TRANSFERENCIA', createdAt: hoursAgo(2.5) },
            { tenantId: sable.id, serviceId: corte.id, serviceName: corte.name, priceCents: corte.priceCents, amountPaidCents: corte.priceCents, paymentMethod: 'TARJETA_CREDITO', createdAt: hoursAgo(3.5) },
            { tenantId: sable.id, serviceId: barba.id, serviceName: barba.name, priceCents: barba.priceCents, tipCents: 5000, amountPaidCents: barba.priceCents + 5000, barberId: luis.id, paymentMethod: 'EFECTIVO', createdAt: hoursAgo(4.5) },
            { tenantId: sable.id, serviceId: combo.id, serviceName: combo.name, priceCents: combo.priceCents, amountPaidCents: combo.priceCents, paymentMethod: 'PAYPAL', createdAt: hoursAgo(5.5) },
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
                    amountPaidCents: svcPick?.priceCents ?? 0,
                    paymentMethod: 'EFECTIVO',
                    completedAt: when,
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
                amountPaidCents: prodPick.priceCents,
                paymentMethod: 'EFECTIVO',
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
        { category: 'RENTA', description: 'Renta del local', amountCents: 800000, days: 28, vendor: 'Inmobiliaria del Valle', isRecurring: true, paidByName: 'Arman Grijalva' },
        { category: 'NOMINA', description: 'Sueldo quincenal — Miguel Ángel Soto', amountCents: 700000, days: 25, isRecurring: true, paidByName: 'Arman Grijalva' },
        { category: 'INSUMOS', description: 'Navajas y cuchillas', amountCents: 45000, days: 21, vendor: 'Distribuidora Barber Pro' },
        { category: 'INSUMOS', description: `Compra: ${shampoo.name}`, amountCents: 130000, days: 14, product: shampoo, quantity: 6, vendor: 'Distribuidora Barber Pro', receiptNumber: 'F-4521' },
        { category: 'SERVICIOS', description: 'Luz y agua', amountCents: 95000, days: 12, vendor: 'CFE', isRecurring: true },
        { category: 'SERVICIOS', description: 'Internet', amountCents: 60000, days: 12, vendor: 'Telmex', isRecurring: true },
        { category: 'NOMINA', description: 'Sueldo quincenal — Ricardo Núñez', amountCents: 350000, days: 10, isRecurring: true, paidByName: 'Arman Grijalva' },
        { category: 'OTRO', description: 'Mantenimiento sillón', amountCents: 25000, days: 8 },
        { category: 'INSUMOS', description: `Compra: ${cera.name}`, amountCents: 140000, days: 6, product: cera, quantity: 10, vendor: 'Distribuidora Barber Pro', receiptNumber: 'F-4602' },
        { category: 'OTRO', description: 'Publicidad local', amountCents: 30000, days: 4 },
        { category: 'INSUMOS', description: 'Toallas desechables', amountCents: 18000, days: 2 },
        { category: 'SERVICIOS', description: 'Limpieza', amountCents: 40000, days: 1, paidByName: 'Diego (Gerente)' },
    ]
    for (const e of testExpenses) {
        await prisma.expense.create({
            data: {
                tenantId: sable.id,
                category: e.category,
                description: e.description,
                amountCents: e.amountCents,
                productId: e.product?.id ?? null,
                quantity: e.quantity ?? null,
                vendor: e.vendor ?? null,
                receiptNumber: e.receiptNumber ?? null,
                isRecurring: e.isRecurring ?? false,
                paidByName: e.paidByName ?? null,
                createdAt: daysAgo(e.days),
            },
        })
    }

    // ---------------------------------------------------------------
    // Turnos de caja: tipos + un turno abierto ahorita + 2 cerrados de ejemplo
    // ---------------------------------------------------------------
    const shiftTypeDefs = ['Mañana', 'Tarde', 'Noche', 'Día completo']
    const shiftTypesByName = {}
    for (const name of shiftTypeDefs) {
        shiftTypesByName[name] = await prisma.shiftType.upsert({
            where: { tenantId_name: { tenantId: sable.id, name } },
            update: {},
            create: { tenantId: sable.id, name },
        })
    }

    await prisma.cashShift.deleteMany({ where: { tenantId: sable.id, status: 'ABIERTO' } })
    await prisma.cashShift.create({
        data: {
            tenantId: sable.id,
            shiftTypeId: shiftTypesByName['Día completo'].id,
            status: 'ABIERTO',
            openedByName: 'Arman Grijalva',
            openingCashCents: 50000,
            startedAt: todayAt(9, 0),
        },
    })

    const closedShiftDefs = [
        { name: 'Mañana', days: 1, startHour: 9, endHour: 15, opening: 50000, closing: 210000, cash: 160000, expense: 30000, sales: 9 },
        { name: 'Tarde', days: 2, startHour: 15, endHour: 20, opening: 40000, closing: 195000, cash: 155000, expense: 0, sales: 7 },
    ]
    for (const s of closedShiftDefs) {
        const start = new Date(daysAgo(s.days))
        start.setHours(s.startHour, 0, 0, 0)
        const end = new Date(daysAgo(s.days))
        end.setHours(s.endHour, 0, 0, 0)
        const expected = s.opening + s.cash - s.expense
        await prisma.cashShift.create({
            data: {
                tenantId: sable.id,
                shiftTypeId: shiftTypesByName[s.name].id,
                status: 'CERRADO',
                openedByName: 'Arman Grijalva',
                closedByName: 'Arman Grijalva',
                openingCashCents: s.opening,
                closingCashCents: s.closing,
                cashRevenueCents: s.cash,
                cashExpenseCents: s.expense,
                totalRevenueCents: s.cash,
                totalExpenseCents: s.expense,
                expectedCashCents: expected,
                cashDifferenceCents: s.closing - expected,
                salesCount: s.sales,
                startedAt: start,
                endedAt: end,
            },
        })
    }

    // ---------------------------------------------------------------
    // Admin supremo (dueño de la plataforma) — login separado del de las barberías
    // ---------------------------------------------------------------
    await prisma.superAdmin.upsert({
        where: { username: 'axel' },
        update: {},
        create: {
            username: 'axel',
            name: 'Axel',
            passwordHash: hashPassword('axel123'),
        },
    })

    console.log(`✅ Tenant principal: ${sable.name} (${sable.slug}) — ${todaysBookings.length} citas de hoy sembradas`)
    console.log(`✅ ${staffUsers.length} usuarios de prueba y ${testExpenses.length} gastos sembrados`)
    console.log(`✅ ${demoTenants.length} barberías de ejemplo sembradas para el panel de admin`)
    console.log(`✅ Admin supremo sembrado — usuario: axel / contraseña: axel123`)
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
