import { timingSafeEqual, createHmac } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_SECRET } from "@/lib/env";
import { DEFAULT_TIME_ZONE } from "@/lib/scheduling";

export { hashPassword, verifyPassword } from "@/lib/password";

const COOKIE_NAME = "barber_session";
const ADMIN_COOKIE_NAME = "barber_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function sign(payload) {
    const payloadB64 = b64url(JSON.stringify(payload));
    const sig = b64url(createHmac("sha256", SESSION_SECRET).update(payloadB64).digest());
    return `${payloadB64}.${sig}`;
}

function unsign(token) {
    if (!token) return null;
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;
    const expectedSig = b64url(createHmac("sha256", SESSION_SECRET).update(payloadB64).digest());
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

export async function createSession(staffUserId, sessionVersion = 0) {
    const token = sign({ uid: staffUserId, ver: sessionVersion, exp: Date.now() + SESSION_TTL_MS });
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
// Rechaza la sesión si la cuenta fue desactivada o si su sessionVersion ya no coincide
// (contraseña cambiada, o cierre de sesión forzado) — ver requireTenantSession más abajo.
export async function getSessionUser() {
    const store = await cookies();
    const payload = unsign(store.get(COOKIE_NAME)?.value);
    if (!payload) return null;

    const user = await prisma.staffUser.findUnique({
        where: { id: payload.uid },
        include: { permissions: true, tenant: true },
    });
    if (!user || !user.active) return null;
    if ((payload.ver ?? 0) !== user.sessionVersion) return null;
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

// Punto único de autorización para las Server Actions de /t/[slug]. A diferencia de
// requirePermission (que solo mira los permisos del usuario), esta función además
// EXIGE que el "slug" que llega como argumento de la función coincida con el tenant
// real de la sesión — el tenantId nunca sale del argumento del cliente, siempre de la
// cookie firmada del servidor. Sin esto, cualquier Server Action podía invocarse con
// el slug de OTRA barbería y operar sobre sus datos, porque el permiso se validaba
// contra el módulo pero el tenantId se resolvía por el slug recibido, no por la sesión.
export async function requireTenantSession(slug, moduleKey, action) {
    const user = await getSessionUser();
    if (!user) throw new Error("Debes iniciar sesión.");
    if (!slug || user.tenant?.slug !== slug) {
        throw new Error("No tienes acceso a esta barbería.");
    }
    // El super-admin pudo haber pausado esta barbería DESPUÉS de que este usuario ya
    // tenía la página abierta — bloquea cualquier acción a partir de ahí, no solo la
    // siguiente carga de página (ver también /t/[slug]/page.js).
    if (user.tenant.status === "PAUSED") {
        throw new Error("Esta barbería fue desactivada. Contacta a tu administrador.");
    }
    if (moduleKey) {
        const perm = user.permissions.find((p) => p.module === moduleKey);
        const field = { view: "canView", add: "canAdd", edit: "canEdit", delete: "canDelete" }[action];
        if (!perm?.[field]) throw new Error("No tienes permiso para hacer esto.");
    }
    // timeZone se devuelve aquí porque casi toda acción que toca fechas lo necesita (qué
    // hora "es" en la barbería, a qué día pertenece una venta) y así no hay que volver a
    // consultar el tenant en cada una.
    return { user, tenantId: user.tenantId, timeZone: user.tenant.timeZone ?? DEFAULT_TIME_ZONE };
}

// --- Sesión del dueño de la plataforma (admin supremo), separada de la de cada barbería ---

export async function createAdminSession(superAdminId, sessionVersion = 0) {
    const token = sign({ uid: superAdminId, ver: sessionVersion, exp: Date.now() + SESSION_TTL_MS });
    const store = await cookies();
    store.set(ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_MS / 1000,
    });
}

export async function destroyAdminSession() {
    const store = await cookies();
    store.delete(ADMIN_COOKIE_NAME);
}

export async function getSuperAdmin() {
    const store = await cookies();
    const payload = unsign(store.get(ADMIN_COOKIE_NAME)?.value);
    if (!payload) return null;
    const admin = await prisma.superAdmin.findUnique({ where: { id: payload.uid } });
    if (!admin) return null;
    if ((payload.ver ?? 0) !== admin.sessionVersion) return null;
    return admin;
}

export async function requireSuperAdmin() {
    const admin = await getSuperAdmin();
    if (!admin) throw new Error("Debes iniciar sesión como administrador.");
    return admin;
}
