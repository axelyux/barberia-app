import { timingSafeEqual, createHmac } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export { hashPassword, verifyPassword } from "@/lib/password";

const SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me";
const COOKIE_NAME = "barber_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function sign(payload) {
    const payloadB64 = b64url(JSON.stringify(payload));
    const sig = b64url(createHmac("sha256", SECRET).update(payloadB64).digest());
    return `${payloadB64}.${sig}`;
}

function unsign(token) {
    if (!token) return null;
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;
    const expectedSig = b64url(createHmac("sha256", SECRET).update(payloadB64).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

export async function createSession(staffUserId) {
    const token = sign({ uid: staffUserId, exp: Date.now() + SESSION_TTL_MS });
    const store = await cookies();
    store.set(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_MS / 1000,
    });
}

export async function destroySession() {
    const store = await cookies();
    store.delete(COOKIE_NAME);
}

// Usuario logueado actual (o null), con sus permisos por módulo ya incluidos.
export async function getSessionUser() {
    const store = await cookies();
    const payload = unsign(store.get(COOKIE_NAME)?.value);
    if (!payload) return null;

    const user = await prisma.staffUser.findUnique({
        where: { id: payload.uid },
        include: { permissions: true, tenant: true },
    });
    return user;
}

// Lanza un error si el usuario logueado no tiene el permiso pedido. Úsalo al inicio de cada server action.
export async function requirePermission(moduleKey, action) {
    const user = await getSessionUser();
    if (!user) throw new Error("Debes iniciar sesión.");
    const perm = user.permissions.find((p) => p.module === moduleKey);
    const field = { view: "canView", add: "canAdd", edit: "canEdit", delete: "canDelete" }[action];
    if (!perm?.[field]) throw new Error("No tienes permiso para hacer esto.");
    return user;
}
