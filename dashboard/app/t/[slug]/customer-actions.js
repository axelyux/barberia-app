"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { findOwnedOrThrow, updateOwned, deleteOwned } from "@/lib/tenant-guard";

export async function createCustomer(slug, { name, phone, notes, email, birthDate, preferredBarberId }) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "add");
    if (!name?.trim()) throw new Error("El nombre del cliente es obligatorio");
    if (!phone?.trim()) throw new Error("El teléfono del cliente es obligatorio");

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
    const { tenantId } = await requireTenantSession(slug, "CITAS", "edit");
    if (!name?.trim()) throw new Error("El nombre del cliente es obligatorio");
    if (!phone?.trim()) throw new Error("El teléfono del cliente es obligatorio");

    const duplicate = await prisma.customer.findUnique({ where: { tenantId_phone: { tenantId, phone: phone.trim() } } });
    if (duplicate && duplicate.id !== customerId) throw new Error("Ya existe otro cliente con ese teléfono.");

    await updateOwned("customer", customerId, tenantId, {
        name: name.trim(),
        phone: phone.trim(),
        notes: notes?.trim() || null,
        email: email?.trim() || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        preferredBarberId: preferredBarberId || null,
    }, "Cliente no encontrado");
    revalidatePath(`/t/${slug}`);
}

export async function deleteCustomer(customerId, slug) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "delete");
    await deleteOwned("customer", customerId, tenantId, "Cliente no encontrado");
    revalidatePath(`/t/${slug}`);
}

// Historial de visitas y compras de un cliente (citas, ventas de productos y de servicios).
export async function getCustomerHistory(customerId, slug) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "view");
    await findOwnedOrThrow("customer", customerId, tenantId, "Cliente no encontrado");

    const [bookings, productSales, serviceSales] = await Promise.all([
        prisma.booking.findMany({ where: { customerId, tenantId }, include: { service: true }, orderBy: { createdAt: "desc" } }),
        prisma.productSale.findMany({ where: { customerId, tenantId }, orderBy: { createdAt: "desc" } }),
        prisma.serviceSale.findMany({ where: { customerId, tenantId }, orderBy: { createdAt: "desc" } }),
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

// Lista de clientes paginada (cursor por id) — es la única lista del panel con crecimiento
// realmente ilimitado en operación normal (barberos/servicios/usuarios se quedan en
// decenas). Se usa desde el botón "Cargar más" de CustomersEditor.
export async function getCustomersPage(slug, { cursor, take = 30 } = {}) {
    const { tenantId } = await requireTenantSession(slug, "CITAS", "view");
    const pageSize = Math.min(100, Math.max(1, Math.round(take) || 30));

    const rows = await prisma.customer.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: pageSize + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > pageSize;
    const page = (hasMore ? rows.slice(0, pageSize) : rows).map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        birthDate: c.birthDate?.toISOString() ?? null,
    }));
    return { customers: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}
