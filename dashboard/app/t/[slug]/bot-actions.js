"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { deleteOwned } from "@/lib/tenant-guard";

export async function saveFlowMessages(slug, messages) {
    const { tenantId } = await requireTenantSession(slug, "BOT", "edit");

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
    const { tenantId } = await requireTenantSession(slug, "BOT", "add");
    const cleanPhone = onlyDigits(phone ?? "");
    if (cleanPhone.length < 8) throw new Error("Escribe el número completo, con código de país (ej: 521833...).");

    await prisma.ignoredContact.create({
        data: { tenantId, phone: cleanPhone, label: label?.trim() || null },
    });
    revalidatePath(`/t/${slug}`);
}

export async function deleteIgnoredContact(id, slug) {
    const { tenantId } = await requireTenantSession(slug, "BOT", "delete");
    await deleteOwned("ignoredContact", id, tenantId, "Contacto no encontrado");
    revalidatePath(`/t/${slug}`);
}
