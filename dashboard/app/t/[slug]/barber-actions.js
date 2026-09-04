"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { updateOwned, deleteOwned } from "@/lib/tenant-guard";

export async function createBarber(slug, { name, phone, specialty, paymentType, commissionPercent, salaryCents }) {
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "add");
    if (!name?.trim()) throw new Error("El nombre del barbero es obligatorio");

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
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "edit");
    if (!name?.trim()) throw new Error("El nombre del barbero es obligatorio");

    await updateOwned("barber", barberId, tenantId, {
        name: name.trim(),
        phone: phone?.trim() || null,
        specialty: specialty?.trim() || null,
        paymentType: paymentType || "COMISION",
        commissionPercent: Math.min(100, Math.max(0, parseFloat(commissionPercent) || 0)),
        salaryCents: paymentType && paymentType !== "COMISION" ? Math.max(0, Math.round(salaryCents) || 0) : null,
        active: !!active,
    }, "Barbero no encontrado");
    revalidatePath(`/t/${slug}`);
}

export async function deleteBarber(barberId, slug) {
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "delete");
    await deleteOwned("barber", barberId, tenantId, "Barbero no encontrado");
    revalidatePath(`/t/${slug}`);
}
