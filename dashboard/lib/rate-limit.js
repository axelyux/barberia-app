// Limitador simple en memoria de proceso (suficiente para un solo servidor; si se
// escala a varias instancias detrás de un balanceador, esto habría que moverlo a
// Redis). Sirve para frenar fuerza bruta contra los logins sin agregar infraestructura.
const attempts = new Map(); // key -> { count, firstAttemptAt }

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;

// Limpieza periódica para no acumular memoria indefinidamente.
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
        if (now - entry.firstAttemptAt > WINDOW_MS) attempts.delete(key);
    }
}, WINDOW_MS).unref?.();

export function checkRateLimit(key) {
    const entry = attempts.get(key);
    if (!entry) return { blocked: false };
    if (Date.now() - entry.firstAttemptAt > WINDOW_MS) {
        attempts.delete(key);
        return { blocked: false };
    }
    if (entry.count >= MAX_ATTEMPTS) {
        const minutesLeft = Math.ceil((WINDOW_MS - (Date.now() - entry.firstAttemptAt)) / 60000);
        return { blocked: true, minutesLeft };
    }
    return { blocked: false };
}

export function recordFailedAttempt(key) {
    const entry = attempts.get(key);
    if (!entry || Date.now() - entry.firstAttemptAt > WINDOW_MS) {
        attempts.set(key, { count: 1, firstAttemptAt: Date.now() });
    } else {
        entry.count += 1;
    }
}

export function clearAttempts(key) {
    attempts.delete(key);
}
