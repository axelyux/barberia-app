"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, destroySession } from "@/lib/auth";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit";

export async function login(prevState, formData) {
    const rawBarberia = String(formData.get("tenantSlug") ?? "").trim();
    const tenantSlug = rawBarberia.toLowerCase();
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const rateLimitKey = `staff:${tenantSlug}:${username}`;

    const { blocked, minutesLeft } = await checkRateLimit(rateLimitKey);
    if (blocked) {
        return { error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minuto(s).` };
    }

    // username es único solo por barbería (varias barberías pueden tener "admin"),
    // así que sin escopear por tenant esto haría login en la barbería equivocada. El
    // campo "Barbería" acepta tanto el slug original (fijo desde que se creó, ej.
    // "sable-barber-studio") como el nombre actual (ej. "Sable Barber Studio") —
    // cualquiera que renombre su barbería desde Ajustes espera poder seguir entrando
    // con ese nuevo nombre, no con un identificador que nunca vio.
    const user = await prisma.staffUser.findFirst({
        where: { username, tenant: { OR: [{ slug: tenantSlug }, { name: { equals: rawBarberia, mode: "insensitive" } }] } },
        include: { tenant: true },
    });
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
        await recordFailedAttempt(rateLimitKey);
        return { error: "Barbería, usuario o contraseña incorrectos." };
    }

    // Las credenciales son correctas, pero el super-admin desactivó esta barbería — se
    // le dice explícito en vez de dejarlo entrar o darle el mismo error genérico.
    if (user.tenant.status === "PAUSED") {
        return { error: "Esta barbería fue desactivada. Contacta a tu administrador." };
    }

    await clearAttempts(rateLimitKey);
    await createSession(user.id, user.sessionVersion);
    redirect(`/t/${user.tenant.slug}`);
}

export async function logout() {
    await destroySession();
    redirect("/login");
}

// Color/logo de marca de una barbería por su slug, para pintar el botón de "Entrar" del
// login con el color que esa barbería configuró (en vez del ámbar por defecto) — no es
// información sensible (ya se ve en los mensajes de WhatsApp del bot), así que no
// requiere sesión. Se usa solo para la vista previa mientras el usuario escribe.
export async function getTenantBrand(slug) {
    const rawBarberia = String(slug ?? "").trim();
    const tenantSlug = rawBarberia.toLowerCase();
    if (!tenantSlug) return null;
    const tenant = await prisma.tenant.findFirst({
        where: { OR: [{ slug: tenantSlug }, { name: { equals: rawBarberia, mode: "insensitive" } }] },
        select: { name: true, brandColor: true, logoUrl: true, status: true, nextDueDate: true },
    });
    if (tenant?.nextDueDate) tenant.nextDueDate = tenant.nextDueDate.toISOString();
    return tenant;
}
