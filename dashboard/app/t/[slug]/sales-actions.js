"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { toCSV } from "@/lib/csv";
import { findOwnedOrThrow } from "@/lib/tenant-guard";
import { applyStockMovement } from "@/app/t/[slug]/inventory-actions";

const plainBarber = (b) => (b ? { ...b, createdAt: b.createdAt.toISOString() } : null);
const plainCustomer = (c) => (c ? { ...c, createdAt: c.createdAt.toISOString() } : null);

// Cuánto realmente entró de dinero (sobre el neto: subtotal - descuento + propina):
// todo si está pagado, nada si no, o lo que se indique si es parcial.
function amountPaidFor(netTotalCents, paymentStatus, amountPaidCents) {
    if (paymentStatus === "NO_PAGADO") return 0;
    if (paymentStatus === "PARCIAL") return Math.max(0, Math.min(netTotalCents, Math.round(amountPaidCents) || 0));
    return netTotalCents;
}

async function ownedOrNull(model, id, tenantId) {
    if (!id) return null;
    const row = await prisma[model].findFirst({ where: { id, tenantId } });
    return row?.id ?? null;
}

// ------------------------------------------------------------- Ventas de productos (baja stock)
export async function registerProductSale(
    slug,
    { productId, barberId, customerId, paymentMethod, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    const { user, tenantId } = await requireTenantSession(slug, "PRODUCTOS", "add");
    const product = await findOwnedOrThrow("product", productId, tenantId, "Producto no encontrado");

    const qty = Math.max(1, Math.round(quantity) || 1);
    if (product.stock < qty) throw new Error("No hay stock suficiente de este producto.");

    const status = paymentStatus || "PAGADO";
    const discount = Math.max(0, Math.round(discountCents) || 0);
    const tip = Math.max(0, Math.round(tipCents) || 0);
    const subtotal = product.priceCents * qty;
    const netTotal = Math.max(0, subtotal - discount + tip);

    const saleData = {
        tenantId,
        productId,
        productName: product.name,
        priceCents: subtotal,
        quantity: qty,
        discountCents: discount,
        tipCents: tip,
        notes: notes?.trim() || null,
        barberId: await ownedOrNull("barber", barberId, tenantId),
        customerId: await ownedOrNull("customer", customerId, tenantId),
        paymentMethod: paymentMethod || "EFECTIVO",
        paymentStatus: status,
        amountPaidCents: amountPaidFor(netTotal, status, amountPaidCents),
    };
    if (createdAt) saleData.createdAt = new Date(createdAt);

    await prisma.$transaction(async (tx) => {
        await tx.productSale.create({ data: saleData });
        await applyStockMovement(tx, { tenantId, productId, type: "SALIDA", quantity: qty, reason: "Venta", createdByName: user.name });
    });
    revalidatePath(`/t/${slug}`);
}

export async function updateProductSale(
    saleId,
    slug,
    { name, barberId, customerId, paymentMethod, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    const { user, tenantId } = await requireTenantSession(slug, "PRODUCTOS", "edit");
    if (!name?.trim()) throw new Error("El nombre del producto es obligatorio");

    const existing = await findOwnedOrThrow("productSale", saleId, tenantId, "Venta no encontrada");
    // El precio SIEMPRE se recalcula desde el catálogo (nunca desde lo que mande el
    // cliente) — toda venta de producto está ligada a un product real desde que se creó
    // (registerProductSale lo exige), así que aquí también debe estarlo.
    const product = await findOwnedOrThrow("product", existing.productId, tenantId, "Producto no encontrado");

    const qty = Math.max(1, Math.round(quantity) || 1);
    const price = product.priceCents * qty;
    const discount = Math.max(0, Math.round(discountCents) || 0);
    const tip = Math.max(0, Math.round(tipCents) || 0);
    const netTotal = Math.max(0, price - discount + tip);
    const status = paymentStatus || "PAGADO";

    const data = {
        productName: name.trim(),
        priceCents: price,
        quantity: qty,
        discountCents: discount,
        tipCents: tip,
        notes: notes?.trim() || null,
        barberId: await ownedOrNull("barber", barberId, tenantId),
        customerId: await ownedOrNull("customer", customerId, tenantId),
        paymentMethod: paymentMethod || "EFECTIVO",
        paymentStatus: status,
        amountPaidCents: amountPaidFor(netTotal, status, amountPaidCents),
    };
    if (createdAt) data.createdAt = new Date(createdAt);

    const delta = qty - existing.quantity;

    await prisma.$transaction(async (tx) => {
        await tx.productSale.updateMany({ where: { id: saleId, tenantId }, data });
        if (delta !== 0) {
            await applyStockMovement(tx, {
                tenantId,
                productId: existing.productId,
                type: delta > 0 ? "SALIDA" : "ENTRADA",
                quantity: Math.abs(delta),
                reason: "Ajuste al editar venta",
                createdByName: user.name,
            });
        }
    });
    revalidatePath(`/t/${slug}`);
}

export async function deleteProductSale(saleId, slug) {
    const { user, tenantId } = await requireTenantSession(slug, "PRODUCTOS", "delete");
    const sale = await findOwnedOrThrow("productSale", saleId, tenantId, "Venta no encontrada");

    await prisma.$transaction(async (tx) => {
        await tx.productSale.deleteMany({ where: { id: saleId, tenantId } });
        if (sale.productId) {
            await applyStockMovement(tx, {
                tenantId,
                productId: sale.productId,
                type: "ENTRADA",
                quantity: sale.quantity,
                reason: "Venta eliminada",
                createdByName: user.name,
            });
        }
    });
    revalidatePath(`/t/${slug}`);
}

// -------------------------------------------------------------- Ventas de servicios (mostrador)
export async function registerServiceSale(
    slug,
    { serviceId, barberId, customerId, paymentMethod, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    const { tenantId } = await requireTenantSession(slug, "SERVICIOS", "add");
    const service = await findOwnedOrThrow("service", serviceId, tenantId, "Servicio no encontrado");

    const qty = Math.max(1, Math.round(quantity) || 1);
    const status = paymentStatus || "PAGADO";
    const discount = Math.max(0, Math.round(discountCents) || 0);
    const tip = Math.max(0, Math.round(tipCents) || 0);
    const subtotal = service.priceCents * qty;
    const netTotal = Math.max(0, subtotal - discount + tip);

    const saleData = {
        tenantId,
        serviceId: service.id,
        serviceName: service.name,
        priceCents: subtotal,
        quantity: qty,
        discountCents: discount,
        tipCents: tip,
        notes: notes?.trim() || null,
        barberId: await ownedOrNull("barber", barberId, tenantId),
        customerId: await ownedOrNull("customer", customerId, tenantId),
        paymentMethod: paymentMethod || "EFECTIVO",
        paymentStatus: status,
        amountPaidCents: amountPaidFor(netTotal, status, amountPaidCents),
    };
    if (createdAt) saleData.createdAt = new Date(createdAt);

    await prisma.serviceSale.create({ data: saleData });
    revalidatePath(`/t/${slug}`);
}

export async function updateServiceSale(
    saleId,
    slug,
    { name, barberId, customerId, paymentMethod, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    const { tenantId } = await requireTenantSession(slug, "SERVICIOS", "edit");
    if (!name?.trim()) throw new Error("El nombre del servicio es obligatorio");
    const existing = await findOwnedOrThrow("serviceSale", saleId, tenantId, "Venta no encontrada");
    // Mismo criterio que en productos: el precio se recalcula desde el catálogo, nunca
    // desde lo que mande el cliente.
    const service = await findOwnedOrThrow("service", existing.serviceId, tenantId, "Servicio no encontrado");

    const qty = Math.max(1, Math.round(quantity) || 1);
    const price = service.priceCents * qty;
    const discount = Math.max(0, Math.round(discountCents) || 0);
    const tip = Math.max(0, Math.round(tipCents) || 0);
    const netTotal = Math.max(0, price - discount + tip);
    const status = paymentStatus || "PAGADO";

    const data = {
        serviceName: name.trim(),
        priceCents: price,
        quantity: qty,
        discountCents: discount,
        tipCents: tip,
        notes: notes?.trim() || null,
        barberId: await ownedOrNull("barber", barberId, tenantId),
        customerId: await ownedOrNull("customer", customerId, tenantId),
        paymentMethod: paymentMethod || "EFECTIVO",
        paymentStatus: status,
        amountPaidCents: amountPaidFor(netTotal, status, amountPaidCents),
    };
    if (createdAt) data.createdAt = new Date(createdAt);

    await prisma.serviceSale.updateMany({ where: { id: saleId, tenantId }, data });
    revalidatePath(`/t/${slug}`);
}

export async function deleteServiceSale(saleId, slug) {
    const { tenantId } = await requireTenantSession(slug, "SERVICIOS", "delete");
    await prisma.serviceSale.deleteMany({ where: { id: saleId, tenantId } });
    revalidatePath(`/t/${slug}`);
}

// ------------------------------------------------------------------- Rango de fechas / export
export async function getSalesForRange(slug, { from, to }) {
    const { tenantId } = await requireTenantSession(slug, "PRODUCTOS", "view");
    const range = { gte: new Date(from), lte: new Date(to) };

    const [productSales, serviceSales] = await Promise.all([
        prisma.productSale.findMany({ where: { tenantId, createdAt: range }, include: { barber: true, customer: true } }),
        prisma.serviceSale.findMany({ where: { tenantId, createdAt: range }, include: { barber: true, customer: true } }),
    ]);

    const products = productSales.map((s) => ({
        ...s,
        kind: "product",
        name: s.productName,
        createdAt: s.createdAt.toISOString(),
        barber: plainBarber(s.barber),
        customer: plainCustomer(s.customer),
    }));
    const services = serviceSales.map((s) => ({
        ...s,
        kind: "service",
        name: s.serviceName,
        createdAt: s.createdAt.toISOString(),
        barber: plainBarber(s.barber),
        customer: plainCustomer(s.customer),
    }));

    return [...products, ...services].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function exportSalesCSV(slug, { from, to }) {
    const { tenantId } = await requireTenantSession(slug, "PRODUCTOS", "view");
    const range = { gte: new Date(from), lte: new Date(to) };

    const [productSales, serviceSales] = await Promise.all([
        prisma.productSale.findMany({ where: { tenantId, createdAt: range }, include: { barber: true, customer: true } }),
        prisma.serviceSale.findMany({ where: { tenantId, createdAt: range }, include: { barber: true, customer: true } }),
    ]);

    const rows = [
        ...productSales.map((s) => ({ ...s, kind: "Producto", name: s.productName })),
        ...serviceSales.map((s) => ({ ...s, kind: "Servicio", name: s.serviceName })),
    ].sort((a, b) => a.createdAt - b.createdAt);

    return toCSV(rows, [
        { label: "Fecha", value: (s) => s.createdAt.toLocaleString("es-MX") },
        { label: "Tipo", value: (s) => s.kind },
        { label: "Nombre", value: (s) => s.name },
        { label: "Cantidad", value: (s) => s.quantity },
        { label: "Subtotal", value: (s) => (s.priceCents / 100).toFixed(2) },
        { label: "Descuento", value: (s) => (s.discountCents / 100).toFixed(2) },
        { label: "Propina", value: (s) => (s.tipCents / 100).toFixed(2) },
        { label: "Método de pago", value: (s) => s.paymentMethod },
        { label: "Estatus de pago", value: (s) => s.paymentStatus },
        { label: "Monto pagado", value: (s) => (s.amountPaidCents / 100).toFixed(2) },
        { label: "Barbero", value: (s) => s.barber?.name ?? "" },
        { label: "Cliente", value: (s) => s.customer?.name ?? "" },
        { label: "Notas", value: (s) => s.notes ?? "" },
    ]);
}
