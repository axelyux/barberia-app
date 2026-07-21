"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createAdminSession, destroyAdminSession } from "@/lib/auth";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit";

export async function loginAdmin(prevState, formData) {
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const rateLimitKey = `admin:${username}`;

    const { blocked, minutesLeft } = checkRateLimit(rateLimitKey);
    if (blocked) {
        return { error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minuto(s).` };
    }

    const admin = await prisma.superAdmin.findFirst({ where: { username } });
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
        recordFailedAttempt(rateLimitKey);
        return { error: "Usuario o contraseña incorrectos." };
    }

    clearAttempts(rateLimitKey);
    await createAdminSession(admin.id);
    redirect("/admin");
}

export async function logoutAdmin() {
    await destroyAdminSession();
    redirect("/admin/login");
}
