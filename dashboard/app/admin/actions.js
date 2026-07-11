"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/slug";

async function uniqueSlug(name) {
    const base = slugify(name) || "barberia";
    let candidate = base;
    let n = 1;
    while (await prisma.tenant.findUnique({ where: { slug: candidate } })) {
        n += 1;
        candidate = `${base}-${n}`;
    }
    return candidate;
}

export async function createTenant({ name, ownerName, planPriceCents, brandColor, logoUrl }) {
    if (!name?.trim()) throw new Error("El nombre de la barbería es obligatorio");

    const slug = await uniqueSlug(name);

    await prisma.tenant.create({
        data: {
            slug,
            name: name.trim(),
            ownerName: ownerName?.trim() || null,
            planPriceCents: Math.max(0, Math.round(planPriceCents) || 0),
            brandColor: brandColor || "#D9A441",
            logoUrl: logoUrl?.trim() || null,
            status: "ACTIVE",
            nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    });

    revalidatePath("/admin");
}

export async function updateTenant(tenantId, { name, ownerName, planPriceCents, brandColor, logoUrl }) {
    if (!name?.trim()) throw new Error("El nombre de la barbería es obligatorio");

    await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            name: name.trim(),
            ownerName: ownerName?.trim() || null,
            planPriceCents: Math.max(0, Math.round(planPriceCents) || 0),
            brandColor: brandColor || "#D9A441",
            logoUrl: logoUrl?.trim() || null,
        },
    });

    revalidatePath("/admin");
}

export async function markTenantPaid(tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error("Barbería no encontrada");

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
        prisma.payment.create({
            data: { tenantId, amountCents: tenant.planPriceCents, periodEnd },
        }),
        prisma.tenant.update({
            where: { id: tenantId },
            data: { status: "ACTIVE", nextDueDate: periodEnd },
        }),
    ]);

    revalidatePath("/admin");
}

export async function suspendTenant(tenantId) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "PAUSED" } });
    revalidatePath("/admin");
}

export async function reactivateTenant(tenantId) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
    revalidatePath("/admin");
}
