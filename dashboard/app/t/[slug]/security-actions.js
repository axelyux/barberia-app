"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

const MODULES = ["CITAS", "SERVICIOS", "PRODUCTOS", "FINANZAS", "BOT", "SEGURIDAD"];

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

async function savePermissions(staffUserId, permissions) {
    for (const moduleKey of MODULES) {
        const p = permissions?.[moduleKey] ?? {};
        await prisma.permission.upsert({
            where: { staffUserId_module: { staffUserId, module: moduleKey } },
            update: { canView: !!p.canView, canAdd: !!p.canAdd, canEdit: !!p.canEdit, canDelete: !!p.canDelete },
            create: { staffUserId, module: moduleKey, canView: !!p.canView, canAdd: !!p.canAdd, canEdit: !!p.canEdit, canDelete: !!p.canDelete },
        });
    }
}

export async function createUser(slug, { name, username, password, role, permissions }) {
    await requirePermission("SEGURIDAD", "add");
    if (!name?.trim() || !username?.trim()) throw new Error("Nombre y usuario son obligatorios");
    if (!password || password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    const tenantId = await tenantIdFromSlug(slug);

    const user = await prisma.staffUser.create({
        data: {
            tenantId,
            name: name.trim(),
            username: username.trim().toLowerCase(),
            role,
            passwordHash: hashPassword(password),
        },
    });
    await savePermissions(user.id, permissions);
    revalidatePath(`/t/${slug}`);
}

export async function updateUser(userId, slug, { name, username, password, role, permissions }) {
    await requirePermission("SEGURIDAD", "edit");
    if (!name?.trim() || !username?.trim()) throw new Error("Nombre y usuario son obligatorios");

    await prisma.staffUser.update({
        where: { id: userId },
        data: {
            name: name.trim(),
            username: username.trim().toLowerCase(),
            role,
            ...(password ? { passwordHash: hashPassword(password) } : {}),
        },
    });
    await savePermissions(userId, permissions);
    revalidatePath(`/t/${slug}`);
}

export async function deleteUser(userId, slug) {
    await requirePermission("SEGURIDAD", "delete");
    await prisma.staffUser.delete({ where: { id: userId } });
    revalidatePath(`/t/${slug}`);
}
