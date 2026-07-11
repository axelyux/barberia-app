"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

// days: [{ weekday, isClosed, openMin, closeMin }, ...] (7 entradas, una por día)
export async function updateBusinessHours(slug, days) {
    await requirePermission("SEGURIDAD", "edit");
    const tenantId = await tenantIdFromSlug(slug);

    for (const d of days) {
        await prisma.businessHour.upsert({
            where: { tenantId_weekday: { tenantId, weekday: d.weekday } },
            update: { isClosed: !!d.isClosed, openMin: d.openMin, closeMin: d.closeMin },
            create: { tenantId, weekday: d.weekday, isClosed: !!d.isClosed, openMin: d.openMin, closeMin: d.closeMin },
        });
    }
    revalidatePath(`/t/${slug}`);
}
