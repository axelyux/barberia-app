"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { updateOwned, deleteOwned } from "@/lib/tenant-guard";

const MODULES = ["CITAS", "SERVICIOS", "PRODUCTOS", "FINANZAS", "BOT", "SEGURIDAD"];
const FIELDS = ["canView", "canAdd", "canEdit", "canDelete"];

// Nunca se guarda el permiso tal cual lo mandó el cliente: cada campo se recorta a lo
// que "actingPermissions" (los permisos REALES del usuario que hace la llamada, leídos
// de su sesión, nunca del payload) ya tiene activado. Así, alguien con solo un permiso
// parcial (ej. SEGURIDAD: editar) nunca puede otorgar —ni a otro usuario ni a sí mismo—
// un nivel de acceso que él mismo no posee, cerrando la vía de auto-escalación.
function clampPermissions(requested, actingPermissions) {
    const actingByModule = Object.fromEntries(actingPermissions.map((p) => [p.module, p]));
    const clamped = {};
    for (const moduleKey of MODULES) {
        const req = requested?.[moduleKey] ?? {};
        const acting = actingByModule[moduleKey] ?? {};
        clamped[moduleKey] = Object.fromEntries(FIELDS.map((f) => [f, !!req[f] && !!acting[f]]));
    }
    return clamped;
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
    const { tenantId, user: actingUser } = await requireTenantSession(slug, "SEGURIDAD", "add");
    if (!name?.trim() || !username?.trim()) throw new Error("Nombre y usuario son obligatorios");
    if (!password || password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");

    const user = await prisma.staffUser.create({
        data: {
            tenantId,
            name: name.trim(),
            username: username.trim().toLowerCase(),
            role,
            passwordHash: hashPassword(password),
        },
    });
    await savePermissions(user.id, clampPermissions(permissions, actingUser.permissions));
    revalidatePath(`/t/${slug}`);
}

export async function updateUser(userId, slug, { name, username, password, role, permissions }) {
    const { tenantId, user: actingUser } = await requireTenantSession(slug, "SEGURIDAD", "edit");
    if (!name?.trim() || !username?.trim()) throw new Error("Nombre y usuario son obligatorios");
    if (password && password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");

    // Nadie edita sus propios permisos/rol, ni siquiera un ADMIN — evita que una cuenta
    // ya comprometida (o un usuario descuidado) se auto-otorgue más acceso del que ya
    // tenía. El nombre/usuario/contraseña de la propia cuenta sí se puede seguir editando.
    const isSelf = userId === actingUser.id;

    // Cambiar la contraseña invalida cualquier sesión ya emitida para esa cuenta
    // (incrementa sessionVersion — ver getSessionUser en lib/auth.js).
    await updateOwned("staffUser", userId, tenantId, {
        name: name.trim(),
        username: username.trim().toLowerCase(),
        ...(isSelf ? {} : { role }),
        ...(password ? { passwordHash: hashPassword(password), sessionVersion: { increment: 1 } } : {}),
    });
    if (!isSelf) {
        await savePermissions(userId, clampPermissions(permissions, actingUser.permissions));
    }
    revalidatePath(`/t/${slug}`);
}

// Desactiva la cuenta (no puede iniciar sesión ni mantener una sesión ya abierta) sin
// borrar el registro — a diferencia de deleteUser, conserva el historial de quién hizo
// qué en citas/ventas/gastos que referencian a este usuario.
export async function deactivateUser(userId, slug) {
    const { tenantId, user: actingUser } = await requireTenantSession(slug, "SEGURIDAD", "edit");
    if (userId === actingUser.id) throw new Error("No puedes desactivar tu propia cuenta.");
    await updateOwned("staffUser", userId, tenantId, { active: false, sessionVersion: { increment: 1 } });
    revalidatePath(`/t/${slug}`);
}

export async function reactivateUser(userId, slug) {
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "edit");
    await updateOwned("staffUser", userId, tenantId, { active: true });
    revalidatePath(`/t/${slug}`);
}

export async function deleteUser(userId, slug) {
    const { tenantId, user: actingUser } = await requireTenantSession(slug, "SEGURIDAD", "delete");
    if (userId === actingUser.id) throw new Error("No puedes eliminar tu propia cuenta.");
    await deleteOwned("staffUser", userId, tenantId, "Usuario no encontrado.");
    revalidatePath(`/t/${slug}`);
}
