"use server";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/slug";
import { requireSuperAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

const MODULES = ["CITAS", "SERVICIOS", "PRODUCTOS", "FINANZAS", "BOT", "SEGURIDAD"];

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

// Contraseña temporal legible (evita caracteres ambiguos como 0/O, 1/l/I).
function generateTempPassword() {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const bytes = randomBytes(10);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function createTenant({ name, ownerName, planPriceCents, brandColor, logoUrl }) {
    await requireSuperAdmin();
    if (!name?.trim()) throw new Error("El nombre de la barbería es obligatorio");

    const slug = await uniqueSlug(name);
    const tempPassword = generateTempPassword();

    const tenant = await prisma.tenant.create({
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

    // Sin esto, la barbería recién creada no tiene ningún StaffUser: nadie puede
    // iniciar sesión, y crear usuarios nuevos requiere estar ya logueado (círculo
    // sin salida). Este usuario "admin" con todos los permisos es la puerta de entrada.
    const owner = await prisma.staffUser.create({
        data: {
            tenantId: tenant.id,
            name: ownerName?.trim() || name.trim(),
            username: "admin",
            role: "ADMIN",
            passwordHash: hashPassword(tempPassword),
        },
    });
    for (const moduleKey of MODULES) {
        await prisma.permission.create({
            data: { staffUserId: owner.id, module: moduleKey, canView: true, canAdd: true, canEdit: true, canDelete: true },
        });
    }

    revalidatePath("/admin");
    return { slug, username: "admin", tempPassword };
}

export async function updateTenant(tenantId, { name, ownerName, planPriceCents, brandColor, logoUrl }) {
    await requireSuperAdmin();
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
    await requireSuperAdmin();
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
    await requireSuperAdmin();
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "PAUSED" } });
    revalidatePath("/admin");
}

export async function reactivateTenant(tenantId) {
    await requireSuperAdmin();
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
    revalidatePath("/admin");
}
