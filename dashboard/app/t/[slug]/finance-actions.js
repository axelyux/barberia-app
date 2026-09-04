"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { toCSV } from "@/lib/csv";
import { EXPENSE_CATEGORY_META } from "@/lib/finance";
import { findOwnedOrThrow } from "@/lib/tenant-guard";

export async function createExpense(
    slug,
    { category, description, amountCents, productId, quantity, paymentMethod, vendor, receiptNumber, isRecurring, paidByName, createdAt }
) {
    const { tenantId } = await requireTenantSession(slug, "FINANZAS", "add");
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
        vendor: vendor?.trim() || null,
        receiptNumber: receiptNumber?.trim() || null,
        isRecurring: !!isRecurring,
        paidByName: paidByName?.trim() || null,
    };
    if (createdAt) data.createdAt = new Date(createdAt);

    if (productId) {
        await prisma.$transaction([
            prisma.expense.create({ data }),
            prisma.product.update({ where: { id: productId }, data: { stock: { increment: qty } } }),
        ]);
    } else {
        await prisma.expense.create({ data });
    }
    revalidatePath(`/t/${slug}`);
}

export async function updateExpense(
    expenseId,
    slug,
    { category, description, amountCents, productId, quantity, paymentMethod, vendor, receiptNumber, isRecurring, paidByName, createdAt }
) {
    const { tenantId } = await requireTenantSession(slug, "FINANZAS", "edit");
    if (!description?.trim()) throw new Error("La descripción es obligatoria");

    const existing = await findOwnedOrThrow("expense", expenseId, tenantId, "Gasto no encontrado");
    if (productId) await findOwnedOrThrow("product", productId, tenantId, "Producto no encontrado");

    const newQty = productId ? Math.max(1, Math.round(quantity) || 1) : null;
    const data = {
        category,
        description: description.trim(),
        amountCents: Math.max(0, Math.round(amountCents) || 0),
        productId: productId || null,
        quantity: newQty,
        paymentMethod: paymentMethod || "EFECTIVO",
        vendor: vendor?.trim() || null,
        receiptNumber: receiptNumber?.trim() || null,
        isRecurring: !!isRecurring,
        paidByName: paidByName?.trim() || null,
    };
    if (createdAt) data.createdAt = new Date(createdAt);

    const stockOps = [];
    if (existing.productId && existing.productId !== productId) {
        // Se quitó o cambió el producto: revertimos el stock que había sumado el gasto anterior.
        stockOps.push(prisma.product.update({ where: { id: existing.productId }, data: { stock: { decrement: existing.quantity ?? 0 } } }));
    }
    if (productId && existing.productId === productId) {
        const delta = newQty - (existing.quantity ?? 0);
        if (delta !== 0) stockOps.push(prisma.product.update({ where: { id: productId }, data: { stock: { increment: delta } } }));
    } else if (productId && existing.productId !== productId) {
        stockOps.push(prisma.product.update({ where: { id: productId }, data: { stock: { increment: newQty } } }));
    }

    await prisma.$transaction([prisma.expense.updateMany({ where: { id: expenseId, tenantId }, data }), ...stockOps]);
    revalidatePath(`/t/${slug}`);
}

export async function getExpensesForRange(slug, { from, to }) {
    const { tenantId } = await requireTenantSession(slug, "FINANZAS", "view");
    const expenses = await prisma.expense.findMany({
        where: { tenantId, createdAt: { gte: new Date(from), lte: new Date(to) } },
        include: { product: true },
        orderBy: { createdAt: "desc" },
    });
    return expenses.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
}

export async function exportExpensesCSV(slug, { from, to }) {
    const { tenantId } = await requireTenantSession(slug, "FINANZAS", "view");
    const expenses = await prisma.expense.findMany({
        where: { tenantId, createdAt: { gte: new Date(from), lte: new Date(to) } },
        include: { product: true },
        orderBy: { createdAt: "asc" },
    });
    return toCSV(expenses, [
        { label: "Fecha", value: (e) => e.createdAt.toLocaleString("es-MX") },
        { label: "Categoría", value: (e) => EXPENSE_CATEGORY_META[e.category].label },
        { label: "Descripción", value: (e) => e.description },
        { label: "Monto", value: (e) => (e.amountCents / 100).toFixed(2) },
        { label: "Método de pago", value: (e) => e.paymentMethod },
        { label: "Producto comprado", value: (e) => (e.product ? `${e.product.name} x${e.quantity}` : "") },
        { label: "Proveedor", value: (e) => e.vendor ?? "" },
        { label: "Folio/factura", value: (e) => e.receiptNumber ?? "" },
        { label: "Recurrente", value: (e) => (e.isRecurring ? "Sí" : "No") },
        { label: "Pagado por", value: (e) => e.paidByName ?? "" },
    ]);
}

export async function deleteExpense(expenseId, slug) {
    const { tenantId } = await requireTenantSession(slug, "FINANZAS", "delete");
    const existing = await findOwnedOrThrow("expense", expenseId, tenantId, "Gasto no encontrado");

    const ops = [];
    if (existing.productId && existing.quantity) {
        const product = await prisma.product.findFirst({ where: { id: existing.productId, tenantId } });
        if (product) {
            ops.push(
                prisma.product.update({
                    where: { id: existing.productId },
                    data: { stock: Math.max(0, product.stock - existing.quantity) },
                })
            );
        }
    }
    await prisma.$transaction([prisma.expense.deleteMany({ where: { id: expenseId, tenantId } }), ...ops]);
    revalidatePath(`/t/${slug}`);
}
