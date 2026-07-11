import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// Sin dependencias de Next.js a propósito: lo importa tanto la app (lib/auth.js) como prisma/seed.js.
export function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
