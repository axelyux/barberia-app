"use client";

import { useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import LogoutButton from "@/components/LogoutButton";
import BookingsPanel from "@/components/BookingsPanel";
import CatalogList from "@/components/CatalogList";
import ProductPurchases from "@/components/ProductPurchases";
import ProductSalesLog from "@/components/ProductSalesLog";
import BrandingEditor from "@/components/BrandingEditor";
import FlowEditor from "@/components/FlowEditor";
import FinancePanel from "@/components/FinancePanel";
import UsersEditor from "@/components/UsersEditor";
import BusinessHoursEditor from "@/components/BusinessHoursEditor";
import LiveClock from "@/components/LiveClock";
import IgnoredContactsEditor from "@/components/IgnoredContactsEditor";
import PushNotificationSetup from "@/components/PushNotificationSetup";
import { IconToday, IconCatalog, IconBot, IconFinance, IconSettings } from "@/components/TabIcons";
import { money } from "@/lib/format";
import {
    createService,
    updateService,
    deleteService,
    createProduct,
    updateProduct,
    deleteProduct,
} from "@/app/t/[slug]/catalog-actions";

const TABS = [
    { key: "hoy", label: "Agenda", Icon: IconToday, show: (p) => p.CITAS.canView },
    { key: "catalogo", label: "Catálogo", Icon: IconCatalog, show: (p) => p.SERVICIOS.canView || p.PRODUCTOS.canView },
    { key: "finanzas", label: "Finanzas", Icon: IconFinance, show: (p) => p.FINANZAS.canView },
    { key: "bot", label: "Bot", Icon: IconBot, show: (p) => p.BOT.canView },
    { key: "ajustes", label: "Ajustes", Icon: IconSettings, show: (p) => p.SEGURIDAD.canView },
];

export default function TenantBoard({
    tenant,
    currentUser,
    perms,
    bookings,
    productSales,
    services,
    products,
    productPurchases,
    flowMessages,
    staffUsers,
    expenses,
    businessHours,
    ignoredContacts,
    finance,
    todayLabel,
}) {
    const allowedTabs = useMemo(() => TABS.filter((t) => t.show(perms)), [perms]);
    const [tab, setTab] = useState(allowedTabs[0]?.key ?? "hoy");
    const activeTab = allowedTabs.some((t) => t.key === tab) ? tab : allowedTabs[0]?.key;

    const servicesRevenue = bookings
        .filter((b) => b.status === "COMPLETED")
        .reduce((sum, b) => sum + (b.priceChargedCents ?? 0), 0);
    const productsRevenue = productSales.reduce((sum, s) => sum + s.priceCents, 0);

    const brandColor = tenant.brandColor;

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
                                    {money(servicesRevenue + productsRevenue)}
                                </p>
                                <div className="mt-1.5 flex justify-between text-xs text-zinc-400">
                                    <span>Servicios</span>
                                    <b className="font-numeric font-semibold text-zinc-100">{money(servicesRevenue)}</b>
                                </div>
                                <div className="flex justify-between text-xs text-zinc-400">
                                    <span>Productos</span>
                                    <b className="font-numeric font-semibold text-zinc-100">{money(productsRevenue)}</b>
                                </div>
                            </div>
                        </div>

                        <BookingsPanel initialBookings={bookings} services={services} slug={tenant.slug} brandColor={brandColor} perms={perms.CITAS} />
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
                                <CatalogList
                                    title="Productos"
                                    emptyLabel="Todavía no agregas productos."
                                    items={products}
                                    slug={tenant.slug}
                                    brandColor={brandColor}
                                    perms={perms.PRODUCTOS}
                                    extra={{ key: "stock", label: "Inventario", suffix: "pzas" }}
                                    onCreate={createProduct}
                                    onUpdate={updateProduct}
                                    onDelete={deleteProduct}
                                />
                                <ProductSalesLog products={products} sales={productSales} slug={tenant.slug} perms={perms.PRODUCTOS} />
                                <ProductPurchases
                                    products={products}
                                    purchases={productPurchases}
                                    slug={tenant.slug}
                                    brandColor={brandColor}
                                    perms={perms.PRODUCTOS}
                                />
                            </>
                        ) : null}
                    </>
                ) : null}

                {activeTab === "finanzas" ? (
                    <FinancePanel finance={finance} expenses={expenses} slug={tenant.slug} brandColor={brandColor} perms={perms.FINANZAS} />
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
                        <BusinessHoursEditor tenant={tenant} hours={businessHours} perms={perms.SEGURIDAD} />
                        <BrandingEditor tenant={tenant} perms={perms.SEGURIDAD} />
                        <UsersEditor users={staffUsers} slug={tenant.slug} brandColor={brandColor} perms={perms.SEGURIDAD} />
                    </>
                ) : null}
            </div>

            <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
                <div className="mx-auto flex max-w-[430px] justify-around px-2 py-1.5">
                    {allowedTabs.map(({ key, label, Icon }) => {
                        const active = activeTab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md px-3 py-1"
                                style={{ color: active ? brandColor : "#71717a" }}
                            >
                                <Icon />
                                <span className="text-[10.5px] font-semibold">{label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
