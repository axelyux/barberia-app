"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { toCSV } from "@/lib/csv";
import { EXPENSE_CATEGORY_META } from "@/lib/finance";

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

export async function createExpense(
    slug,
    { category, description, amountCents, productId, quantity, paymentMethod, vendor, receiptNumber, isRecurring, paidByName, createdAt }
) {
    await requirePermission("FINANZAS", "add");
    if (!description?.trim()) throw new Error("La descripción es obligatoria");
    const tenantId = await tenantIdFromSlug(slug);

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
    await requirePermission("FINANZAS", "edit");
    if (!description?.trim()) throw new Error("La descripción es obligatoria");

    const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!existing) throw new Error("Gasto no encontrado");

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

    await prisma.$transaction([prisma.expense.update({ where: { id: expenseId }, data }), ...stockOps]);
    revalidatePath(`/t/${slug}`);
}

export async function getExpensesForRange(slug, { from, to }) {
    await requirePermission("FINANZAS", "view");
    const tenantId = await tenantIdFromSlug(slug);
    const expenses = await prisma.expense.findMany({
        where: { tenantId, createdAt: { gte: new Date(from), lte: new Date(to) } },
        include: { product: true },
        orderBy: { createdAt: "desc" },
    });
    return expenses.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
}

export async function exportExpensesCSV(slug, { from, to }) {
    await requirePermission("FINANZAS", "view");
    const tenantId = await tenantIdFromSlug(slug);
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
    await requirePermission("FINANZAS", "delete");
    const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!existing) throw new Error("Gasto no encontrado");

    const ops = [prisma.expense.delete({ where: { id: expenseId } })];
    if (existing.productId && existing.quantity) {
        const product = await prisma.product.findUnique({ where: { id: existing.productId } });
        if (product) {
            ops.push(
                prisma.product.update({
                    where: { id: existing.productId },
                    data: { stock: Math.max(0, product.stock - existing.quantity) },
                })
            );
        }
    }
    await prisma.$transaction(ops);
    revalidatePath(`/t/${slug}`);
}
