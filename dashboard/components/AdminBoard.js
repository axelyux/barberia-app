"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Badge from "@/components/Badge";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import Avatar from "@/components/Avatar";
import { Field, TextInput, NumberInput, ColorPicker, ImagePicker } from "@/components/FormField";
import { money, shortDate, toDateInputValue, TENANT_STATUS_META } from "@/lib/format";
import { markTenantPaid, suspendTenant, reactivateTenant, createTenant, updateTenant } from "@/app/admin/actions";
import { logoutAdmin } from "@/app/admin/login/actions";

const FILTERS = [
    { key: "all", label: "Todas" },
    { key: "good", label: "Activas" },
    { key: "warn", label: "Por vencer" },
    { key: "bad", label: "Inactivas" },
];

const emptyForm = {
    name: "",
    ownerName: "",
    planPrice: "200",
    brandColor: "#D9A441",
    logoUrl: "",
    nextDueDate: toDateInputValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
};

function tenantToForm(t) {
    return {
        name: t.name,
        ownerName: t.ownerName ?? "",
        planPrice: String(t.planPriceCents / 100),
        brandColor: t.brandColor,
        logoUrl: t.logoUrl ?? "",
        nextDueDate: t.nextDueDate ? toDateInputValue(t.nextDueDate) : "",
    };
}

function TenantFormFields({ form, setForm }) {
    return (
        <div className="flex flex-col gap-3">
            <Field label="Nombre de la barbería">
                <TextInput
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ej. Fade King Barbería"
                />
            </Field>
            <Field label="Nombre del dueño">
                <TextInput
                    value={form.ownerName}
                    onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                    placeholder="Ej. Luis Torres"
                />
            </Field>
            <Field label="Plan mensual (MXN)">
                <NumberInput
                    value={form.planPrice}
                    onChange={(e) => setForm((f) => ({ ...f, planPrice: e.target.value }))}
                    min="0"
                    step="10"
                />
            </Field>
            <Field label="Fecha de vencimiento del plan">
                <input
                    type="date"
                    value={form.nextDueDate}
                    onChange={(e) => setForm((f) => ({ ...f, nextDueDate: e.target.value }))}
                    className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                />
            </Field>
            <Field label="Logo (opcional)">
                <ImagePicker value={form.logoUrl} onChange={(v) => setForm((f) => ({ ...f, logoUrl: v }))} />
            </Field>
            <Field label="Color de marca">
                <ColorPicker value={form.brandColor} onChange={(v) => setForm((f) => ({ ...f, brandColor: v }))} />
            </Field>
        </div>
    );
}

function EditTenantForm({ tenant, isPending, error, onSave, onMarkPaid, onSuspend, onReactivate }) {
    const [form, setForm] = useState(() => tenantToForm(tenant));

    return (
        <>
            <TenantFormFields form={form} setForm={setForm} />

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-[13.5px]">
                <span className="text-zinc-400">WhatsApp</span>
                <span className="font-numeric font-semibold text-zinc-100">{tenant.whatsappNumber ?? "Pendiente de vincular"}</span>
            </div>

            {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}

            <div className="mt-2 flex flex-col gap-2">
                <SheetButton
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                        onSave({
                            name: form.name,
                            ownerName: form.ownerName,
                            planPriceCents: Math.round(parseFloat(form.planPrice || "0") * 100),
                            brandColor: form.brandColor,
                            logoUrl: form.logoUrl,
                            nextDueDate: form.nextDueDate || null,
                        })
                    }
                >
                    Guardar cambios
                </SheetButton>
                <SheetButton variant="primary" disabled={isPending} onClick={onMarkPaid}>
                    Marcar como pagado
                </SheetButton>
                {tenant.whatsappNumber ? (
                    <a
                        href={`https://wa.me/${tenant.whatsappNumber}?text=${encodeURIComponent(
                            `Hola ${tenant.ownerName ?? ""}, te escribo para recordarte tu suscripción de ${tenant.name}.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-11 w-full items-center justify-center rounded-md border border-zinc-700 bg-zinc-800/60 text-sm font-bold text-zinc-100"
                    >
                        💬 Enviar recordatorio por WhatsApp
                    </a>
                ) : null}
                {tenant.status === "PAUSED" ? (
                    <SheetButton variant="good" disabled={isPending} onClick={onReactivate}>
                        Reactivar bot
                    </SheetButton>
                ) : (
                    <SheetButton variant="danger" disabled={isPending} onClick={onSuspend}>
                        Suspender bot
                    </SheetButton>
                )}
            </div>
        </>
    );
}

