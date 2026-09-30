// Cuenta de DEMOSTRACIÓN: deja "Tu Barbería" como si llevara un mes operando, con el día
// de hoy en curso. Sirve para enseñarle el sistema a un prospecto sin inventar nada en
// vivo, y para resetearla cuando de tanto que la toquen quede hecha un desorden.
//
//    npm run seed:demo
//
// Borra SOLO lo que tiene fecha (ventas, gastos, citas, turnos, movimientos y el historial
// de chat). Conserva el catálogo, los barberos, los horarios, la conexión de WhatsApp y los
// mensajes del bot: eso es configuración, no datos de operación.
//
// Los números no se inventan sueltos: cada turno se cierra con el efectivo que de verdad
// resulta de sus ventas y gastos, para que los reportes cuadren si el prospecto los revisa.
import { PrismaClient } from "@prisma/client";
import { zonedNow, tenantDayStartInstant, tenantDayKey, formatTime12h, DEFAULT_TIME_ZONE } from "../lib/scheduling.js";
import { hashPassword } from "../lib/password.js";

const prisma = new PrismaClient();

const SLUG = "tu-barberia";
const NOMBRE = "Tu Barbería";
const USUARIO = "usuario";
const CONTRASENA = "demo1234";
const DIAS_DE_HISTORIAL = 30;

// Aleatorio con semilla: cada corrida genera el mismo "carácter" de negocio (no un día
// buenísimo y al siguiente vacío), solo que con fechas nuevas.
let semilla = 20260929;
const azar = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
};
const entre = (min, max) => min + Math.floor(azar() * (max - min + 1));
const alguno = (arr) => arr[Math.floor(azar() * arr.length)];

// Reparte los métodos de pago como en una barbería real: manda el efectivo, pero hay
// suficiente tarjeta y transferencia para que el reporte por método se vea interesante.
const metodoDePago = () => {
    const r = azar();
    if (r < 0.62) return "EFECTIVO";
    if (r < 0.82) return "TARJETA_DEBITO";
    if (r < 0.93) return "TRANSFERENCIA";
    return "TARJETA_CREDITO";
};

const CLIENTES = [
    ["Carlos Mendoza", "8331234501"], ["José Luis Hernández", "8331234502"],
    ["Fernando Ríos", "8331234503"], ["Roberto Aguilar", "8331234504"],
    ["Javier Domínguez", "8331234505"], ["Alejandro Vega", "8331234506"],
    ["Ricardo Palacios", "8331234507"], ["Óscar Medina", "8331234508"],
    ["Daniel Escobar", "8331234509"], ["Emilio Cordero", "8331234510"],
    ["Andrés Salazar", "8331234511"], ["Víctor Lozano", "8331234512"],
    ["Sergio Beltrán", "8331234513"], ["Iván Castañeda", "8331234514"],
];

// Instante real correspondiente a cierta hora de pared de un día de la barbería.
const instanteEn = (dayKey, hora, minuto, tz) =>
    new Date(tenantDayStartInstant(dayKey, tz).getTime() + (hora * 60 + minuto) * 60000);

// Las citas guardan la hora de pared escrita en UTC (ver la convención en lib/scheduling.js).
const citaEn = (dayKey, hora, minuto) => {
    const [y, m, d] = dayKey.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, hora, minuto, 0));
};

