"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, destroySession } from "@/lib/auth";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit";

export async function login(prevState, formData) {
    const tenantSlug = String(formData.get("tenantSlug") ?? "").trim().toLowerCase();
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const rateLimitKey = `staff:${tenantSlug}:${username}`;

    const { blocked, minutesLeft } = checkRateLimit(rateLimitKey);
    if (blocked) {
        return { error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minuto(s).` };
    }

    // username es único solo por barbería (varias barberías pueden tener "admin"),
    // así que sin escopear por tenantSlug esto haría login en la barbería equivocada.
    const user = await prisma.staffUser.findFirst({
        where: { username, tenant: { slug: tenantSlug } },
        include: { tenant: true },
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
        recordFailedAttempt(rateLimitKey);
        return { error: "Barbería, usuario o contraseña incorrectos." };
    }

    clearAttempts(rateLimitKey);
    await createSession(user.id);
    redirect(`/t/${user.tenant.slug}`);
}

export async function logout() {
    await destroySession();
    redirect("/login");
}
