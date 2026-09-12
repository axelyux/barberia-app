"use server";

import { prisma } from "@/lib/db";
import { requireTenantSession } from "@/lib/auth";
import { shiftLabel } from "@/lib/format";
import { tenantDayStartInstant } from "@/lib/scheduling";

// Reportes de un rango de fechas que elige el usuario. Todo sale de lo que ya se registró
// (turnos, ventas, gastos, citas) — aquí no se calcula nada nuevo, solo se agrupa.
//
// Los tres reportes se arman en una sola llamada a propósito: el usuario elige el rango una
// vez y espera un solo viaje al servidor, en vez de tres esperas seguidas.
export async function getReports(slug, { from, to }) {
    const { tenantId, timeZone } = await requireTenantSession(slug, "FINANZAS", "view");
    // "Del 1 al 12" son días de calendario de la barbería, no instantes UTC: así una venta
    // de las 7 p.m. del día 12 entra en el reporte del 12.
    const desde = tenantDayStartInstant(String(from).slice(0, 10), timeZone);
    const hasta = new Date(tenantDayStartInstant(String(to).slice(0, 10), timeZone).getTime() + 24 * 60 * 60 * 1000 - 1);
    const rango = { gte: desde, lte: hasta };

    const [shifts, productSales, serviceSales, expenses, completedBookings, barbers, cashMovements] = await Promise.all([
        prisma.cashShift.findMany({
            where: { tenantId, startedAt: rango },
            include: { shiftType: { select: { name: true } } },
            orderBy: { startedAt: "desc" },
        }),
        prisma.productSale.findMany({ where: { tenantId, createdAt: rango }, include: { barber: { select: { id: true, name: true } } } }),
        prisma.serviceSale.findMany({ where: { tenantId, createdAt: rango }, include: { barber: { select: { id: true, name: true } } } }),
        prisma.expense.findMany({ where: { tenantId, createdAt: rango } }),
        prisma.booking.findMany({
            where: { tenantId, status: "COMPLETED", completedAt: rango },
            include: { barber: { select: { id: true, name: true } } },
        }),
        prisma.barber.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
        prisma.cashMovement.findMany({ where: { tenantId, createdAt: rango } }),
    ]);

    // Lo cancelado no cuenta para ningún total, pero sí se informa cuánto se canceló: es
    // justo el número que hay que mirar si se sospecha que alguien borra sus ventas.
    const ventasActivas = [...productSales, ...serviceSales].filter((s) => !s.cancelledAt);
    const ventasCanceladas = [...productSales, ...serviceSales].filter((s) => s.cancelledAt);
    const gastosActivos = expenses.filter((e) => !e.cancelledAt);
    const gastosCancelados = expenses.filter((e) => e.cancelledAt);

    const suma = (filas, campo) => filas.reduce((acc, f) => acc + (f[campo] ?? 0), 0);

    // ---------------------------------------------------------------- Reporte por turno
    const reporteTurnos = shifts.map((s) => ({
        id: s.id,
        label: shiftLabel(s),
        abierto: s.status === "ABIERTO",
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        openedByName: s.openedByName,
        closedByName: s.closedByName,
        openingCashCents: s.openingCashCents,
        // Un turno abierto todavía no tiene estos números: se calculan al cerrarlo.
        expectedCashCents: s.expectedCashCents,
        closingCashCents: s.closingCashCents,
        cashDifferenceCents: s.cashDifferenceCents,
        totalRevenueCents: s.totalRevenueCents,
        totalExpenseCents: s.totalExpenseCents,
        salesCount: s.salesCount,
        notes: s.notes,
    }));

    // -------------------------------------------------------------- Reporte por barbero
    const porBarbero = barbers
        .map((b) => {
            const ventas = ventasActivas.filter((v) => v.barberId === b.id);
            const citas = completedBookings.filter((c) => c.barberId === b.id);
            const ingresoCents = suma(ventas, "amountPaidCents") + suma(citas, "amountPaidCents");
            return {
                id: b.id,
                name: b.name,
                paymentType: b.paymentType ?? "COMISION",
                commissionPercent: b.commissionPercent,
                salaryCents: b.salaryCents ?? 0,
                ventasCount: ventas.length,
                citasCount: citas.length,
                ingresoCents,
                // Cuánto le tocaría de comisión sobre lo que generó. Es informativo: pagarle
                // sigue siendo un gasto que se registra aparte (ver la nota en Finanzas).
                comisionCents: Math.round((ingresoCents * (b.commissionPercent ?? 0)) / 100),
            };
        })
        .filter((b) => b.ingresoCents > 0 || b.ventasCount > 0 || b.citasCount > 0)
        .sort((a, b) => b.ingresoCents - a.ingresoCents);

    // Lo que se cobró sin barbero asignado no se pierde del reporte: se muestra aparte para
    // que la suma por barbero cuadre con el ingreso total.
    const sinBarberoCents =
        suma(ventasActivas.filter((v) => !v.barberId), "amountPaidCents") +
        suma(completedBookings.filter((c) => !c.barberId), "amountPaidCents");

    // ------------------------------------------------------------------ Reporte de caja
    const enEfectivo = (filas) => filas.filter((f) => f.paymentMethod === "EFECTIVO");
    const ingresoEfectivoCents = suma(enEfectivo(ventasActivas), "amountPaidCents") + suma(enEfectivo(completedBookings), "amountPaidCents");
    const gastoEfectivoCajaCents = suma(gastosActivos.filter((e) => e.paymentMethod === "EFECTIVO" && e.fromCashRegister), "amountCents");
    const gastoEfectivoFueraCents = suma(gastosActivos.filter((e) => e.paymentMethod === "EFECTIVO" && !e.fromCashRegister), "amountCents");
    const depositosCents = suma(cashMovements.filter((m) => m.type === "DEPOSITO"), "amountCents");
    const retirosCents = suma(cashMovements.filter((m) => m.type === "RETIRO"), "amountCents");

    const turnosCerrados = shifts.filter((s) => s.status === "CERRADO");
    const diferenciaTotalCents = suma(turnosCerrados, "cashDifferenceCents");

    // Desglose por método de pago: para cuadrar contra la terminal y el banco.
    const porMetodo = {};
    for (const fila of [...ventasActivas, ...completedBookings]) {
        const metodo = fila.paymentMethod ?? "EFECTIVO";
        porMetodo[metodo] = (porMetodo[metodo] ?? 0) + (fila.amountPaidCents ?? 0);
    }

    const ingresoTotalCents = suma(ventasActivas, "amountPaidCents") + suma(completedBookings, "amountPaidCents");
    const gastoTotalCents = suma(gastosActivos, "amountCents");

    return {
        rango: { from, to },
        totales: {
            ingresoCents: ingresoTotalCents,
            gastoCents: gastoTotalCents,
            utilidadCents: ingresoTotalCents - gastoTotalCents,
            ventasCount: ventasActivas.length,
            citasCount: completedBookings.length,
            canceladasCount: ventasCanceladas.length,
            canceladasCents: suma(ventasCanceladas, "amountPaidCents"),
            gastosCanceladosCount: gastosCancelados.length,
        },
        turnos: reporteTurnos,
        barberos: { filas: porBarbero, sinBarberoCents },
        caja: {
            ingresoEfectivoCents,
            gastoEfectivoCajaCents,
            gastoEfectivoFueraCents,
            depositosCents,
            retirosCents,
            turnosCerradosCount: turnosCerrados.length,
            diferenciaTotalCents,
            porMetodo: Object.entries(porMetodo)
                .map(([method, amountCents]) => ({ method, amountCents }))
                .sort((a, b) => b.amountCents - a.amountCents),
        },
    };
}
