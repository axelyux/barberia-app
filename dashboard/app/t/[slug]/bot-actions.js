"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

export async function saveFlowMessages(slug, messages) {
    await requirePermission("BOT", "edit");
    const tenantId = await tenantIdFromSlug(slug);

    for (const [key, text] of Object.entries(messages)) {
        await prisma.flowMessage.upsert({
            where: { tenantId_key: { tenantId, key } },
            update: { text },
            create: { tenantId, key, text },
        })
    }
    revalidatePath(`/t/${slug}`);
}

// ---------------------------------------------------------- Contactos ignorados
const onlyDigits = (phone) => phone.replace(/\D/g, "");

export async function createIgnoredContact(slug, { phone, label }) {
    await requirePermission("BOT", "add");
    const cleanPhone = onlyDigits(phone ?? "");
    if (cleanPhone.length < 8) throw new Error("Escribe el número completo, con código de país (ej: 521833...).");
    const tenantId = await tenantIdFromSlug(slug);

    await prisma.ignoredContact.create({
        data: { tenantId, phone: cleanPhone, label: label?.trim() || null },
    });
    revalidatePath(`/t/${slug}`);
}

export async function deleteIgnoredContact(id, slug) {
    await requirePermission("BOT", "delete");
    await prisma.ignoredContact.delete({ where: { id } });
    revalidatePath(`/t/${slug}`);
}
