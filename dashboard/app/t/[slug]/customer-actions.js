"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

async function tenantIdFromSlug(slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) throw new Error("Barbería no encontrada");
    return tenant.id;
}

export async function createCustomer(slug, { name, phone, notes, email, birthDate, preferredBarberId }) {
    await requirePermission("CITAS", "add");
    if (!name?.trim()) throw new Error("El nombre del cliente es obligatorio");
    if (!phone?.trim()) throw new Error("El teléfono del cliente es obligatorio");
    const tenantId = await tenantIdFromSlug(slug);

    const existing = await prisma.customer.findUnique({ where: { tenantId_phone: { tenantId, phone: phone.trim() } } });
    if (existing) throw new Error("Ya existe un cliente con ese teléfono.");

    await prisma.customer.create({
        data: {
            tenantId,
            name: name.trim(),
            phone: phone.trim(),
            notes: notes?.trim() || null,
            email: email?.trim() || null,
            birthDate: birthDate ? new Date(birthDate) : null,
            preferredBarberId: preferredBarberId || null,
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function updateCustomer(customerId, slug, { name, phone, notes, email, birthDate, preferredBarberId }) {
    await requirePermission("CITAS", "edit");
    if (!name?.trim()) throw new Error("El nombre del cliente es obligatorio");
    if (!phone?.trim()) throw new Error("El teléfono del cliente es obligatorio");

    await prisma.customer.update({
        where: { id: customerId },
        data: {
            name: name.trim(),
            phone: phone.trim(),
            notes: notes?.trim() || null,
            email: email?.trim() || null,
            birthDate: birthDate ? new Date(birthDate) : null,
            preferredBarberId: preferredBarberId || null,
        },
    });
    revalidatePath(`/t/${slug}`);
}

export async function deleteCustomer(customerId, slug) {
    await requirePermission("CITAS", "delete");
    await prisma.customer.delete({ where: { id: customerId } });
    revalidatePath(`/t/${slug}`);
}

// Historial de visitas y compras de un cliente (citas, ventas de productos y de servicios).
export async function getCustomerHistory(customerId, slug) {
    await requirePermission("CITAS", "view");

    const [bookings, productSales, serviceSales] = await Promise.all([
        prisma.booking.findMany({ where: { customerId }, include: { service: true }, orderBy: { createdAt: "desc" } }),
        prisma.productSale.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } }),
        prisma.serviceSale.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } }),
    ]);

    const entries = [
        ...bookings.map((b) => ({
            id: b.id,
            kind: "booking",
            name: b.service?.name ?? "Cita",
            priceCents: b.priceChargedCents ?? 0,
            status: b.status,
            createdAt: b.scheduledAt ?? b.createdAt,
        })),
        ...productSales.map((s) => ({ id: s.id, kind: "product", name: s.productName, priceCents: s.priceCents, createdAt: s.createdAt })),
        ...serviceSales.map((s) => ({ id: s.id, kind: "service", name: s.serviceName, priceCents: s.priceCents, createdAt: s.createdAt })),
    ].sort((a, b) => b.createdAt - a.createdAt);

    const totalSpentCents = entries
        .filter((e) => e.kind !== "booking" || e.status === "COMPLETED")
        .reduce((sum, e) => sum + e.priceCents, 0);

    return {
        totalSpentCents,
        visits: entries.length,
        entries: entries.slice(0, 20).map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    };
}
