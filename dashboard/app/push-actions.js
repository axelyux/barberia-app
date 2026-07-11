"use server";

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// Se llama desde el celular (dentro de la app) cuando Firebase le da su token de push.
export async function registerPushToken(token, platform = "android") {
    const user = await getSessionUser();
    if (!user) return;

    await prisma.pushToken.upsert({
        where: { token },
        update: { staffUserId: user.id, platform },
        create: { staffUserId: user.id, token, platform },
    });
}
