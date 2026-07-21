"use client";

import { useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import LogoutButton from "@/components/LogoutButton";
import BookingsPanel from "@/components/BookingsPanel";
import CatalogList from "@/components/CatalogList";
import ProductsInventory from "@/components/ProductsInventory";
import SalesPanel from "@/components/SalesPanel";
import ExpenseList from "@/components/ExpenseList";
import BrandingEditor from "@/components/BrandingEditor";
import FlowEditor from "@/components/FlowEditor";
import FinancePanel from "@/components/FinancePanel";
import UsersEditor from "@/components/UsersEditor";
import BusinessHoursEditor from "@/components/BusinessHoursEditor";
import LiveClock from "@/components/LiveClock";
import IgnoredContactsEditor from "@/components/IgnoredContactsEditor";
import BarbersEditor from "@/components/BarbersEditor";
import CustomersEditor from "@/components/CustomersEditor";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import CashShiftPanel from "@/components/CashShiftPanel";
import ShiftTypesEditor from "@/components/ShiftTypesEditor";
import PushNotificationSetup from "@/components/PushNotificationSetup";
import { IconToday, IconCatalog, IconSales, IconFinance, IconWorkers, IconBot, IconSettings } from "@/components/TabIcons";
import { money } from "@/lib/format";
import { createService, updateService, deleteService } from "@/app/t/[slug]/catalog-actions";

// Cada pestaña puede agrupar varias secciones (se ven como bloques separados dentro de la pestaña,
// no como un solo formulario) para no tener una barra de navegación con muchos íconos en un celular.
const TABS = [
    { key: "hoy", label: "Agenda", Icon: IconToday, show: (p) => p.CITAS.canView },
    { key: "catalogo", label: "Catálogo", Icon: IconCatalog, show: (p) => p.SERVICIOS.canView || p.PRODUCTOS.canView },
    { key: "caja", label: "Caja", Icon: IconSales, show: (p) => p.PRODUCTOS.canView || p.SERVICIOS.canView || p.FINANZAS.canView },
    { key: "finanzas", label: "Finanzas", Icon: IconFinance, show: (p) => p.FINANZAS.canView },
    { key: "equipo", label: "Equipo", Icon: IconWorkers, show: (p) => p.SEGURIDAD.canView || p.CITAS.canView },
    { key: "bot", label: "Bot", Icon: IconBot, show: (p) => p.BOT.canView },
    { key: "ajustes", label: "Ajustes", Icon: IconSettings, show: (p) => p.SEGURIDAD.canView },
];

export default function TenantBoard({
    tenant,
    currentUser,
    perms,
    bookings,
    sales,
    services,
    products,
    flowMessages,
    staffUsers,
    expenses,
    businessHours,
    ignoredContacts,
    barbers,
    customers,
    shiftTypes,
    shiftHistory,
    openShift,
    finance,
    todayLabel,
}) {
    const allowedTabs = useMemo(() => TABS.filter((t) => t.show(perms)), [perms]);
    const [tab, setTab] = useState(allowedTabs[0]?.key ?? "hoy");
    const activeTab = allowedTabs.some((t) => t.key === tab) ? tab : allowedTabs[0]?.key;
    const [cajaSubTab, setCajaSubTab] = useState("ventas");

    const completedToday = bookings.filter((b) => b.status === "COMPLETED");
    const servicesRevenue = completedToday.reduce((sum, b) => sum + (b.amountPaidCents ?? 0), 0);
    const todayKey = new Date().toDateString();
    const salesToday = sales.filter((s) => new Date(s.createdAt).toDateString() === todayKey);
    const salesRevenue = salesToday.reduce((sum, s) => sum + (s.amountPaidCents ?? 0), 0);
    const pendingToday =
        completedToday
            .filter((b) => b.paymentStatus !== "PAGADO")
            .reduce((sum, b) => sum + ((b.priceChargedCents ?? 0) - (b.amountPaidCents ?? 0)), 0) +
        salesToday
            .filter((s) => s.paymentStatus !== "PAGADO")
            .reduce((sum, s) => sum + (s.priceCents - (s.discountCents ?? 0) + (s.tipCents ?? 0) - (s.amountPaidCents ?? 0)), 0);
    const lowStockProducts = products.filter((p) => p.active && p.stock <= p.lowStockThreshold);

    const brandColor = tenant.brandColor;
    const salesPerms = { productos: perms.PRODUCTOS, servicios: perms.SERVICIOS };

    return (
        <div className="mx-auto flex max-w-[430px] flex-col">
            <PushNotificationSetup />
            <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-6">
                <div className="flex items-center gap-3">
                    <Avatar name={tenant.name} logoUrl={tenant.logoUrl} color={brandColor} size={40} square />
                    <div>
                        <p className="text-xs text-zinc-500">{todayLabel}</p>
                        <h1 className="text-[17px] font-bold text-zinc-50">{tenant.name}</h1>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <p className="text-[11px] text-zinc-500">{currentUser.name}</p>
                    <LogoutButton />
                </div>
            </div>

            <div className="flex flex-col gap-4 px-4 pb-28 pt-2">
                {allowedTabs.length === 0 ? (
                    <p className="rounded-md border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                        Tu usuario no tiene ninguna vista habilitada. Pídele al administrador que te asigne permisos.
                    </p>
                ) : null}

                {activeTab === "hoy" ? (
                    <>
                        <OnboardingChecklist
                            tenantSlug={tenant.slug}
                            brandColor={brandColor}
                            steps={[
                                { label: "Agrega tus servicios (corte, barba...)", done: services.length > 0 },
                                { label: "Configura tu horario de atención", done: businessHours.length > 0 },
                                { label: "Registra a tu equipo de barberos", done: barbers.length > 0 },
                                { label: "Agrega tu inventario de productos", done: products.length > 0 },
                            ]}
                        />

                        <div className="grid grid-cols-2 gap-2.5">
                            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3.5">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Citas hoy</p>
                                <p className="font-numeric mt-2 text-[34px] font-bold" style={{ color: brandColor }}>
                                    {bookings.length}
                                </p>
                            </div>
                            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3.5">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Ingresos de hoy</p>
                                <p className="font-numeric mt-2 text-[22px] font-bold text-zinc-50">
                                    {money(servicesRevenue + salesRevenue)}
                                </p>
                                <div className="mt-1.5 flex justify-between text-xs text-zinc-400">
                                    <span>Citas completadas</span>
                                    <b className="font-numeric font-semibold text-zinc-100">{money(servicesRevenue)}</b>
                                </div>
                                <div className="flex justify-between text-xs text-zinc-400">
                                    <span>Ventas de mostrador</span>
                                    <b className="font-numeric font-semibold text-zinc-100">{money(salesRevenue)}</b>
                                </div>
                                {pendingToday > 0 ? (
                                    <div className="mt-1.5 flex justify-between border-t border-zinc-800 pt-1.5 text-xs text-orange-400">
                                        <span>Pendiente de cobro</span>
                                        <b className="font-numeric font-semibold">{money(pendingToday)}</b>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <BookingsPanel
                            initialBookings={bookings}
                            services={services}
                            barbers={barbers}
                            slug={tenant.slug}
                            brandColor={brandColor}
                            perms={perms.CITAS}
                        />

                        {perms.FINANZAS.canView ? (
                            <div className="border-t border-zinc-800 pt-4">
                                <CashShiftPanel
                                    openShift={openShift}
                                    shiftHistory={shiftHistory}
                                    slug={tenant.slug}
                                    brandColor={brandColor}
                                    canClose={perms.FINANZAS.canAdd}
                                />
                            </div>
                        ) : null}
                    </>
                ) : null}

                {activeTab === "catalogo" ? (
                    <>
                        {perms.SERVICIOS.canView ? (
                            <CatalogList
                                title="Servicios"
                                emptyLabel="Todavía no agregas servicios."
                                items={services}
                                slug={tenant.slug}
                                brandColor={brandColor}
                                perms={perms.SERVICIOS}
                                extra={{ key: "durationMin", label: "Duración (minutos)", suffix: "min" }}
                                onCreate={createService}
                                onUpdate={updateService}
                                onDelete={deleteService}
                            />
                        ) : null}

                        {perms.PRODUCTOS.canView ? (
                            <>
                                <div className="border-t border-zinc-800 pt-4">
                                    {lowStockProducts.length > 0 ? (
                                        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-3.5">
                                            <p className="text-[12px] font-bold uppercase tracking-wide text-red-400">Stock bajo</p>
                                            <p className="mt-1 text-[13px] text-red-200">
                                                {lowStockProducts.map((p) => p.name).join(", ")} —{" "}
                                                {lowStockProducts.length === 1 ? "necesita" : "necesitan"} reponerse pronto.
                                            </p>
                                        </div>
                                    ) : null}
                                    <ProductsInventory products={products} slug={tenant.slug} brandColor={brandColor} perms={perms.PRODUCTOS} />
                                </div>
                            </>
                        ) : null}
                    </>
                ) : null}

                {activeTab === "caja" ? (
                    <>
                        {(perms.PRODUCTOS.canView || perms.SERVICIOS.canView) && perms.FINANZAS.canView ? (
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setCajaSubTab("ventas")}
                                    className="flex h-9 items-center justify-center rounded-md border text-sm font-semibold"
                                    style={
                                        cajaSubTab === "ventas"
                                            ? { borderColor: brandColor, color: brandColor }
                                            : { borderColor: "#3f3f46", color: "#a1a1aa" }
                                    }
                                >
                                    Ventas
                                </button>
                                <button
                                    onClick={() => setCajaSubTab("gastos")}
                                    className="flex h-9 items-center justify-center rounded-md border text-sm font-semibold"
                                    style={
                                        cajaSubTab === "gastos"
                                            ? { borderColor: brandColor, color: brandColor }
                                            : { borderColor: "#3f3f46", color: "#a1a1aa" }
                                    }
                                >
                                    Gastos
                                </button>
                            </div>
                        ) : null}

                        {cajaSubTab === "gastos" && perms.FINANZAS.canView ? (
                            <ExpenseList expenses={expenses} products={products} slug={tenant.slug} brandColor={brandColor} perms={perms.FINANZAS} />
                        ) : (
                            <SalesPanel
                                products={products}
                                services={services}
                                sales={sales}
                                barbers={barbers}
                                customers={customers}
                                slug={tenant.slug}
                                brandColor={brandColor}
                                perms={salesPerms}
                            />
                        )}
                    </>
                ) : null}

                {activeTab === "finanzas" ? <FinancePanel finance={finance} /> : null}

                {activeTab === "equipo" ? (
                    <>
                        {perms.SEGURIDAD.canView ? (
                            <BarbersEditor barbers={barbers} slug={tenant.slug} brandColor={brandColor} perms={perms.SEGURIDAD} />
                        ) : null}
                        {perms.CITAS.canView ? (
                            <div className={perms.SEGURIDAD.canView ? "border-t border-zinc-800 pt-4" : ""}>
                                <CustomersEditor customers={customers} barbers={barbers} slug={tenant.slug} brandColor={brandColor} perms={perms.CITAS} />
                            </div>
                        ) : null}
                    </>
                ) : null}

                {activeTab === "bot" ? (
                    <>
                        <FlowEditor initialMessages={flowMessages} brandColor={brandColor} slug={tenant.slug} perms={perms.BOT} />
                        <IgnoredContactsEditor contacts={ignoredContacts} slug={tenant.slug} brandColor={brandColor} perms={perms.BOT} />
                    </>
                ) : null}

                {activeTab === "ajustes" ? (
                    <>
                        <LiveClock />
                        <ShiftTypesEditor shiftTypes={shiftTypes} slug={tenant.slug} brandColor={brandColor} perms={perms.SEGURIDAD} />
                        <BusinessHoursEditor tenant={tenant} hours={businessHours} perms={perms.SEGURIDAD} />
                        <BrandingEditor tenant={tenant} perms={perms.SEGURIDAD} />
                        <UsersEditor users={staffUsers} slug={tenant.slug} brandColor={brandColor} perms={perms.SEGURIDAD} />
                    </>
                ) : null}
            </div>

            <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
                <div className="mx-auto flex max-w-[430px] justify-around gap-0.5 overflow-x-auto px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {allowedTabs.map(({ key, label, Icon }) => {
                        const active = activeTab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className="flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-1"
                                style={{ color: active ? brandColor : "#71717a" }}
                            >
                                <Icon />
                                <span className="text-[10px] font-semibold leading-tight">{label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
