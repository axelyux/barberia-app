"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { updateOwned, deleteOwned } from "@/lib/tenant-guard";

const plainShift = (s) => ({
    ...s,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    shiftType: s.shiftType ? { id: s.shiftType.id, name: s.shiftType.name } : null,
});

export async function getOpenShift(slug) {
    const { tenantId } = await requireTenantSession(slug);
    const shift = await prisma.cashShift.findFirst({ where: { tenantId, status: "ABIERTO" }, include: { shiftType: true } });
    return shift ? plainShift(shift) : null;
}

export async function getShiftHistory(slug) {
    const { tenantId } = await requireTenantSession(slug, "FINANZAS", "view");
    const shifts = await prisma.cashShift.findMany({
        where: { tenantId, status: "CERRADO" },
        include: { shiftType: true },
        orderBy: { startedAt: "desc" },
        take: 20,
    });
    return shifts.map(plainShift);
}

// Sacar/meter efectivo de la caja MIENTRAS el turno sigue abierto (ej. un pago urgente en
// efectivo, o meter cambio) — antes solo se podía ver el faltante/sobrante hasta cerrar,
// sin dejar rastro de por qué no cuadraba. Se resta/suma directo en el cálculo de cierre.
export async function registerCashMovement(slug, { type, amountCents, reason }) {
    const { user, tenantId } = await requireTenantSession(slug, "FINANZAS", "add");
    if (type !== "RETIRO" && type !== "DEPOSITO") throw new Error("Tipo de movimiento inválido");

    const shift = await prisma.cashShift.findFirst({ where: { tenantId, status: "ABIERTO" } });
    if (!shift) throw new Error("No hay ningún turno abierto.");

    const amount = Math.max(0, Math.round(amountCents) || 0);
    if (amount <= 0) throw new Error("El monto debe ser mayor a cero.");

    await prisma.cashMovement.create({
        data: { tenantId, cashShiftId: shift.id, type, amountCents: amount, reason: reason?.trim() || null, createdByName: user.name },
    });
    revalidatePath(`/t/${slug}`);
}

export async function getCashMovements(slug) {
    const { tenantId } = await requireTenantSession(slug, "FINANZAS", "view");
    const shift = await prisma.cashShift.findFirst({ where: { tenantId, status: "ABIERTO" } });
    if (!shift) return [];
    const movements = await prisma.cashMovement.findMany({ where: { tenantId, cashShiftId: shift.id }, orderBy: { createdAt: "desc" } });
    return movements.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
}

export async function openShift(slug, { shiftTypeId, openingCashCents }) {
    const { user, tenantId } = await requireTenantSession(slug, "FINANZAS", "add");

    const existing = await prisma.cashShift.findFirst({ where: { tenantId, status: "ABIERTO" } });
    if (existing) throw new Error("Ya hay un turno abierto.");

    if (shiftTypeId) {
        const shiftType = await prisma.shiftType.findFirst({ where: { id: shiftTypeId, tenantId } });
        if (!shiftType) throw new Error("Tipo de turno no encontrado.");
    }

    await prisma.cashShift.create({
        data: {
            tenantId,
            shiftTypeId: shiftTypeId || null,
            openedByName: user.name,
            openingCashCents: Math.max(0, Math.round(openingCashCents) || 0),
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function closeShift(slug, { closingCashCents, notes }) {
    const { user, tenantId } = await requireTenantSession(slug, "FINANZAS", "add");

    const shift = await prisma.cashShift.findFirst({ where: { tenantId, status: "ABIERTO" } });
    if (!shift) throw new Error("No hay ningún turno abierto.");

    const endedAt = new Date();
    const range = { gte: shift.startedAt, lte: endedAt };

    // Las ventas canceladas no entran: el dinero nunca se quedó en la caja.
    const [completedBookings, productSales, serviceSales, expenses, cashMovements] = await Promise.all([
        prisma.booking.findMany({ where: { tenantId, status: "COMPLETED", completedAt: range } }),
        prisma.productSale.findMany({ where: { tenantId, createdAt: range, cancelledAt: null } }),
        prisma.serviceSale.findMany({ where: { tenantId, createdAt: range, cancelledAt: null } }),
        prisma.expense.findMany({ where: { tenantId, createdAt: range } }),
        prisma.cashMovement.findMany({ where: { tenantId, cashShiftId: shift.id } }),
    ]);

    const revenueRows = [...completedBookings, ...productSales, ...serviceSales];
    const totalRevenueCents = revenueRows.reduce((sum, r) => sum + (r.amountPaidCents ?? 0), 0);
    const cashRevenueCents = revenueRows
        .filter((r) => r.paymentMethod === "EFECTIVO")
        .reduce((sum, r) => sum + (r.amountPaidCents ?? 0), 0);
    const totalExpenseCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
    const cashExpenseCents = expenses.filter((e) => e.paymentMethod === "EFECTIVO").reduce((sum, e) => sum + e.amountCents, 0);
    const cashDepositCents = cashMovements.filter((m) => m.type === "DEPOSITO").reduce((sum, m) => sum + m.amountCents, 0);
    const cashWithdrawalCents = cashMovements.filter((m) => m.type === "RETIRO").reduce((sum, m) => sum + m.amountCents, 0);

    const expectedCashCents = shift.openingCashCents + cashRevenueCents - cashExpenseCents + cashDepositCents - cashWithdrawalCents;
    const closingCash = Math.max(0, Math.round(closingCashCents) || 0);

    await prisma.cashShift.update({
        where: { id: shift.id },
        data: {
            status: "CERRADO",
            closedByName: user.name,
            closingCashCents: closingCash,
            cashRevenueCents,
            cashExpenseCents,
            totalRevenueCents,
            totalExpenseCents,
            expectedCashCents,
            cashDifferenceCents: closingCash - expectedCashCents,
            salesCount: revenueRows.length,
            notes: notes?.trim() || null,
            endedAt,
        },
    });
    revalidatePath(`/t/${slug}`);
}

// ------------------------------------------------------------- Tipos de turno
export async function createShiftType(slug, { name }) {
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "add");
    if (!name?.trim()) throw new Error("El nombre del turno es obligatorio");

    await prisma.shiftType.create({ data: { tenantId, name: name.trim() } });
    revalidatePath(`/t/${slug}`);
}

export async function updateShiftType(shiftTypeId, slug, { name, active }) {
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "edit");
    if (!name?.trim()) throw new Error("El nombre del turno es obligatorio");

    await updateOwned("shiftType", shiftTypeId, tenantId, { name: name.trim(), active: !!active }, "Tipo de turno no encontrado");
    revalidatePath(`/t/${slug}`);
}

export async function deleteShiftType(shiftTypeId, slug) {
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "delete");
    await deleteOwned("shiftType", shiftTypeId, tenantId, "Tipo de turno no encontrado");
    revalidatePath(`/t/${slug}`);
}
