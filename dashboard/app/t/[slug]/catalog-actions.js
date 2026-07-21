"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

// ---------------------------------------------------------------- Servicios
export async function createService(slug, { name, priceCents, durationMin }) {
    await requirePermission("SERVICIOS", "add");
    if (!name?.trim()) throw new Error("El nombre del servicio es obligatorio");
    const tenantId = await tenantIdFromSlug(slug);

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
    await requirePermission("SERVICIOS", "edit");
    if (!name?.trim()) throw new Error("El nombre del servicio es obligatorio");

    await prisma.service.update({
        where: { id: serviceId },
        data: {
            name: name.trim(),
            priceCents: Math.max(0, Math.round(priceCents) || 0),
            durationMin: Math.max(5, Math.round(durationMin) || 30),
            active: !!active,
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function deleteService(serviceId, slug) {
    await requirePermission("SERVICIOS", "delete");
    await prisma.service.delete({ where: { id: serviceId } });
    revalidatePath(`/t/${slug}`);
}

// ----------------------------------------------------------------- Productos (inventario)
export async function createProduct(slug, { name, priceCents, stock, lowStockThreshold }) {
    await requirePermission("PRODUCTOS", "add");
    if (!name?.trim()) throw new Error("El nombre del producto es obligatorio");
    const tenantId = await tenantIdFromSlug(slug);

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
    await requirePermission("PRODUCTOS", "edit");
    if (!name?.trim()) throw new Error("El nombre del producto es obligatorio");

    await prisma.product.update({
        where: { id: productId },
        data: {
            name: name.trim(),
            priceCents: Math.max(0, Math.round(priceCents) || 0),
            stock: Math.max(0, Math.round(stock) || 0),
            lowStockThreshold: Math.max(0, Math.round(lowStockThreshold) || 3),
            active: !!active,
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function deleteProduct(productId, slug) {
    await requirePermission("PRODUCTOS", "delete");
    await prisma.product.delete({ where: { id: productId } });
    revalidatePath(`/t/${slug}`);
}

// Ajuste rápido de inventario (botones +/- en Inventario), sin pasar por una venta o compra.
export async function adjustProductStock(productId, slug, delta) {
    await requirePermission("PRODUCTOS", "edit");
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error("Producto no encontrado");

    await prisma.product.update({
        where: { id: productId },
        data: { stock: Math.max(0, product.stock + delta) },
    });
    revalidatePath(`/t/${slug}`);
}

// ------------------------------------------------------------------- Marca
export async function updateBranding(slug, { name, logoUrl, brandColor }) {
    await requirePermission("SEGURIDAD", "edit");
    const tenantId = await tenantIdFromSlug(slug);
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
