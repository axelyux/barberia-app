"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { findOwnedOrThrow, updateOwned, deleteOwned } from "@/lib/tenant-guard";

// ---------------------------------------------------------------- Servicios
export async function createService(slug, { name, priceCents, durationMin }) {
    const { tenantId } = await requireTenantSession(slug, "SERVICIOS", "add");
    if (!name?.trim()) throw new Error("El nombre del servicio es obligatorio");

    await prisma.service.create({
        data: {
            tenantId,
            name: name.trim(),
            priceCents: Math.max(0, Math.round(priceCents) || 0),
            durationMin: Math.max(5, Math.round(durationMin) || 30),
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function updateService(serviceId, slug, { name, priceCents, durationMin, active }) {
    const { tenantId } = await requireTenantSession(slug, "SERVICIOS", "edit");
    if (!name?.trim()) throw new Error("El nombre del servicio es obligatorio");

    await updateOwned("service", serviceId, tenantId, {
        name: name.trim(),
        priceCents: Math.max(0, Math.round(priceCents) || 0),
        durationMin: Math.max(5, Math.round(durationMin) || 30),
        active: !!active,
    }, "Servicio no encontrado");
    revalidatePath(`/t/${slug}`);
}

export async function deleteService(serviceId, slug) {
    const { tenantId } = await requireTenantSession(slug, "SERVICIOS", "delete");
    await deleteOwned("service", serviceId, tenantId, "Servicio no encontrado");
    revalidatePath(`/t/${slug}`);
}

// ----------------------------------------------------------------- Productos (inventario)
export async function createProduct(slug, { name, priceCents, stock, lowStockThreshold }) {
    const { tenantId } = await requireTenantSession(slug, "PRODUCTOS", "add");
    if (!name?.trim()) throw new Error("El nombre del producto es obligatorio");

    await prisma.product.create({
        data: {
            tenantId,
            name: name.trim(),
            priceCents: Math.max(0, Math.round(priceCents) || 0),
            stock: Math.max(0, Math.round(stock) || 0),
            lowStockThreshold: Math.max(0, Math.round(lowStockThreshold) || 3),
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function updateProduct(productId, slug, { name, priceCents, stock, lowStockThreshold, active }) {
    const { tenantId } = await requireTenantSession(slug, "PRODUCTOS", "edit");
    if (!name?.trim()) throw new Error("El nombre del producto es obligatorio");

    await updateOwned("product", productId, tenantId, {
        name: name.trim(),
        priceCents: Math.max(0, Math.round(priceCents) || 0),
        stock: Math.max(0, Math.round(stock) || 0),
        lowStockThreshold: Math.max(0, Math.round(lowStockThreshold) || 3),
        active: !!active,
    }, "Producto no encontrado");
    revalidatePath(`/t/${slug}`);
}

export async function deleteProduct(productId, slug) {
    const { tenantId } = await requireTenantSession(slug, "PRODUCTOS", "delete");
    await deleteOwned("product", productId, tenantId, "Producto no encontrado");
    revalidatePath(`/t/${slug}`);
}

// Ajuste rápido de inventario (botones +/- en Inventario), sin pasar por una venta o compra.
export async function adjustProductStock(productId, slug, delta) {
    const { tenantId } = await requireTenantSession(slug, "PRODUCTOS", "edit");
    const product = await findOwnedOrThrow("product", productId, tenantId, "Producto no encontrado");

    await prisma.product.update({
        where: { id: productId },
        data: { stock: Math.max(0, product.stock + delta) },
    });
    revalidatePath(`/t/${slug}`);
}

// ------------------------------------------------------------------- Marca
export async function updateBranding(slug, { name, logoUrl, brandColor }) {
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "edit");
    await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            name: name?.trim() || undefined,
            logoUrl: logoUrl?.trim() || null,
            brandColor: brandColor || "#D9A441",
        },
    });
    revalidatePath(`/t/${slug}`);
}
