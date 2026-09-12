"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { findOwnedOrThrow } from "@/lib/tenant-guard";

// Único lugar donde Product.stock cambia de verdad — cualquier venta, compra o ajuste
// manual pasa por aquí, así el número siempre coincide con la suma real de sus
// movimientos (nunca se actualiza el stock sin dejar rastro de por qué cambió).
export async function applyStockMovement(tx, { tenantId, productId, type, quantity, reason, createdByName }) {
    const qty = Math.max(1, Math.round(quantity) || 1);
    await tx.inventoryMovement.create({
        data: { tenantId, productId, type, quantity: qty, reason: reason?.trim() || null, createdByName: createdByName?.trim() || null },
    });
    if (type === "SALIDA") {
        // Nunca deja el stock en negativo (ej. se está revirtiendo una compra vieja cuyo
        // producto ya se vendió de más desde entonces) — se clampa a 0 en vez de tronar.
        const product = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } });
        await tx.product.update({ where: { id: productId }, data: { stock: Math.max(0, (product?.stock ?? 0) - qty) } });
        return;
    }
    await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: qty } },
    });
}

// Movimiento manual desde la pestaña Inventario (no ligado a una venta ni a un gasto) —
// ej. mermas, conteo físico, producto dañado, regalos a clientes.
export async function registerManualMovement(slug, { productId, type, quantity, reason }) {
    const { user, tenantId } = await requireTenantSession(slug, "PRODUCTOS", "edit");
    const product = await findOwnedOrThrow("product", productId, tenantId, "Producto no encontrado");
    if (type !== "ENTRADA" && type !== "SALIDA") throw new Error("Tipo de movimiento inválido");

    const qty = Math.max(1, Math.round(quantity) || 1);
    if (type === "SALIDA" && product.stock < qty) throw new Error("No hay stock suficiente para esa salida.");

    await prisma.$transaction((tx) =>
        applyStockMovement(tx, { tenantId, productId, type, quantity: qty, reason, createdByName: user.name })
    );
    revalidatePath(`/t/${slug}`);
}

export async function getInventoryMovements(slug, { productId, limit = 30 } = {}) {
    const { tenantId } = await requireTenantSession(slug, "PRODUCTOS", "view");
    const movements = await prisma.inventoryMovement.findMany({
        where: { tenantId, productId: productId || undefined },
        include: { product: true },
        orderBy: { createdAt: "desc" },
        take: Math.min(200, Math.max(1, limit)),
    });
    return movements.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), productName: m.product.name }));
}
