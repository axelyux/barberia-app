"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { deleteOwned } from "@/lib/tenant-guard";

// WhatsApp rechaza un mensaje de texto de más de 4096 caracteres — sin este límite, un
// mensaje pegado demasiado largo se guardaría bien pero el bot fallaría en silencio al
// intentar mandarlo (queda registrado en logs, pero el cliente nunca recibe respuesta).
// 1000 dejamos bastante margen para lo que el código le agrega después (día/hora/precio).
const MAX_MESSAGE_LENGTH = 1000;
const VALID_KEYS = ["WELCOME", "SERVICES_INTRO", "BOOKING_ASK_DAY", "BOOKING_ASK_TIME", "BOOKING_CONFIRMED", "CONTACT", "CLOSED", "FALLBACK"];

export async function saveFlowMessages(slug, messages) {
    const { tenantId } = await requireTenantSession(slug, "BOT", "edit");

    for (const [key, text] of Object.entries(messages)) {
        if (!VALID_KEYS.includes(key)) continue;
        const trimmed = String(text ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
        if (!trimmed) continue;
        await prisma.flowMessage.upsert({
            where: { tenantId_key: { tenantId, key } },
            update: { text: trimmed },
            create: { tenantId, key, text: trimmed },
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