async function main() {
    const tenant = await prisma.tenant.findFirst({ where: { OR: [{ slug: SLUG }, { slug: "sable-barber-studio" }] } });
    if (!tenant) throw new Error("No encontré la barbería de demostración.");
    const tz = tenant.timeZone ?? DEFAULT_TIME_ZONE;
    const tenantId = tenant.id;

    // --- Identidad genérica: nada que delate de quién salió esta cuenta ---
    await prisma.tenant.update({
        where: { id: tenantId },
        data: { name: NOMBRE, slug: SLUG, planPriceCents: 45000, saleFolioSeq: 0, expenseFolioSeq: 0 },
    });

    const admin = await prisma.staffUser.findFirst({ where: { tenantId, role: "ADMIN" } });
    await prisma.staffUser.update({
        where: { id: admin.id },
        data: { username: USUARIO, name: "Usuario", passwordHash: hashPassword(CONTRASENA), sessionVersion: { increment: 1 } },
    });

    // --- Limpieza: solo lo que tiene fecha ---
    await prisma.$transaction([
        prisma.cashMovement.deleteMany({ where: { tenantId } }),
        prisma.inventoryMovement.deleteMany({ where: { tenantId } }),
        prisma.productSale.deleteMany({ where: { tenantId } }),
        prisma.serviceSale.deleteMany({ where: { tenantId } }),
        prisma.expense.deleteMany({ where: { tenantId } }),
        prisma.booking.deleteMany({ where: { tenantId } }),
        prisma.cashShift.deleteMany({ where: { tenantId } }),
        prisma.whatsappMessage.deleteMany({ where: { tenantId } }),
        prisma.conversationState.deleteMany({ where: { tenantId } }),
    ]);

    // --- Clientes (se conservan los que ya había y se completa la lista) ---
    for (const [name, phone] of CLIENTES) {
        await prisma.customer.upsert({
            where: { tenantId_phone: { tenantId, phone } },
            update: {},
            create: { tenantId, name, phone },
        });
    }

    const [servicios, productos, barberos, clientes, tiposTurno, horarios] = await Promise.all([
        prisma.service.findMany({ where: { tenantId, active: true } }),
        prisma.product.findMany({ where: { tenantId, active: true } }),
        prisma.barber.findMany({ where: { tenantId, active: true } }),
        prisma.customer.findMany({ where: { tenantId } }),
        prisma.shiftType.findMany({ where: { tenantId, active: true } }),
        prisma.businessHour.findMany({ where: { tenantId } }),
    ]);
    const turnoMatutino = tiposTurno[0] ?? null;
    const cerradoEn = (fecha) => horarios.find((h) => h.weekday === fecha.getUTCDay())?.isClosed ?? false;

    // El stock se recalcula desde cero: se parte de un inventario sano y las ventas y
    // compras del mes lo van moviendo, para que lo que muestre el panel sea consecuencia
    // de los movimientos y no un número suelto.
    const stock = {};
    for (const p of productos) {
        stock[p.id] = entre(14, 26);
        await prisma.product.update({ where: { id: p.id }, data: { stock: stock[p.id] } });
    }

    let folioVenta = 0;
    let folioGasto = 0;
    const hoyKey = tenantDayKey(new Date(), tz);

    for (let atras = DIAS_DE_HISTORIAL; atras >= 0; atras--) {
        const inicioDia = new Date(tenantDayStartInstant(hoyKey, tz).getTime() - atras * 24 * 3600 * 1000);
        const dayKey = tenantDayKey(inicioDia, tz);
        const esHoy = atras === 0;
        const fechaCita = citaEn(dayKey, 12, 0);
        if (cerradoEn(fechaCita)) continue; // domingo: la barbería no abre

        // --- Turno del día ---
        const fondoInicial = 50000;
        const turno = await prisma.cashShift.create({
            data: {
                tenantId,
                shiftTypeId: turnoMatutino?.id ?? null,
                status: "ABIERTO",
                openedByName: "Usuario",
                openingCashCents: fondoInicial,
                startedAt: instanteEn(dayKey, 9, 0, tz),
            },
        });

        let efectivoVentas = 0;
        let efectivoGastos = 0;
        const ventasDelDia = esHoy ? entre(3, 5) : entre(5, 9);

        // --- Ventas de servicio, repartidas a lo largo del día ---
        for (let i = 0; i < ventasDelDia; i++) {
            const svc = alguno(servicios);
            const barbero = alguno(barberos);
            const cliente = azar() < 0.7 ? alguno(clientes) : null;
            const metodo = metodoDePago();
            const propina = azar() < 0.35 ? entre(1, 4) * 2000 : 0;
            const total = svc.priceCents + propina;
            const hora = 10 + Math.floor((i / ventasDelDia) * (esHoy ? 5 : 9));
            folioVenta += 1;

            await prisma.serviceSale.create({
                data: {
                    tenantId, folio: folioVenta, cashShiftId: turno.id,
                    serviceId: svc.id, serviceName: svc.name,
                    priceCents: svc.priceCents, tipCents: propina,
                    barberId: barbero.id, customerId: cliente?.id ?? null,
                    paymentMethod: metodo, paymentStatus: "PAGADO", amountPaidCents: total,
                    createdAt: instanteEn(dayKey, hora, entre(0, 55), tz),
                },
            });
            if (metodo === "EFECTIVO") efectivoVentas += total;
        }

        // --- Alguna venta de producto (no todos los días) ---
        if (azar() < 0.65) {
            const prod = alguno(productos);
            if (stock[prod.id] > 1) {
                const cant = azar() < 0.8 ? 1 : 2;
                const metodo = metodoDePago();
                const total = prod.priceCents * cant;
                folioVenta += 1;
                const cuando = instanteEn(dayKey, entre(11, esHoy ? 14 : 18), entre(0, 55), tz);

                await prisma.productSale.create({
                    data: {
                        tenantId, folio: folioVenta, cashShiftId: turno.id,
                        productId: prod.id, productName: prod.name,
                        priceCents: total, quantity: cant,
                        barberId: alguno(barberos).id,
                        paymentMethod: metodo, paymentStatus: "PAGADO", amountPaidCents: total,
                        createdAt: cuando,
                    },
                });
                stock[prod.id] -= cant;
                await prisma.product.update({ where: { id: prod.id }, data: { stock: stock[prod.id] } });
                await prisma.inventoryMovement.create({
                    data: { tenantId, productId: prod.id, type: "SALIDA", quantity: cant, reason: "Venta", createdByName: "Usuario", createdAt: cuando },
                });
                if (metodo === "EFECTIVO") efectivoVentas += total;
            }
        }

        // --- Gastos: los de caja chica salen del cajón; la renta y la luz se pagan por fuera ---
        const gastos = [];
        if (azar() < 0.3) gastos.push({ categoria: "INSUMOS", desc: alguno(["Navajas y hojas", "Toallas desechables", "Alcohol y desinfectante", "Talco y algodón"]), monto: entre(15, 45) * 1000, deCaja: true });
        if (atras === 15) gastos.push({ categoria: "RENTA", desc: "Renta del local", monto: 800000, deCaja: false });
        if (atras === 20) gastos.push({ categoria: "SERVICIOS", desc: "Luz (CFE)", monto: 142000, deCaja: false });
        // Nómina cada semana. Es el gasto grande de una barbería: si se subestima, la
        // utilidad del mes sale irreal y un dueño con oficio se da cuenta de inmediato.
        if (atras % 7 === 0 && atras > 0) gastos.push({ categoria: "NOMINA", desc: "Pago semanal a barberos", monto: entre(620, 760) * 1000, deCaja: false });

        for (const g of gastos) {
            folioGasto += 1;
            await prisma.expense.create({
                data: {
                    tenantId, folio: folioGasto, cashShiftId: turno.id,
                    category: g.categoria, description: g.desc, amountCents: g.monto,
                    paymentMethod: g.deCaja ? "EFECTIVO" : "TRANSFERENCIA",
                    fromCashRegister: g.deCaja,
                    createdAt: instanteEn(dayKey, entre(10, 17), entre(0, 55), tz),
                },
            });
            if (g.deCaja) efectivoGastos += g.monto;
        }

        // --- Retiro ocasional a la caja fuerte ---
        let retiros = 0;
        if (!esHoy && azar() < 0.2) {
            retiros = entre(10, 20) * 10000;
            await prisma.cashMovement.create({
                data: { tenantId, cashShiftId: turno.id, type: "RETIRO", amountCents: retiros, reason: "Traslado a caja fuerte", createdByName: "Usuario", createdAt: instanteEn(dayKey, 17, 30, tz) },
            });
        }

        // --- Citas del día ---
        const citas = entre(2, 4);
        for (let i = 0; i < citas; i++) {
            const svc = alguno(servicios);
            const cliente = alguno(clientes);
            const hora = 10 + i * 2;
            const enElPasado = atras > 0;
            // Un par de canceladas en el mes: enseña que quedan registradas, no borradas.
            const cancelada = enElPasado && azar() < 0.06;
            await prisma.booking.create({
                data: {
                    tenantId,
                    customerName: cliente.name, customerPhone: cliente.phone, customerId: cliente.id,
                    serviceId: svc.id, barberId: alguno(barberos).id,
                    day: dayKey, time: formatTime12h(citaEn(dayKey, hora, 0)),
                    scheduledAt: citaEn(dayKey, hora, 0), durationMin: svc.durationMin,
                    status: cancelada ? "CANCELLED" : enElPasado ? "COMPLETED" : "PENDING",
                    priceChargedCents: svc.priceCents,
                    ...(cancelada ? { cancelledAt: instanteEn(dayKey, hora - 1, 0, tz), cancelledByCustomer: true } : {}),
                    ...(!cancelada && enElPasado
                        ? { completedAt: instanteEn(dayKey, hora, 30, tz), paymentMethod: "EFECTIVO", paymentStatus: "PAGADO", amountPaidCents: svc.priceCents }
                        : {}),
                    createdAt: instanteEn(dayKey, 8, 0, tz),
                },
            });
            if (enElPasado && !cancelada) efectivoVentas += svc.priceCents;
        }

        // --- Cierre del turno (hoy se queda abierto, para que el panel muestre el día en curso) ---
        if (!esHoy) {
            const esperado = fondoInicial + efectivoVentas - efectivoGastos - retiros;
            // Casi siempre cuadra. Un par de días con faltante/sobrante enseñan para qué
            // sirve el corte de caja — que es justo lo que le interesa a un dueño.
            const desajuste = azar() < 0.12 ? alguno([-5000, -2000, 2000, 3000]) : 0;
            const contado = esperado + desajuste;
            await prisma.cashShift.update({
                where: { id: turno.id },
                data: {
                    status: "CERRADO", closedByName: "Usuario",
                    endedAt: instanteEn(dayKey, 20, 15, tz),
                    expectedCashCents: esperado, closingCashCents: contado,
                    cashDifferenceCents: contado - esperado,
                    cashRevenueCents: efectivoVentas, cashExpenseCents: efectivoGastos,
                    salesCount: ventasDelDia,
                    ...(desajuste !== 0 ? { notes: desajuste > 0 ? "Sobró efectivo, se revisa mañana" : "Faltó efectivo, pendiente de aclarar" } : {}),
                },
            });
        }
    }

    // --- Citas de los próximos días, para que la agenda no se vea vacía ---
    for (let adelante = 1; adelante <= 4; adelante++) {
        const dia = new Date(tenantDayStartInstant(hoyKey, tz).getTime() + adelante * 24 * 3600 * 1000);
        const dayKey = tenantDayKey(dia, tz);
        if (cerradoEn(citaEn(dayKey, 12, 0))) continue;
        for (let i = 0; i < entre(2, 4); i++) {
            const svc = alguno(servicios);
            const cliente = alguno(clientes);
            const hora = 10 + i * 2;
            await prisma.booking.create({
                data: {
                    tenantId,
                    customerName: cliente.name, customerPhone: cliente.phone, customerId: cliente.id,
                    serviceId: svc.id, barberId: alguno(barberos).id,
                    day: dayKey, time: formatTime12h(citaEn(dayKey, hora, 0)),
                    scheduledAt: citaEn(dayKey, hora, 0), durationMin: svc.durationMin,
                    status: "PENDING", priceChargedCents: svc.priceCents,
                },
            });
        }
    }

    await prisma.tenant.update({ where: { id: tenantId }, data: { saleFolioSeq: folioVenta, expenseFolioSeq: folioGasto } });

    // --- Resumen de lo que quedó ---
    const abierto = await prisma.cashShift.findFirst({ where: { tenantId, status: "ABIERTO" } });
    const ventasHoy = await prisma.serviceSale.findMany({ where: { tenantId, cashShiftId: abierto.id } });
    const prodHoy = await prisma.productSale.findMany({ where: { tenantId, cashShiftId: abierto.id } });
    const ingresoHoy = [...ventasHoy, ...prodHoy].reduce((s, v) => s + v.amountPaidCents, 0);

    console.log("Demo lista.");
    console.log(`   Barbería : ${NOMBRE}   (URL: /t/${SLUG})`);
    console.log(`   Entrar   : usuario "${USUARIO}"  contraseña "${CONTRASENA}"`);
    console.log(`   Historial: ${DIAS_DE_HISTORIAL} días, turno de HOY abierto`);
    console.log(`   Hoy      : ${ventasHoy.length + prodHoy.length} ventas · $${(ingresoHoy / 100).toFixed(2)}`);
    console.log(`   Folios   : ${folioVenta} ventas, ${folioGasto} gastos`);
}

main()
    .catch((err) => {
        console.error("Falló la siembra:", err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
