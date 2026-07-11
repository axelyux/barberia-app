import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import TenantBoard from "@/components/TenantBoard";
import { buildFinanceData } from "@/lib/finance";

export const dynamic = "force-dynamic";

const EMPTY_PERM = { canView: false, canAdd: false, canEdit: false, canDelete: false };
const MODULES = ["CITAS", "SERVICIOS", "PRODUCTOS", "FINANZAS", "BOT", "SEGURIDAD"];

export default async function TenantPage({ params }) {
    const { slug } = await params;

    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) notFound();

    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.tenantId !== tenant.id) redirect("/login");

    const permsByModule = Object.fromEntries(
        MODULES.map((m) => [m, sessionUser.permissions.find((p) => p.module === m) ?? EMPTY_PERM])
    );

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const start30 = new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000);

    const [
        bookings,
        productSales,
        services,
        products,
        flowMessages,
        staffUsers,
        completedBookings30,
        productSales30,
        expenses30,
        productPurchases,
        businessHours,
        ignoredContacts,
    ] = await Promise.all([
        prisma.booking.findMany({
            where: { tenantId: tenant.id, scheduledAt: { gte: startOfToday, lt: startOfTomorrow } },
            include: { service: true },
            orderBy: { scheduledAt: "asc" },
        }),
        prisma.productSale.findMany({
            where: { tenantId: tenant.id, createdAt: { gte: startOfToday } },
            orderBy: { createdAt: "desc" },
            take: 8,
        }),
        prisma.service.findMany({ where: { tenantId: tenant.id }, orderBy: { sortOrder: "asc" } }),
        prisma.product.findMany({ where: { tenantId: tenant.id }, orderBy: { sortOrder: "asc" } }),
        prisma.flowMessage.findMany({ where: { tenantId: tenant.id } }),
        prisma.staffUser.findMany({ where: { tenantId: tenant.id }, include: { permissions: true }, orderBy: { createdAt: "asc" } }),
        prisma.booking.findMany({ where: { tenantId: tenant.id, status: "COMPLETED", scheduledAt: { gte: start30 } } }),
        prisma.productSale.findMany({ where: { tenantId: tenant.id, createdAt: { gte: start30 } } }),
        prisma.expense.findMany({ where: { tenantId: tenant.id, createdAt: { gte: start30 } }, orderBy: { createdAt: "desc" } }),
        prisma.productPurchase.findMany({
            where: { tenantId: tenant.id },
            include: { product: true },
            orderBy: { createdAt: "desc" },
            take: 10,
        }),
        prisma.businessHour.findMany({ where: { tenantId: tenant.id } }),
        prisma.ignoredContact.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" } }),
    ]);

    const messagesByKey = Object.fromEntries(flowMessages.map((m) => [m.key, m.text]));
    const finance = buildFinanceData({ completedBookings: completedBookings30, productSales: productSales30, expenses30 });

    const plainTenant = {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        brandColor: tenant.brandColor,
    };
    const plainBookings = bookings.map((b) => ({ ...b, scheduledAt: b.scheduledAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString() }));
    const plainSales = productSales.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }));
    const plainExpenses = expenses30.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
    const plainDaily = finance.daily.map((d) => ({ ...d, date: d.date.toISOString() }));
    const plainPurchases = productPurchases.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }));
    const plainStaffUsers = staffUsers.map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, permissions: u.permissions }));
    const plainCurrentUser = { id: sessionUser.id, name: sessionUser.name, role: sessionUser.role };

    const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

    return (
        <main className="min-h-screen bg-zinc-950">
            <TenantBoard
                tenant={plainTenant}
                currentUser={plainCurrentUser}
                perms={permsByModule}
                bookings={plainBookings}
                productSales={plainSales}
                services={services}
                products={products}
                productPurchases={plainPurchases}
                flowMessages={messagesByKey}
                staffUsers={plainStaffUsers}
                expenses={plainExpenses}
                businessHours={businessHours}
                ignoredContacts={ignoredContacts}
                finance={{ ...finance, daily: plainDaily }}
                todayLabel={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
            />
        </main>
    );
}
