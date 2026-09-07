"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { sendText } from "@/lib/whatsapp-graph";

const HUMAN_TAKEOVER_MS = 2 * 60 * 60 * 1000;

// Lista de conversaciones (una por número), ordenada por el mensaje más reciente. La
// fuente de verdad son los WhatsappMessage guardados (persisten aunque la reserva ya se
// haya completado y se borre el ConversationState del flujo del bot).
export async function getConversations(slug) {
    const { tenantId } = await requireTenantSession(slug, "BOT", "view");

    const groups = await prisma.whatsappMessage.groupBy({
        by: ["phone"],
        where: { tenantId },
    });
    if (groups.length === 0) return [];
    const phones = groups.map((g) => g.phone);

    const [lastMessages, customers, states] = await Promise.all([
        prisma.whatsappMessage.findMany({
            where: { tenantId, phone: { in: phones } },
            orderBy: { createdAt: "desc" },
        }),
        prisma.customer.findMany({ where: { tenantId, phone: { in: phones } } }),
        prisma.conversationState.findMany({ where: { tenantId, phone: { in: phones } } }),
    ]);

    const lastByPhone = new Map();
    for (const m of lastMessages) {
        if (!lastByPhone.has(m.phone)) lastByPhone.set(m.phone, m);
    }
    const customerByPhone = new Map(customers.map((c) => [c.phone, c]));
    const stateByPhone = new Map(states.map((s) => [s.phone, s]));

    return phones
        .map((phone) => {
            const last = lastByPhone.get(phone);
            const state = stateByPhone.get(phone);
            return {
                phone,
                customerName: customerByPhone.get(phone)?.name ?? null,
                lastMessage: last?.body ?? "",
                lastDirection: last?.direction ?? "IN",
                lastAt: last?.createdAt ?? null,
                humanActive: !!(state?.humanUntil && state.humanUntil.getTime() > Date.now()),
            };
        })
        .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
}

export async function getMessages(slug, phone) {
    const { tenantId } = await requireTenantSession(slug, "BOT", "view");
    return prisma.whatsappMessage.findMany({
        where: { tenantId, phone },
        orderBy: { createdAt: "asc" },
        take: 200,
    });
}

// Manda un mensaje manual desde el panel (el barbero contestando él mismo). Al hacerlo,
// toma la conversación por 2h más (extiende/activa humanUntil) para que el bot no le
// conteste encima al cliente mientras el barbero sigue escribiendo.
export async function sendManualMessage(slug, phone, text) {
    const { user, tenantId } = await requireTenantSession(slug, "BOT", "edit");
    const body = text?.trim();
    if (!body) throw new Error("Escribe un mensaje.");

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error("Barbería no encontrada.");

    await sendText(tenant, phone, body);
    await prisma.whatsappMessage.create({
        data: { tenantId, phone, direction: "OUT", body, sentByName: user.name },
    });

    const humanUntil = new Date(Date.now() + HUMAN_TAKEOVER_MS);
    await prisma.conversationState.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        update: { humanUntil },
        create: { tenantId, phone, humanUntil, data: {} },
    });

    revalidatePath(`/t/${slug}`);
}

// "Devolver al bot": el barbero termina de atender manualmente y deja que el bot
// vuelva a contestar automáticamente los próximos mensajes de este cliente.
export async function releaseToBot(slug, phone) {
    const { tenantId } = await requireTenantSession(slug, "BOT", "edit");
    await prisma.conversationState.updateMany({
        where: { tenantId, phone },
        data: { humanUntil: null },
    });
    revalidatePath(`/t/${slug}`);
}
