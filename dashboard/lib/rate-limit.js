import { prisma } from "@/lib/db";

// Antes era un Map en memoria de proceso — funciona en un solo servidor de PM2, pero no
// en Vercel: cada invocación de una Server Action puede caer en una instancia serverless
// distinta sin memoria compartida, así que el conteo de intentos se movió a Postgres
// (tabla LoginAttempt). Solo protege los dos formularios de login.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;

export async function checkRateLimit(key) {
    const entry = await prisma.loginAttempt.findUnique({ where: { key } });
    if (!entry) return { blocked: false };
    if (Date.now() - entry.firstAttemptAt.getTime() > WINDOW_MS) {
        await prisma.loginAttempt.delete({ where: { key } }).catch(() => {});
        return { blocked: false };
    }
    if (entry.count >= MAX_ATTEMPTS) {
        const minutesLeft = Math.ceil((WINDOW_MS - (Date.now() - entry.firstAttemptAt.getTime())) / 60000);
        return { blocked: true, minutesLeft };
    }
    return { blocked: false };
}

export async function recordFailedAttempt(key) {
    const entry = await prisma.loginAttempt.findUnique({ where: { key } });
    if (!entry || Date.now() - entry.firstAttemptAt.getTime() > WINDOW_MS) {
        await prisma.loginAttempt.upsert({
            where: { key },
            update: { count: 1, firstAttemptAt: new Date() },
            create: { key, count: 1, firstAttemptAt: new Date() },
        });
    } else {
        await prisma.loginAttempt.update({ where: { key }, data: { count: { increment: 1 } } });
    }
}

export async function clearAttempts(key) {
    await prisma.loginAttempt.delete({ where: { key } }).catch(() => {});
}
