"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { toCSV } from "@/lib/csv";
import { EXPENSE_CATEGORY_META } from "@/lib/finance";
import { shiftLabel } from "@/lib/format";
import { findOwnedOrThrow } from "@/lib/tenant-guard";
import { applyStockMovement } from "@/app/t/[slug]/inventory-actions";

// Folio consecutivo (#1, #2, #3...) puramente interno, para diferenciar un gasto de otro
// de un vistazo — no tiene nada que ver con receiptNumber (el folio/factura que puso el
// proveedor, si es que dio uno).
async function nextExpenseFolio(db, tenantId) {
    const tenant = await db.tenant.update({ where: { id: tenantId }, data: { expenseFolioSeq: { increment: 1 } }, select: { expenseFolioSeq: true } });
    return tenant.expenseFolioSeq;
}

export async function createExpense(
    slug,
    { category, description, amountCents, productId, quantity, paymentMethod, fromCashRegister, vendor, receiptNumber, isRecurring, paidByName, createdAt }
) {
    const { user, tenantId } = await requireTenantSession(slug, "FINANZAS", "add");
    if (!description?.trim()) throw new Error("La descripción es obligatoria");
    if (productId) await findOwnedOrThrow("product", productId, tenantId, "Producto no encontrado");

    const qty = productId ? Math.max(1, Math.round(quantity) || 1) : null;
    const data = {
        tenantId,
        category,
        description: description.trim(),
        amountCents: Math.max(0, Math.round(amountCents) || 0),
        productId: productId || null,
        quantity: qty,
        paymentMethod: paymentMethod || "EFECTIVO",
        fromCashRegister: fromCashRegister !== false,
        vendor: vendor?.trim() || null,
        receiptNumber: receiptNumber?.trim() || null,
        isRecurring: !!isRecurring,
        paidByName: paidByName?.trim() || null,
        // Turno en el que se registró: queda fijo aunque después se edite la fecha.
        cashShiftId: (await prisma.cashShift.findFirst({ where: { tenantId, status: "ABIERTO" }, select: { id: true } }))?.id ?? null,
    };
    if (createdAt) data.createdAt = new Date(createdAt);

    if (productId) {
        await prisma.$transaction(async (tx) => {
            data.folio = await nextExpenseFolio(tx, tenantId);
            await tx.expense.create({ data });
            await applyStockMovement(tx, { tenantId, productId, type: "ENTRADA", quantity: qty, reason: "Compra", createdByName: user.name });
        });
    } else {
        data.folio = await nextExpenseFolio(prisma, tenantId);
        await prisma.expense.create({ data });
    }
    revalidatePath(`/t/${slug}`);
}

export async function updateExpense(
    expenseId,
    slug,
    { category, description, amountCents, productId, quantity, paymentMethod, fromCashRegister, vendor, receiptNumber, isRecurring, paidByName, createdAt }
) {
    const { user, tenantId } = await requireTenantSession(slug, "FINANZAS", "edit");
    if (!description?.trim()) throw new Error("La descripción es obligatoria");

    const existing = await findOwnedOrThrow("expense", expenseId, tenantId, "Gasto no encontrado");
    if (existing.cancelledAt) throw new Error("Este gasto está cancelado y ya no se puede editar.");
    if (productId) await findOwnedOrThrow("product", productId, tenantId, "Producto no encontrado");

    const newQty = productId ? Math.max(1, Math.round(quantity) || 1) : null;
    const data = {
        category,
        description: description.trim(),
        amountCents: Math.max(0, Math.round(amountCents) || 0),
        productId: productId || null,
        quantity: newQty,
        paymentMethod: paymentMethod || "EFECTIVO",
        fromCashRegister: fromCashRegister !== false,
        vendor: vendor?.trim() || null,
        receiptNumber: receiptNumber?.trim() || null,
        isRecurring: !!isRecurring,
        paidByName: paidByName?.trim() || null,
    };
    if (createdAt) data.createdAt = new Date(createdAt);

    await prisma.$transaction(async (tx) => {
        await tx.expense.updateMany({ where: { id: expenseId, tenantId }, data });

        if (existing.productId && existing.productId !== productId) {
            // Se quitó o cambió el producto: revertimos el stock que había sumado el gasto anterior.
            await applyStockMovement(tx, {
                tenantId,
                productId: existing.productId,
                type: "SALIDA",
                quantity: existing.quantity ?? 0,
                reason: "Se quitó del gasto",
                createdByName: user.name,
            });
        }
        if (productId && existing.productId === productId) {
            const delta = newQty - (existing.quantity ?? 0);
            if (delta !== 0) {
                await applyStockMovement(tx, {
                    tenantId,
                    productId,
                    type: delta > 0 ? "ENTRADA" : "SALIDA",
                    quantity: Math.abs(delta),
                    reason: "Ajuste al editar gasto",
                    createdByName: user.name,
                });
            }
        } else if (productId && existing.productId !== productId) {
            await applyStockMovement(tx, { tenantId, productId, type: "ENTRADA", quantity: newQty, reason: "Compra (agregada al editar)", createdByName: user.name });
        }
    });
    revalidatePath(`/t/${slug}`);
}

