import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleIncomingMessage } from "@/lib/whatsapp-flow";
import { logError } from "@/lib/log";

// Meta firma cada POST con HMAC-SHA256 del body crudo, usando el App Secret (Meta App ->
// Configuración -> Básica -> "Clave secreta de la app"), y lo manda en el header
// X-Hub-Signature-256 como "sha256=<hex>". Sin esto, cualquiera que conozca el
// phone_number_id de una barbería (no es secreto, aparece en la consola de Meta) podía
// mandar mensajes falsos directo a este endpoint sin pasar por WhatsApp para nada.
function isValidSignature(rawBody, signatureHeader) {
    const secret = process.env.META_APP_SECRET;
    if (!secret) {
        // Sin META_APP_SECRET configurado, no podemos verificar — se deja pasar (no se
        // rompe el bot ya en producción) pero se deja bien claro en los logs que la
        // verificación está apagada, para que se configure cuanto antes.
        logError("whatsapp.webhook", new Error("META_APP_SECRET no configurado — firma del webhook sin verificar"));
        return true;
    }
    if (!signatureHeader?.startsWith("sha256=")) return false;

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const provided = signatureHeader.slice("sha256=".length);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
}

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
    const rawBody = await request.text();

    if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
        logError("whatsapp.webhook", new Error("Firma inválida — payload rechazado"));
        return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    let payload;
    try {
        payload = JSON.parse(rawBody);
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
