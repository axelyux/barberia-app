import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import TenantBoard from "@/components/TenantBoard";
import OpenShiftGate from "@/components/OpenShiftGate";
import { buildFinanceData } from "@/lib/finance";
import { ALL_PAYMENT_METHODS } from "@/lib/payments";
import { zonedNow, TENANT_TIME_ZONE } from "@/lib/scheduling";
import { shiftLabel } from "@/lib/format";

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

    const startOfToday = zonedNow();
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
        paymentMethodOverrides,
        completedBookingsThisShift,
    ] = await Promise.all([
        prisma.booking.findMany({
            where: { tenantId: tenant.id, scheduledAt: { gte: startOfToday, lt: startOfTomorrow } },
            include: { service: true, barber: true },
            orderBy: { scheduledAt: "asc" },
        }),
        prisma.productSale.findMany({
            where: { tenantId: tenant.id, createdAt: { gte: start30 } },
            include: { barber: true, customer: true, cashShift: { select: { id: true, startedAt: true, shiftType: { select: { name: true } } } } },
            orderBy: { createdAt: "desc" },
        }),
        prisma.serviceSale.findMany({
            where: { tenantId: tenant.id, createdAt: { gte: start30 } },
            include: { barber: true, customer: true, cashShift: { select: { id: true, startedAt: true, shiftType: { select: { name: true } } } } },
            orderBy: { createdAt: "desc" },
        }),
        prisma.service.findMany({ where: { tenantId: tenant.id }, orderBy: { sortOrder: "asc" } }),
        prisma.product.findMany({ where: { tenantId: tenant.id }, orderBy: { sortOrder: "asc" } }),
        prisma.flowMessage.findMany({ where: { tenantId: tenant.id } }),
        prisma.staffUser.findMany({ where: { tenantId: tenant.id }, include: { permissions: true }, orderBy: { createdAt: "asc" } }),
        prisma.booking.findMany({ where: { tenantId: tenant.id, status: "COMPLETED", scheduledAt: { gte: start30 } }, include: { barber: true } }),
        prisma.expense.findMany({
            where: { tenantId: tenant.id, createdAt: { gte: start30 } },
            include: { product: true, cashShift: { select: { id: true, startedAt: true, shiftType: { select: { name: true } } } } },
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
        prisma.tenantPaymentMethod.findMany({ where: { tenantId: tenant.id } }),
        // Mismo criterio exacto que closeShift() en shift-actions.js (completedAt, no
        // scheduledAt) — si no coincide, el efectivo esperado que se muestra en pantalla
        // no cuadraría con lo que el sistema calcula de verdad al cerrar el turno.
        prisma.booking.findMany({
            where: { tenantId: tenant.id, status: "COMPLETED", completedAt: { gte: openShift.startedAt } },
            select: { id: true, amountPaidCents: true, paymentMethod: true, customerName: true, completedAt: true },
        }),
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
        .map((s) => ({
            ...s,
            createdAt: s.createdAt.toISOString(),
            cancelledAt: s.cancelledAt?.toISOString() ?? null,
            cashShift: undefined,
            shiftLabel: shiftLabel(s.cashShift),
            barber: plainBarber(s.barber),
            customer: plainCustomer(s.customer),
        }));

    const plainExpenses = expenses30.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
        cancelledAt: e.cancelledAt?.toISOString() ?? null,
        cashShift: undefined,
        shiftLabel: shiftLabel(e.cashShift),
    }));
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
    // Sin fila para un método = activo por default (así ninguna barbería existente pierde
    // opciones al agregar esta tabla) — solo las que tienen una fila explícita se filtran.
    const overrideByMethod = Object.fromEntries(paymentMethodOverrides.map((p) => [p.method, p.active]));
    const activePaymentMethods = ALL_PAYMENT_METHODS.filter((m) => overrideByMethod[m] ?? true);
    const paymentMethodStatus = ALL_PAYMENT_METHODS.map((m) => ({ method: m, active: overrideByMethod[m] ?? true }));

    // Mismo cálculo que closeShift() en shift-actions.js — se muestra en pantalla ANTES de
    // cerrar el turno para que el cajero nunca vea el campo "efectivo contado" en $0.
    // Pertenece al turno por su vínculo explícito, no por su fecha (ver closeShift): editar
    // la fecha de una venta no debe moverla de caja.
    const activeInShift = (s) => !s.cancelledAt && s.cashShiftId === openShift.id;
    const shiftRevenueRows = [
        ...completedBookingsThisShift,
        ...productSales30.filter(activeInShift),
        ...serviceSales30.filter(activeInShift),
    ];
    const shiftCashRevenueCents = shiftRevenueRows
        .filter((r) => r.paymentMethod === "EFECTIVO")
        .reduce((sum, r) => sum + (r.amountPaidCents ?? 0), 0);
    // Gastos que de verdad sacaron billetes del cajón en este turno: en efectivo, marcados
    // como salidos de caja, y no cancelados. Se muestran también en el desglose del turno.
    const shiftCashExpenses = expenses30.filter(
        (e) => activeInShift(e) && e.paymentMethod === "EFECTIVO" && e.fromCashRegister
    );
    const shiftCashExpenseCents = shiftCashExpenses.reduce((sum, e) => sum + e.amountCents, 0);
    const shiftCashDepositCents = cashMovements.filter((m) => m.type === "DEPOSITO").reduce((sum, m) => sum + m.amountCents, 0);
    const shiftCashWithdrawalCents = cashMovements.filter((m) => m.type === "RETIRO").reduce((sum, m) => sum + m.amountCents, 0);
    const expectedCashCents =
        openShift.openingCashCents + shiftCashRevenueCents - shiftCashExpenseCents + shiftCashDepositCents - shiftCashWithdrawalCents;

    // Desglose de TODO lo que movió billetes en el cajón durante este turno, en una sola
    // lista ordenada. Sin esto, el "efectivo esperado" era un número que había que creer a
    // ciegas: ahora fondo inicial + estas líneas da exactamente ese total, y se ve de dónde
    // salió cada peso. Las ventas/gastos con tarjeta o transferencia no aparecen porque no
    // tocan el cajón.
    const cashLedger = [
        ...completedBookingsThisShift
            .filter((b) => b.paymentMethod === "EFECTIVO")
            .map((b) => ({
                id: `booking-${b.id}`,
                label: b.customerName ? `Cita · ${b.customerName}` : "Cita completada",
                amountCents: b.amountPaidCents ?? 0,
                createdAt: (b.completedAt ?? openShift.startedAt).toISOString(),
            })),
        ...productSales30
            .filter((s) => activeInShift(s) && s.paymentMethod === "EFECTIVO")
            .map((s) => ({
                id: `psale-${s.id}`,
                label: `Venta · ${s.productName}`,
                amountCents: s.amountPaidCents ?? 0,
                createdAt: s.createdAt.toISOString(),
            })),
        ...serviceSales30
            .filter((s) => activeInShift(s) && s.paymentMethod === "EFECTIVO")
            .map((s) => ({
                id: `ssale-${s.id}`,
                label: `Venta · ${s.serviceName}`,
                amountCents: s.amountPaidCents ?? 0,
                createdAt: s.createdAt.toISOString(),
            })),
        ...shiftCashExpenses.map((e) => ({
            id: `expense-${e.id}`,
            label: `Gasto · ${e.description}`,
            amountCents: -e.amountCents,
            createdAt: e.createdAt.toISOString(),
        })),
        ...cashMovements.map((m) => ({
            id: `mov-${m.id}`,
            label: m.reason || (m.type === "DEPOSITO" ? "Entrada de efectivo" : "Salida de efectivo"),
            amountCents: m.type === "DEPOSITO" ? m.amountCents : -m.amountCents,
            createdAt: m.createdAt.toISOString(),
        })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: TENANT_TIME_ZONE });

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
                expectedCashCents={expectedCashCents}
                cashLedger={cashLedger}
                cashMovements={plainCashMovements}
                activePaymentMethods={activePaymentMethods}
                paymentMethodStatus={paymentMethodStatus}
                finance={{ ...finance, daily: plainDaily }}
                todayLabel={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
            />
        </main>
    );
}