export async function getExpensesForRange(slug, { from, to }) {
    const { tenantId } = await requireTenantSession(slug, "FINANZAS", "view");
    const expenses = await prisma.expense.findMany({
        where: { tenantId, createdAt: { gte: new Date(from), lte: new Date(to) } },
        include: { product: true, cashShift: { select: { id: true, startedAt: true, shiftType: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
    });
    return expenses.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
        cancelledAt: e.cancelledAt?.toISOString() ?? null,
        cashShift: undefined,
        shiftLabel: shiftLabel(e.cashShift),
    }));
}

export async function exportExpensesCSV(slug, { from, to }) {
    const { tenantId } = await requireTenantSession(slug, "FINANZAS", "view");
    const expenses = await prisma.expense.findMany({
        where: { tenantId, createdAt: { gte: new Date(from), lte: new Date(to) } },
        include: { product: true, cashShift: { select: { id: true, startedAt: true, shiftType: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
    });
    return toCSV(expenses, [
        { label: "Folio", value: (e) => e.folio || "" },
        { label: "Estado", value: (e) => (e.cancelledAt ? "CANCELADO" : "Activo") },
        { label: "Cancelado por", value: (e) => e.cancelledByName ?? "" },
        { label: "Motivo de cancelación", value: (e) => e.cancelReason ?? "" },
        { label: "Fecha", value: (e) => e.createdAt.toLocaleString("es-MX") },
        { label: "Turno", value: (e) => shiftLabel(e.cashShift) ?? "" },
        { label: "Categoría", value: (e) => EXPENSE_CATEGORY_META[e.category].label },
        { label: "Descripción", value: (e) => e.description },
        { label: "Monto", value: (e) => (e.amountCents / 100).toFixed(2) },
        { label: "Método de pago", value: (e) => e.paymentMethod },
        { label: "Salió de la caja", value: (e) => (e.paymentMethod === "EFECTIVO" ? (e.fromCashRegister ? "Sí" : "No") : "") },
        { label: "Producto comprado", value: (e) => (e.product ? `${e.product.name} x${e.quantity}` : "") },
        { label: "Proveedor", value: (e) => e.vendor ?? "" },
        { label: "Folio/factura", value: (e) => e.receiptNumber ?? "" },
        { label: "Recurrente", value: (e) => (e.isRecurring ? "Sí" : "No") },
        { label: "Pagado por", value: (e) => e.paidByName ?? "" },
    ]);
}

// Cancelar (no borrar), igual que en ventas: el gasto se queda registrado con quién lo
// canceló y por qué, pero deja de contar para finanzas y para el efectivo de la caja. Si
// era una compra de stock, las piezas que había sumado se devuelven.
export async function cancelExpense(expenseId, slug, { reason } = {}) {
    const { user, tenantId } = await requireTenantSession(slug, "FINANZAS", "delete");
    const existing = await findOwnedOrThrow("expense", expenseId, tenantId, "Gasto no encontrado");
    if (existing.cancelledAt) throw new Error("Este gasto ya estaba cancelado.");

    await prisma.$transaction(async (tx) => {
        await tx.expense.updateMany({
            where: { id: expenseId, tenantId },
            data: { cancelledAt: new Date(), cancelledByName: user.name, cancelReason: reason?.trim() || null },
        });
        if (existing.productId && existing.quantity) {
            await applyStockMovement(tx, {
                tenantId,
                productId: existing.productId,
                type: "SALIDA",
                quantity: existing.quantity,
                reason: "Gasto de compra cancelado",
                createdByName: user.name,
            });
        }
    });
    revalidatePath(`/t/${slug}`);
}
