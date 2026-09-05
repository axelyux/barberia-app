// Llamadas directas a la Graph API de Meta (WhatsApp Cloud API) — sin @builderbot/bot.
// Payloads copiados del código fuente de @builderbot/provider-meta para que tengan
// exactamente la misma forma que ya se probó, sin arrastrar todo ese paquete (pensado
// para un proceso persistente) a una función serverless.
const GRAPH_VERSION = "v22.0";

async function callGraphApi(tenant, body) {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${tenant.metaPhoneNumberId}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${tenant.metaAccessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Meta Graph API respondió ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
}

export async function sendText(tenant, to, text) {
    return callGraphApi(tenant, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
    });
}

// buttons: [{ body: "Texto" }, ...] — máximo 3, título hasta 20 caracteres (límite de Meta).
export async function sendButtons(tenant, to, text, buttons) {
    return callGraphApi(tenant, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text },
            action: {
                buttons: buttons.map((btn, i) => ({
                    type: "reply",
                    reply: { id: `btn-${i}`, title: btn.body.slice(0, 20) },
                })),
            },
        },
    });
}

// sections: [{ title, rows: [{ id, title, description }] }]
export async function sendList(tenant, to, { body, footer, buttonLabel, sections }) {
    return callGraphApi(tenant, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
            type: "list",
            body: { text: body },
            ...(footer ? { footer: { text: footer } } : {}),
            action: { button: buttonLabel, sections },
        },
    });
}
