"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

export async function createBarber(slug, { name, phone, specialty, paymentType, commissionPercent, salaryCents }) {
    await requirePermission("SEGURIDAD", "add");
    if (!name?.trim()) throw new Error("El nombre del barbero es obligatorio");
    const tenantId = await tenantIdFromSlug(slug);

    await prisma.barber.create({
        data: {
            tenantId,
            name: name.trim(),
            phone: phone?.trim() || null,
            specialty: specialty?.trim() || null,
            paymentType: paymentType || "COMISION",
            commissionPercent: Math.min(100, Math.max(0, parseFloat(commissionPercent) || 0)),
            salaryCents: paymentType && paymentType !== "COMISION" ? Math.max(0, Math.round(salaryCents) || 0) : null,
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function updateBarber(barberId, slug, { name, phone, specialty, paymentType, commissionPercent, salaryCents, active }) {
    await requirePermission("SEGURIDAD", "edit");
    if (!name?.trim()) throw new Error("El nombre del barbero es obligatorio");

    await prisma.barber.update({
        where: { id: barberId },
        data: {
            name: name.trim(),
            phone: phone?.trim() || null,
            specialty: specialty?.trim() || null,
            paymentType: paymentType || "COMISION",
            commissionPercent: Math.min(100, Math.max(0, parseFloat(commissionPercent) || 0)),
            salaryCents: paymentType && paymentType !== "COMISION" ? Math.max(0, Math.round(salaryCents) || 0) : null,
            active: !!active,
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function deleteBarber(barberId, slug) {
    await requirePermission("SEGURIDAD", "delete");
    await prisma.barber.delete({ where: { id: barberId } });
    revalidatePath(`/t/${slug}`);
}
