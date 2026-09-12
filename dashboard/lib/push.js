import { prisma } from "./db.js";

let cachedMessaging = null;
let warned = false;

// Sin credenciales de Firebase configuradas, esto no hace nada (no truena la app).
// Para activarlo de verdad: crear un proyecto en Firebase, generar una service account key,
// y ponerla completa (el JSON) en la variable de entorno FIREBASE_SERVICE_ACCOUNT.
async function getMessaging() {
    if (cachedMessaging) return cachedMessaging;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
        if (!warned) {
            console.log("ℹ️ Notificaciones push desactivadas (falta FIREBASE_SERVICE_ACCOUNT).");
            warned = true;
        }
        return null;
    }
    try {
        const admin = (await import("firebase-admin")).default;
        const serviceAccount = JSON.parse(serviceAccountJson);
        const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        cachedMessaging = admin.messaging(app);
        return cachedMessaging;
    } catch (err) {
        console.error("❌ No se pudo inicializar Firebase Admin:", err);
        return null;
    }
}

export async function sendPushToTenant(tenantId, { title, body }) {
    const messaging = await getMessaging();
    if (!messaging) return;

    const tokens = await prisma.pushToken.findMany({ where: { staffUser: { tenantId } }, select: { token: true } });
    if (tokens.length === 0) return;

    try {
        await messaging.sendEachForMulticast({ tokens: tokens.map((t) => t.token), notification: { title, body } });
    } catch (err) {
        console.error("❌ No se pudo enviar la notificación push:", err);
    }
}

export async function notifyNewBooking(tenantId, { when, serviceName }) {
    const time = when.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
    await sendPushToTenant(tenantId, {
        title: "Nueva cita agendada",
        body: serviceName ? `${serviceName} a las ${time}` : `Cita a las ${time}`,
    });
}

export async function notifyHumanRequested(tenantId, { customerName, phone }) {
    await sendPushToTenant(tenantId, {
        title: "Un cliente quiere hablar con una persona",
        body: `${customerName || phone} está esperando en la bandeja de chats.`,
    });
}

export async function notifyConnectionLost(tenantId) {
    await sendPushToTenant(tenantId, {
        title: "El bot se desconectó de WhatsApp",
        body: "Revisa la conexión a internet del equipo donde corre el bot y vuelve a escanear el código QR si hace falta.",
    });
}
