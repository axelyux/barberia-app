"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, destroySession } from "@/lib/auth";

export async function login(prevState, formData) {
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    const user = await prisma.staffUser.findFirst({ where: { username }, include: { tenant: true } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
        return { error: "Usuario o contraseña incorrectos." };
    }

    await createSession(user.id);
    redirect(`/t/${user.tenant.slug}`);
}

export async function logout() {
    await destroySession();
    redirect("/login");
}
