"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { toCSV } from "@/lib/csv";

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

const plainBarber = (b) => (b ? { ...b, createdAt: b.createdAt.toISOString() } : null);
const plainCustomer = (c) => (c ? { ...c, createdAt: c.createdAt.toISOString() } : null);

// Cuánto realmente entró de dinero (sobre el neto: subtotal - descuento + propina):
// todo si está pagado, nada si no, o lo que se indique si es parcial.
function amountPaidFor(netTotalCents, paymentStatus, amountPaidCents) {
    if (paymentStatus === "NO_PAGADO") return 0;
    if (paymentStatus === "PARCIAL") return Math.max(0, Math.min(netTotalCents, Math.round(amountPaidCents) || 0));
    return netTotalCents;
}

// ------------------------------------------------------------- Ventas de productos (baja stock)
export async function registerProductSale(
    slug,
    { productId, barberId, customerId, paymentMethod, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    await requirePermission("PRODUCTOS", "add");
    const tenantId = await tenantIdFromSlug(slug);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error("Producto no encontrado");

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
        barberId: barberId || null,
        customerId: customerId || null,
        paymentMethod: paymentMethod || "EFECTIVO",
        paymentStatus: status,
        amountPaidCents: amountPaidFor(netTotal, status, amountPaidCents),
    };
    if (createdAt) saleData.createdAt = new Date(createdAt);

    await prisma.$transaction([
        prisma.productSale.create({ data: saleData }),
        prisma.product.update({ where: { id: productId }, data: { stock: { decrement: qty } } }),
    ]);
    revalidatePath(`/t/${slug}`);
}

export async function updateProductSale(
    saleId,
    slug,
    { productName, priceCents, barberId, customerId, paymentMethod, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    await requirePermission("PRODUCTOS", "edit");
    if (!productName?.trim()) throw new Error("El nombre del producto es obligatorio");

    const existing = await prisma.productSale.findUnique({ where: { id: saleId } });
    if (!existing) throw new Error("Venta no encontrada");

    const price = Math.max(0, Math.round(priceCents) || 0);
    const qty = Math.max(1, Math.round(quantity) || 1);
    const discount = Math.max(0, Math.round(discountCents) || 0);
    const tip = Math.max(0, Math.round(tipCents) || 0);
    const netTotal = Math.max(0, price - discount + tip);
    const status = paymentStatus || "PAGADO";

    const data = {
        productName: productName.trim(),
        priceCents: price,
        quantity: qty,
        discountCents: discount,
        tipCents: tip,
        notes: notes?.trim() || null,
        barberId: barberId || null,
        customerId: customerId || null,
        paymentMethod: paymentMethod || "EFECTIVO",
        paymentStatus: status,
        amountPaidCents: amountPaidFor(netTotal, status, amountPaidCents),
    };
    if (createdAt) data.createdAt = new Date(createdAt);

    const stockOps = [];
    if (existing.productId) {
        const delta = qty - existing.quantity;
        if (delta !== 0) stockOps.push(prisma.product.update({ where: { id: existing.productId }, data: { stock: { decrement: delta } } }));
    }

    await prisma.$transaction([prisma.productSale.update({ where: { id: saleId }, data }), ...stockOps]);
    revalidatePath(`/t/${slug}`);
}

export async function deleteProductSale(saleId, slug) {
    await requirePermission("PRODUCTOS", "delete");
    const sale = await prisma.productSale.findUnique({ where: { id: saleId } });
    if (!sale) throw new Error("Venta no encontrada");

    await prisma.$transaction([
        prisma.productSale.delete({ where: { id: saleId } }),
        ...(sale.productId
            ? [prisma.product.update({ where: { id: sale.productId }, data: { stock: { increment: sale.quantity } } })]
            : []),
    ]);
    revalidatePath(`/t/${slug}`);
}

// -------------------------------------------------------------- Ventas de servicios (mostrador)
export async function registerServiceSale(
    slug,
    { serviceId, barberId, customerId, paymentMethod, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    await requirePermission("SERVICIOS", "add");
    const tenantId = await tenantIdFromSlug(slug);
    const service = serviceId ? await prisma.service.findUnique({ where: { id: serviceId } }) : null;
    if (!service) throw new Error("Servicio no encontrado");

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
        barberId: barberId || null,
        customerId: customerId || null,
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
    { serviceName, priceCents, barberId, customerId, paymentMethod, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    await requirePermission("SERVICIOS", "edit");
    if (!serviceName?.trim()) throw new Error("El nombre del servicio es obligatorio");

    const price = Math.max(0, Math.round(priceCents) || 0);
    const qty = Math.max(1, Math.round(quantity) || 1);
    const discount = Math.max(0, Math.round(discountCents) || 0);
    const tip = Math.max(0, Math.round(tipCents) || 0);
    const netTotal = Math.max(0, price - discount + tip);
    const status = paymentStatus || "PAGADO";

    const data = {
        serviceName: serviceName.trim(),
        priceCents: price,
        quantity: qty,
        discountCents: discount,
        tipCents: tip,
        notes: notes?.trim() || null,
        barberId: barberId || null,
        customerId: customerId || null,
        paymentMethod: paymentMethod || "EFECTIVO",
        paymentStatus: status,
        amountPaidCents: amountPaidFor(netTotal, status, amountPaidCents),
    };
    if (createdAt) data.createdAt = new Date(createdAt);

    await prisma.serviceSale.update({ where: { id: saleId }, data });
    revalidatePath(`/t/${slug}`);
}

export async function deleteServiceSale(saleId, slug) {
    await requirePermission("SERVICIOS", "delete");
    await prisma.serviceSale.delete({ where: { id: saleId } });
    revalidatePath(`/t/${slug}`);
}

// ------------------------------------------------------------------- Rango de fechas / export
export async function getSalesForRange(slug, { from, to }) {
    await requirePermission("PRODUCTOS", "view");
    const tenantId = await tenantIdFromSlug(slug);
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
    await requirePermission("PRODUCTOS", "view");
    const tenantId = await tenantIdFromSlug(slug);
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
