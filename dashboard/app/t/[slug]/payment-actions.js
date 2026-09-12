"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";

// Sin fila para un método = se asume activo (así ningún tenant existente pierde algo al
// agregar esta tabla) — solo se crea una fila cuando alguien de verdad desactiva algo.
export async function setPaymentMethodActive(slug, { method, active }) {
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "edit");
    if (method === "EFECTIVO" && !active) {
        throw new Error("Efectivo no se puede desactivar — siempre debe quedar una forma de cobrar disponible.");
    }

    await prisma.tenantPaymentMethod.upsert({
        where: { tenantId_method: { tenantId, method } },
        update: { active: !!active },
        create: { tenantId, method, active: !!active },
    });
    revalidatePath(`/t/${slug}`);
}
