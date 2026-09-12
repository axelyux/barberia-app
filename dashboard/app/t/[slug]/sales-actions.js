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

// Folio consecutivo (#1, #2, #3...) para identificar cada venta de un vistazo — Productos y
// Servicios comparten el mismo contador porque en pantalla aparecen mezclados en una sola
// lista de "Ventas". Un solo UPDATE con increment es atómico en Postgres, sin importar
// cuántas ventas se registren al mismo tiempo.
async function nextSaleFolio(db, tenantId) {
    const tenant = await db.tenant.update({ where: { id: tenantId }, data: { saleFolioSeq: { increment: 1 } }, select: { saleFolioSeq: true } });
    return tenant.saleFolioSeq;
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
        saleData.folio = await nextSaleFolio(tx, tenantId);
        await tx.productSale.create({ data: saleData });
        await applyStockMovement(tx, { tenantId, productId, type: "SALIDA", quantity: qty, reason: "Venta", createdByName: user.name });
    });
    revalidatePath(`/t/${slug}`);
}

export async function updateProductSale(
    saleId,
    slug,
    { name, barberId, customerId, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    const { user, tenantId } = await requireTenantSession(slug, "PRODUCTOS", "edit");
    if (!name?.trim()) throw new Error("El nombre del producto es obligatorio");

    const existing = await findOwnedOrThrow("productSale", saleId, tenantId, "Venta no encontrada");
    if (existing.cancelledAt) throw new Error("Esta venta está cancelada y ya no se puede editar.");
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
        // El método de pago NO se toca al editar: se queda con el que se registró al
        // cobrar. Si se pudiera cambiar después, sería trivial cobrar en efectivo,
        // quedarse el dinero, y luego marcar la venta como "tarjeta" para que la caja
        // cuadre igual. Para corregir un error real, se cancela la venta y se registra
        // de nuevo (queda el rastro de ambas).
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

// Cancelar (no borrar): la venta se queda en la lista marcada como cancelada, con quién
// la canceló y por qué. Deja de contar para ingresos, caja, comisiones y finanzas, pero
// el registro no desaparece — si alguien cobra y luego "borra" la venta para quedarse el
// dinero, aquí queda la evidencia.
export async function cancelProductSale(saleId, slug, { reason } = {}) {
    const { user, tenantId } = await requireTenantSession(slug, "PRODUCTOS", "delete");
    const sale = await findOwnedOrThrow("productSale", saleId, tenantId, "Venta no encontrada");
    if (sale.cancelledAt) throw new Error("Esta venta ya estaba cancelada.");

    await prisma.$transaction(async (tx) => {
        await tx.productSale.updateMany({
            where: { id: saleId, tenantId },
            data: { cancelledAt: new Date(), cancelledByName: user.name, cancelReason: reason?.trim() || null },
        });
        if (sale.productId) {
            await applyStockMovement(tx, {
                tenantId,
                productId: sale.productId,
                type: "ENTRADA",
                quantity: sale.quantity,
                reason: "Venta cancelada",
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

    saleData.folio = await nextSaleFolio(prisma, tenantId);
    await prisma.serviceSale.create({ data: saleData });
    revalidatePath(`/t/${slug}`);
}

export async function updateServiceSale(
    saleId,
    slug,
    { name, barberId, customerId, paymentStatus, amountPaidCents, quantity, discountCents, tipCents, notes, createdAt }
) {
    const { tenantId } = await requireTenantSession(slug, "SERVICIOS", "edit");
    if (!name?.trim()) throw new Error("El nombre del servicio es obligatorio");
    const existing = await findOwnedOrThrow("serviceSale", saleId, tenantId, "Venta no encontrada");
    if (existing.cancelledAt) throw new Error("Esta venta está cancelada y ya no se puede editar.");
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
        // Ver updateProductSale: el método de pago queda fijo desde que se cobró.
        paymentStatus: status,
        amountPaidCents: amountPaidFor(netTotal, status, amountPaidCents),
    };
    if (createdAt) data.createdAt = new Date(createdAt);

    await prisma.serviceSale.updateMany({ where: { id: saleId, tenantId }, data });
    revalidatePath(`/t/${slug}`);
}

export async function cancelServiceSale(saleId, slug, { reason } = {}) {
    const { user, tenantId } = await requireTenantSession(slug, "SERVICIOS", "delete");
    const sale = await findOwnedOrThrow("serviceSale", saleId, tenantId, "Venta no encontrada");
    if (sale.cancelledAt) throw new Error("Esta venta ya estaba cancelada.");

    await prisma.serviceSale.updateMany({
        where: { id: saleId, tenantId },
        data: { cancelledAt: new Date(), cancelledByName: user.name, cancelReason: reason?.trim() || null },
    });
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
        cancelledAt: s.cancelledAt?.toISOString() ?? null,
        barber: plainBarber(s.barber),
        customer: plainCustomer(s.customer),
    }));
    const services = serviceSales.map((s) => ({
        ...s,
        kind: "service",
        name: s.serviceName,
        cancelledAt: s.cancelledAt?.toISOString() ?? null,
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
        { label: "Folio", value: (s) => s.folio || "" },
        { label: "Estado", value: (s) => (s.cancelledAt ? "CANCELADA" : "Activa") },
        { label: "Cancelada por", value: (s) => s.cancelledByName ?? "" },
        { label: "Motivo de cancelación", value: (s) => s.cancelReason ?? "" },
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