export default function AdminBoard({ tenants, monthlyRevenueCents, adminName }) {
    const [filter, setFilter] = useState("all");
    const [selectedId, setSelectedId] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState(emptyForm);
    const [error, setError] = useState("");
    const [newCredentials, setNewCredentials] = useState(null);
    const [isPending, startTransition] = useTransition();

    const counts = useMemo(() => {
        const c = { all: tenants.length, good: 0, warn: 0, bad: 0 };
        for (const t of tenants) c[TENANT_STATUS_META[t.status].tone]++;
        return c;
    }, [tenants]);

    const visibleTenants = useMemo(
        () => (filter === "all" ? tenants : tenants.filter((t) => TENANT_STATUS_META[t.status].tone === filter)),
        [tenants, filter]
    );

    const selected = tenants.find((t) => t.id === selectedId) ?? null;

    const runAction = (fn, { closeSheet = true, onSuccess } = {}) => {
        setError("");
        startTransition(async () => {
            try {
                const result = await fn();
                if (closeSheet) {
                    setSelectedId(null);
                    setCreateOpen(false);
                }
                onSuccess?.(result);
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <div className="mx-auto flex max-w-[430px] flex-col gap-5 px-4 pb-16 pt-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Image src="/logo-mibarber.png" alt="" width={36} height={36} className="rounded-lg" />
                    <div>
                        <p className="text-xs text-zinc-500">Hola, {adminName}</p>
                        <h1 className="text-[19px] font-bold text-zinc-50">Panel Admin</h1>
                    </div>
                </div>
                <button
                    onClick={() => logoutAdmin()}
                    className="flex min-h-9 items-center justify-center rounded-md border border-white/10 px-3 text-xs font-semibold text-zinc-400"
                >
                    Salir
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-md border border-white/10 bg-zinc-900 p-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Ingresos del mes</p>
                    <p className="font-numeric mt-2 text-[22px] font-bold text-zinc-50">{money(monthlyRevenueCents)}</p>
                    <p className="mt-1.5 text-xs text-zinc-400">de {tenants.length} barberías</p>
                </div>
                <div className="rounded-md border border-white/10 bg-zinc-900 p-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Barberías totales</p>
                    <p className="font-numeric mt-2 text-[22px] font-bold text-zinc-50">{tenants.length}</p>
                    <p className="mt-1.5 text-xs text-zinc-400">
                        {counts.good} activas · {counts.warn + counts.bad} por revisar
                    </p>
                </div>
            </div>

            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        aria-pressed={filter === f.key}
                        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3.5 text-sm font-semibold transition-colors ${filter === f.key
                                ? "border-amber-700/50 bg-amber-500/10 text-amber-400"
                                : "border-white/10 bg-zinc-900 text-zinc-400"
                            }`}
                    >
                        {f.label}
                        <span className="font-numeric opacity-70">{counts[f.key]}</span>
                    </button>
                ))}
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Barberías</p>
                    <button
                        onClick={() => {
                            setError("");
                            setCreateForm(emptyForm);
                            setCreateOpen(true);
                        }}
                        className="flex h-8 items-center gap-1 rounded-md bg-amber-500 px-3 text-xs font-bold text-zinc-950"
                    >
                        + Nueva barbería
                    </button>
                </div>
                <div className="flex flex-col gap-2.5">
                    {visibleTenants.map((t) => {
                        const meta = TENANT_STATUS_META[t.status];
                        const daysLeft = t.nextDueDate
                            ? Math.ceil((new Date(t.nextDueDate) - new Date()) / (24 * 60 * 60 * 1000))
                            : null;
                        return (
                            <div key={t.id} className="rounded-md border border-white/10 bg-zinc-900 p-3.5">
                                <button onClick={() => setSelectedId(t.id)} className="flex w-full items-start gap-3 text-left">
                                    <Avatar name={t.name} logoUrl={t.logoUrl} color={t.brandColor} square />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-[15px] font-bold text-zinc-50">{t.name}</p>
                                                <p className="truncate text-xs text-zinc-400">{t.ownerName ?? "Sin dueño registrado"}</p>
                                            </div>
                                            <Badge tone={meta.tone}>{meta.label}</Badge>
                                        </div>
                                        <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 border-t border-white/10 pt-2.5 text-xs text-zinc-400">
                                            <span>
                                                Plan <b className="font-numeric font-semibold text-zinc-100">{money(t.planPriceCents)}</b>/mes
                                            </span>
                                            <span>
                                                {t.status === "PAUSED" ? "Venció" : "Renueva"}{" "}
                                                <b className="font-numeric font-semibold text-zinc-100">
                                                    {t.nextDueDate ? shortDate(t.nextDueDate) : "—"}
                                                </b>
                                                {t.status !== "PAUSED" && daysLeft !== null ? (
                                                    <span className={daysLeft <= 2 ? "text-red-400" : daysLeft <= 7 ? "text-orange-400" : "text-zinc-500"}>
                                                        {" "}
                                                        ({daysLeft <= 0 ? "vence hoy" : `${daysLeft}d`})
                                                    </span>
                                                ) : null}
                                            </span>
                                            {!t.whatsappNumber ? <span className="text-orange-400">Pendiente de vincular</span> : null}
                                        </div>
                                    </div>
                                </button>
                                <div className="mt-2.5 flex gap-2">
                                    {t.whatsappNumber ? (
                                        <a
                                            href={`https://wa.me/${t.whatsappNumber}?text=${encodeURIComponent(
                                                `Hola ${t.ownerName ?? ""}, te escribo para recordarte tu suscripción de ${t.name}.`
                                            )}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-emerald-800/50 bg-zinc-800/60 text-sm font-semibold text-emerald-400"
                                        >
                                            💬 Cobrar
                                        </a>
                                    ) : (
                                        <span className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-white/10 bg-zinc-800/30 text-sm text-zinc-600">
                                            Sin WhatsApp
                                        </span>
                                    )}
                                    <button
                                        disabled={isPending}
                                        onClick={() =>
                                            runAction(() => (t.status === "PAUSED" ? reactivateTenant(t.id) : suspendTenant(t.id)), {
                                                closeSheet: false,
                                            })
                                        }
                                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-red-800/50 bg-zinc-800/60 text-sm font-semibold text-red-400 disabled:opacity-50"
                                    >
                                        {t.status === "PAUSED" ? "▶ Reactivar" : "⏸ Suspender"}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {visibleTenants.length === 0 ? (
                        <p className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
                            No hay barberías en este filtro.
                        </p>
                    ) : null}
                </div>
            </div>

            {/* -------- Sheet: editar barbería existente -------- */}
            <BottomSheet open={!!selected} onClose={() => setSelectedId(null)} title="Editar barbería" subtitle={selected?.slug}>
                {selected ? (
                    <EditTenantForm
                        key={selected.id}
                        tenant={selected}
                        isPending={isPending}
                        error={error}
                        onSave={(data) => runAction(() => updateTenant(selected.id, data), { closeSheet: false })}
                        onMarkPaid={() => runAction(() => markTenantPaid(selected.id))}
                        onSuspend={() => runAction(() => suspendTenant(selected.id))}
                        onReactivate={() => runAction(() => reactivateTenant(selected.id))}
                    />
                ) : null}
            </BottomSheet>

            {/* -------- Sheet: nueva barbería -------- */}
            <BottomSheet
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Nueva barbería"
                subtitle="Se crea como 'pendiente de vincular' hasta que conectes su WhatsApp"
            >
                <TenantFormFields form={createForm} setForm={setCreateForm} />
                {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
                <div className="mt-4 flex flex-col gap-2">
                    <SheetButton
                        variant="primary"
                        disabled={isPending}
                        onClick={() =>
                            runAction(
                                () =>
                                    createTenant({
                                        name: createForm.name,
                                        ownerName: createForm.ownerName,
                                        planPriceCents: Math.round(parseFloat(createForm.planPrice || "0") * 100),
                                        brandColor: createForm.brandColor,
                                        logoUrl: createForm.logoUrl,
                                        nextDueDate: createForm.nextDueDate || null,
                                    }),
                                { onSuccess: (result) => result && setNewCredentials(result) }
                            )
                        }
                    >
                        Crear barbería
                    </SheetButton>
                    <SheetButton variant="ghost" disabled={isPending} onClick={() => setCreateOpen(false)}>
                        Cancelar
                    </SheetButton>
                </div>
            </BottomSheet>

            {/* -------- Sheet: credenciales del usuario inicial (solo se muestran una vez) -------- */}
            <BottomSheet
                open={!!newCredentials}
                onClose={() => setNewCredentials(null)}
                title="Barbería creada"
                subtitle="Guarda esta contraseña, no se vuelve a mostrar"
            >
                {newCredentials ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-zinc-400">
                            Comparte estos datos con el dueño para su primer inicio de sesión en{" "}
                            <span className="font-semibold text-zinc-200">/t/{newCredentials.slug}</span>:
                        </p>
                        <div className="rounded-md border border-white/10 bg-zinc-900 p-3.5 font-mono text-sm text-zinc-100">
                            <p>Usuario: {newCredentials.username}</p>
                            <p>Contraseña: {newCredentials.tempPassword}</p>
                        </div>
                        <SheetButton variant="primary" onClick={() => setNewCredentials(null)}>
                            Ya la guardé
                        </SheetButton>
                    </div>
                ) : null}
            </BottomSheet>
        </div>
    );
}
