import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import TenantBoard from "@/components/TenantBoard";
import OpenShiftGate from "@/components/OpenShiftGate";
import { buildFinanceData } from "@/lib/finance";

export const dynamic = "force-dynamic";

const EMPTY_PERM = { canView: false, canAdd: false, canEdit: false, canDelete: false };
const MODULES = ["CITAS", "SERVICIOS", "PRODUCTOS", "FINANZAS", "BOT", "SEGURIDAD"];

export default async function TenantPage({ params }) {
    const { slug } = await params;

    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) notFound();

    // El super-admin pudo haber desactivado esta barbería mientras alguien la tenía
    // abierta — se corta el acceso en la primera carga de página siguiente (no hace
    // falta que cierren sesión ellos mismos), con un mensaje específico en el login.
    if (tenant.status === "PAUSED") redirect("/login?reason=suspended");

    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.tenantId !== tenant.id) {
        // Si traía una cookie de sesión pero ya no es válida (usuario desactivado,
        // contraseña cambiada, o simplemente venció), se lo decimos explícito en vez
        // de mandarlo a un login "en blanco" como si nunca hubiera entrado.
        const hadSession = (await cookies()).has("barber_session");
        redirect(hadSession ? "/login?reason=expired" : "/login");
    }

    const permsByModule = Object.fromEntries(
        MODULES.map((m) => [m, sessionUser.permissions.find((p) => p.module === m) ?? EMPTY_PERM])
    );

    const openShift = await prisma.cashShift.findFirst({ where: { tenantId: tenant.id, status: "ABIERTO" }, include: { shiftType: true } });
    if (!openShift) {
        const shiftTypes = await prisma.shiftType.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { createdAt: "asc" } });
        return (
            <OpenShiftGate
                slug={tenant.slug}
                brandColor={tenant.brandColor}
                tenantName={tenant.name}
                shiftTypes={shiftTypes.map((t) => ({ id: t.id, name: t.name }))}
                canOpen={permsByModule.FINANZAS.canAdd}
            />
        );
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const start30 = new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000);

    const [
        bookings,
        productSales30,
        serviceSales30,
        services,
        products,
        flowMessages,
        staffUsers,
        completedBookings30,
        expenses30,
        businessHours,
        ignoredContacts,
        barbers,
        customers,
        shiftTypes,
        shiftHistory,
        inventoryMovements30,
        cashMovements,
    ] = await Promise.all([
        prisma.booking.findMany({
            where: { tenantId: tenant.id, scheduledAt: { gte: startOfToday, lt: startOfTomorrow } },
            include: { service: true, barber: true },
            orderBy: { scheduledAt: "asc" },
        }),
        prisma.productSale.findMany({
            where: { tenantId: tenant.id, createdAt: { gte: start30 } },
            include: { barber: true, customer: true },
            orderBy: { createdAt: "desc" },
        }),
        prisma.serviceSale.findMany({
            where: { tenantId: tenant.id, createdAt: { gte: start30 } },
            include: { barber: true, customer: true },
            orderBy: { createdAt: "desc" },
        }),
        prisma.service.findMany({ where: { tenantId: tenant.id }, orderBy: { sortOrder: "asc" } }),
        prisma.product.findMany({ where: { tenantId: tenant.id }, orderBy: { sortOrder: "asc" } }),
        prisma.flowMessage.findMany({ where: { tenantId: tenant.id } }),
        prisma.staffUser.findMany({ where: { tenantId: tenant.id }, include: { permissions: true }, orderBy: { createdAt: "asc" } }),
        prisma.booking.findMany({ where: { tenantId: tenant.id, status: "COMPLETED", scheduledAt: { gte: start30 } }, include: { barber: true } }),
        prisma.expense.findMany({
            where: { tenantId: tenant.id, createdAt: { gte: start30 } },
            include: { product: true },
            orderBy: { createdAt: "desc" },
        }),
        prisma.businessHour.findMany({ where: { tenantId: tenant.id } }),
        prisma.ignoredContact.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" } }),
        prisma.barber.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } }),
        // Tope de seguridad: la lista completa se pagina de verdad con getCustomersPage()
        // (botón "Cargar más" en CustomersEditor) — esto solo evita traer un dataset sin
        // límite en la carga inicial de la página si una barbería acumula miles de clientes.
        prisma.customer.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 200 }),
        prisma.shiftType.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } }),
        prisma.cashShift.findMany({
            where: { tenantId: tenant.id, status: "CERRADO" },
            include: { shiftType: true },
            orderBy: { startedAt: "desc" },
            take: 20,
        }),
        prisma.inventoryMovement.findMany({
            where: { tenantId: tenant.id },
            include: { product: true },
            orderBy: { createdAt: "desc" },
            take: 30,
        }),
        prisma.cashMovement.findMany({ where: { tenantId: tenant.id, cashShiftId: openShift.id }, orderBy: { createdAt: "desc" } }),
    ]);

    const messagesByKey = Object.fromEntries(flowMessages.map((m) => [m.key, m.text]));
    const finance = buildFinanceData({
        completedBookings: completedBookings30,
        productSales: productSales30,
        serviceSales: serviceSales30,
        expenses30,
        barbers,
    });

    const plainTenant = {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        brandColor: tenant.brandColor,
        bookingMinNoticeMin: tenant.bookingMinNoticeMin,
        status: tenant.status,
        nextDueDate: tenant.nextDueDate ? tenant.nextDueDate.toISOString() : null,
    };
    const plainBarber = (b) => (b ? { ...b, createdAt: b.createdAt.toISOString() } : null);
    const plainCustomer = (c) =>
        c ? { ...c, createdAt: c.createdAt.toISOString(), birthDate: c.birthDate?.toISOString() ?? null } : null;
    const plainBookings = bookings.map((b) => ({
        ...b,
        scheduledAt: b.scheduledAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
        reminderSentAt: b.reminderSentAt?.toISOString() ?? null,
        barber: plainBarber(b.barber),
    }));

    const plainSales = [
        ...productSales30.map((s) => ({ ...s, kind: "product", name: s.productName })),
        ...serviceSales30.map((s) => ({ ...s, kind: "service", name: s.serviceName })),
    ]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), barber: plainBarber(s.barber), customer: plainCustomer(s.customer) }));

    const plainExpenses = expenses30.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
    const plainDaily = finance.daily.map((d) => ({ ...d, date: d.date.toISOString() }));
    const plainStaffUsers = staffUsers.map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, permissions: u.permissions }));
    const plainCurrentUser = { id: sessionUser.id, name: sessionUser.name, role: sessionUser.role };
    const plainBarbers = barbers.map((b) => plainBarber(b));
    const plainCustomers = customers.map((c) => plainCustomer(c));
    const plainShift = (s) => ({
        ...s,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        shiftType: s.shiftType ? { id: s.shiftType.id, name: s.shiftType.name } : null,
    });
    const plainShiftTypes = shiftTypes.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }));
    const plainShiftHistory = shiftHistory.map(plainShift);
    const plainOpenShift = plainShift(openShift);
    const plainInventoryMovements = inventoryMovements30.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), productName: m.product.name }));
    const plainCashMovements = cashMovements.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));

    const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

    return (
        <main className="min-h-screen bg-zinc-950">
            <TenantBoard
                tenant={plainTenant}
                currentUser={plainCurrentUser}
                perms={permsByModule}
                botConnected={Boolean(tenant.metaPhoneNumberId && tenant.metaAccessToken)}
                bookings={plainBookings}
                sales={plainSales}
                services={services}
                products={products}
                inventoryMovements={plainInventoryMovements}
                flowMessages={messagesByKey}
                staffUsers={plainStaffUsers}
                expenses={plainExpenses}
                businessHours={businessHours}
                ignoredContacts={ignoredContacts}
                barbers={plainBarbers}
                customers={plainCustomers}
                shiftTypes={plainShiftTypes}
                shiftHistory={plainShiftHistory}
                openShift={plainOpenShift}
                cashMovements={plainCashMovements}
                finance={{ ...finance, daily: plainDaily }}
                todayLabel={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
            />
        </main>
    );
}
