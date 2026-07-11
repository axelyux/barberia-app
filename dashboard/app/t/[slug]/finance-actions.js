"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

export async function createExpense(slug, { category, description, amountCents }) {
    await requirePermission("FINANZAS", "add");
    if (!description?.trim()) throw new Error("La descripción es obligatoria");
    const tenantId = await tenantIdFromSlug(slug);

    await prisma.expense.create({
        data: {
            tenantId,
            category,
            description: description.trim(),
            amountCents: Math.max(0, Math.round(amountCents) || 0),
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function deleteExpense(expenseId, slug) {
    await requirePermission("FINANZAS", "delete");
    await prisma.expense.delete({ where: { id: expenseId } });
    revalidatePath(`/t/${slug}`);
}
