import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleIncomingMessage } from "@/lib/whatsapp-flow";
import { logError } from "@/lib/log";

// Único punto de entrada público para el webhook de WhatsApp (Meta solo permite UNA URL
// de callback por App). Reemplaza a webhook-router.js + whatsapp-meta-bot.js del VPS:
// aquí no hay "un puerto por barbería" — cada mensaje se resuelve a su Tenant por
// metaPhoneNumberId dentro de esta misma función, y como es serverless no hay proceso
// que mantener prendido.

// Verificación del webhook (handshake de Meta): responde el mismo challenge si el
// verify token coincide. Sin fallback — si falta la variable, esto siempre da 403.
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (mode === "subscribe" && token && process.env.META_VERIFY_TOKEN && token === process.env.META_VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse("Forbidden", { status: 403 });
}

function extractIncoming(value) {
    const message = value?.messages?.[0];
    if (!message) return null;
    const pushName = value?.contacts?.[0]?.profile?.name ?? null;
    const from = message.from;

    if (message.type === "text") {
        return { from, body: message.text?.body ?? "", pushName };
    }
    if (message.type === "interactive") {
        const body =
            message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.id ?? message.interactive?.list_reply?.title ?? "";
        return { from, body, pushName };
    }
    // Otros tipos (imagen, audio, ubicación, etc.) no se procesan — el bot solo entiende texto/botones/listas.
    return { from, body: "", pushName };
}

export async function POST(request) {
    let payload;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    try {
        const value = payload?.entry?.[0]?.changes?.[0]?.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) {
            // Eventos que no son de mensajes (ej. confirmaciones de entrega) — se ignoran.
            return NextResponse.json({ ok: true });
        }

        const tenant = await prisma.tenant.findUnique({ where: { metaPhoneNumberId: phoneNumberId } });
        if (!tenant) {
            logError("whatsapp.webhook", new Error("phone_number_id sin barbería registrada"), { phoneNumberId });
            return NextResponse.json({ ok: true });
        }

        const incoming = extractIncoming(value);
        if (!incoming || !incoming.from) {
            return NextResponse.json({ ok: true });
        }

        await handleIncomingMessage({ tenant, from: incoming.from, body: incoming.body, pushName: incoming.pushName });
    } catch (err) {
        // Siempre respondemos 200: Meta reintenta agresivamente si no le contestamos rápido,
        // y un error de nuestro lado no debe convertirse en una tormenta de reintentos.
        logError("whatsapp.webhook", err);
    }

    return NextResponse.json({ ok: true });
}
