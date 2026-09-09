"use server";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/slug";
import { requireSuperAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { defaultFlowMessages } from "@/lib/flow-defaults";
import { validateLogoUrl } from "@/lib/validate-image";

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

// Fecha de vencimiento que viene del formulario (string "yyyy-mm-dd" de un <input
// type="date">) — si no es una fecha válida, cae al default de 30 días desde hoy.
function parseDueDate(nextDueDate) {
    if (nextDueDate) {
        const parsed = new Date(`${nextDueDate}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

export async function createTenant({ name, ownerName, planPriceCents, brandColor, logoUrl, nextDueDate }) {
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
            logoUrl: validateLogoUrl(logoUrl),
            status: "ACTIVE",
            nextDueDate: parseDueDate(nextDueDate),
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

    // Sin esto la barbería nueva arranca sin mensajes propios y el bot responde con
    // textos genéricos, sin su nombre. Se crean ya personalizados y editables.
    await prisma.flowMessage.createMany({
        data: defaultFlowMessages(tenant.name).map((m) => ({ tenantId: tenant.id, key: m.key, text: m.text })),
    });

    revalidatePath("/admin");
    return { slug, username: "admin", tempPassword };
}

export async function updateTenant(tenantId, { name, ownerName, planPriceCents, brandColor, logoUrl, nextDueDate }) {
    await requireSuperAdmin();
    if (!name?.trim()) throw new Error("El nombre de la barbería es obligatorio");

    await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            name: name.trim(),
            ownerName: ownerName?.trim() || null,
            planPriceCents: Math.max(0, Math.round(planPriceCents) || 0),
            brandColor: brandColor || "#D9A441",
            logoUrl: validateLogoUrl(logoUrl),
            ...(nextDueDate ? { nextDueDate: parseDueDate(nextDueDate) } : {}),
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

// Datos de conexión al bot de WhatsApp (API oficial de Meta). Están separados de
// updateTenant() porque metaAccessToken es un secreto: el panel nunca lo manda de vuelta
// al navegador, así que aquí "dejar en blanco" significa "no lo toques", no "bórralo".
export async function updateTenantWhatsapp(tenantId, { whatsappNumber, metaPhoneNumberId, metaAccessToken }) {
    await requireSuperAdmin();

    const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");
    const cleanPhoneNumberId = String(metaPhoneNumberId ?? "").trim();

    try {
        await prisma.tenant.update({
            where: { id: tenantId },
            data: {
                whatsappNumber: whatsappNumber ? onlyDigits(whatsappNumber) || null : null,
                metaPhoneNumberId: cleanPhoneNumberId || null,
                ...(metaAccessToken?.trim() ? { metaAccessToken: metaAccessToken.trim() } : {}),
            },
        });
    } catch (err) {
        if (err?.code === "P2002") {
            throw new Error("Ese número ya está vinculado a otra barbería — cada número solo puede pertenecer a una.");
        }
        throw err;
    }

    revalidatePath("/admin");
}

// Borra la barbería y TODO lo que le pertenece (usuarios, citas, ventas, mensajes de
// WhatsApp, etc. — todas las relaciones de Tenant tienen onDelete: Cascade). Es
// irreversible, por eso el nombre a confirmar se pide desde el panel antes de llamar esto.
export async function deleteTenant(tenantId, confirmName) {
    await requireSuperAdmin();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error("Barbería no encontrada");
    if (confirmName?.trim() !== tenant.name) {
        throw new Error("El nombre no coincide — escribe exactamente el nombre de la barbería para confirmar.");
    }

    await prisma.tenant.delete({ where: { id: tenantId } });
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
