"use client";

import { useState, useTransition } from "react";
import Badge from "@/components/Badge";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { useToast } from "@/components/Toast";
import { money, contrastText, BOOKING_STATUS_META } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META } from "@/lib/payments";
import {
    createBooking,
    updateBooking,
    deleteBooking,
    markBookingCompleted,
    cancelBooking,
    getBookingsForDate,
} from "@/app/t/[slug]/actions";

const emptyForm = { customerName: "", customerPhone: "", serviceId: "", barberId: "", time: "09:00" };

const toISODate = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.toISOString();
};

const dateLabel = (dateISO) => {
    const d = new Date(dateISO);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    const long = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const cap = long.charAt(0).toUpperCase() + long.slice(1);
    if (diffDays === 0) return `Hoy · ${cap}`;
    if (diffDays === 1) return `Mañana · ${cap}`;
    if (diffDays === -1) return `Ayer · ${cap}`;
    return cap;
};

function CreateBookingForm({ services, barbers, brandStyle, isPending, error, onSave, onCancel }) {
    const [form, setForm] = useState(emptyForm);

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Cliente">
                    <TextInput value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Ej. Carlos Medina" />
                </Field>
                <Field label="Teléfono">
                    <TextInput value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="Opcional" />
                </Field>
                <Field label="Servicio">
                    <select
                        value={form.serviceId}
                        onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}
                        className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                    >
                        <option value="">Sin especificar (30 min)</option>
                        {services.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} · {s.durationMin} min
                            </option>
                        ))}
                    </select>
                </Field>
                {barbers.length > 0 ? (
                    <Field label="Barbero">
                        <select
                            value={form.barberId}
                            onChange={(e) => setForm((f) => ({ ...f, barberId: e.target.value }))}
                            className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                        >
                            <option value="">Sin asignar</option>
                            {barbers.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                ) : null}
                <Field label="Hora">
                    <input
                        type="time"
                        value={form.time}
                        onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                        className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                    />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    loading={isPending}
                    onClick={() => {
                        const [hour, minute] = form.time.split(":").map((n) => parseInt(n, 10) || 0);
                        onSave({ ...form, hour, minute });
                    }}
                >
                    Agendar
                </SheetButton>
                <SheetButton variant="ghost" onClick={onCancel}>
                    Cancelar
                </SheetButton>
            </div>
        </>
    );
}

export default function BookingsPanel({ initialBookings, services, barbers, slug, brandColor, perms, openCreateSignal }) {
    const [dateISO, setDateISO] = useState(toISODate(new Date()));
    const [bookings, setBookings] = useState(initialBookings);
    const [createOpen, setCreateOpen] = useState(false);

    // Atajo de teclado F2 (ver TenantBoard.js): cada vez que sube este contador, se abre
    // la hoja de "Nueva cita" — solo si el usuario tiene permiso, igual que el botón.
    // Patrón "ajustar estado durante el render" (recomendado por React) en vez de un
    // efecto, para no disparar un setState dentro de un useEffect.
    const [seenCreateSignal, setSeenCreateSignal] = useState(openCreateSignal);
    if (openCreateSignal !== seenCreateSignal) {
        setSeenCreateSignal(openCreateSignal);
        if (openCreateSignal && perms.canAdd) setCreateOpen(true);
    }
    const [selectedId, setSelectedId] = useState(null);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [serviceId, setServiceId] = useState("");
    const [barberId, setBarberId] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
    const [paymentStatus, setPaymentStatus] = useState("PAGADO");
    const [amountPaid, setAmountPaid] = useState("0");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };
    const selected = bookings.find((b) => b.id === selectedId) ?? null;

    const goToDate = (nextISO) => {
        startTransition(async () => {
            const rows = await getBookingsForDate(slug, nextISO);
            setDateISO(nextISO);
            setBookings(rows);
        });
    };
    const shiftDay = (delta) => goToDate(new Date(new Date(dateISO).getTime() + delta * 24 * 60 * 60 * 1000).toISOString());

    const openDetail = (b) => {
        setError("");
        setName(b.customerName ?? "");
        setPhone(b.customerPhone ?? "");
        setServiceId(b.serviceId ?? "");
        setBarberId(b.barberId ?? "");
        setPaymentMethod("EFECTIVO");
        setPaymentStatus("PAGADO");
        setAmountPaid(String((b.priceChargedCents ?? 0) / 100));
        setSelectedId(b.id);
    };

    const showToast = useToast();

    const run = (fn, onDone, successMessage) => {
        setError("");
        startTransition(async () => {
            try {
                await fn();
                const rows = await getBookingsForDate(slug, dateISO);
                setBookings(rows);
                onDone?.();
                if (successMessage) showToast(successMessage);
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <div>
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                    <button onClick={() => shiftDay(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400">
                        ‹
                    </button>
                    <p className="w-40 text-center text-[12px] font-bold text-zinc-300">{dateLabel(dateISO)}</p>
                    <button onClick={() => shiftDay(1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400">
                        ›
                    </button>
                </div>
                {perms.canAdd ? (
                    <button onClick={() => setCreateOpen(true)} style={brandStyle} className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-bold shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]">
                        + Agendar
                    </button>
                ) : null}
            </div>

            <div className="flex flex-col rounded-xl border border-white/10 bg-zinc-900 px-4 shadow-[var(--shadow-panel)]">
                {bookings.map((b) => {
                    const meta = BOOKING_STATUS_META[b.status];
                    return (
                        <button
                            key={b.id}
                            onClick={() => openDetail(b)}
                            className="grid w-full grid-cols-[52px_1fr_auto] items-center gap-2.5 border-b border-white/10 py-3 text-left last:border-b-0"
                        >
                            <span className="font-numeric text-[13px] text-zinc-400">{b.time}</span>
                            <span>
                                <span className="block text-sm font-bold text-zinc-50">{b.customerName ?? "Cliente"}</span>
                                <span className="block text-xs text-zinc-400">
                                    {b.service?.name ?? "Servicio"} · {b.durationMin} min{b.barber ? ` · ${b.barber.name}` : ""}
                                </span>
                            </span>
                            <span className="flex flex-col items-end gap-1">
                                <Badge tone={meta.tone}>{meta.label}</Badge>
                                {b.status === "COMPLETED" && b.paymentStatus !== "PAGADO" ? (
                                    <Badge tone={PAYMENT_STATUS_META[b.paymentStatus].tone}>{PAYMENT_STATUS_META[b.paymentStatus].label}</Badge>
                                ) : null}
                            </span>
                        </button>
                    );
                })}
                {bookings.length === 0 ? (
                    <div className="my-4 rounded-lg border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                        Sin citas agendadas este día.
                    </div>
                ) : null}
            </div>

            {perms.canAdd ? (
                <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title={`Agendar cita — ${dateLabel(dateISO)}`}>
                    {createOpen ? (
                        <CreateBookingForm
                            services={services}
                            barbers={barbers.filter((b) => b.active)}
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setCreateOpen(false)}
                            onSave={(data) => run(() => createBooking(slug, { ...data, dateISO }), () => setCreateOpen(false), "✅ Cita agendada")}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}

            <BottomSheet open={!!selected} onClose={() => setSelectedId(null)} title={selected?.customerName ?? "Cliente"} subtitle={selected?.time}>
                {selected ? (
                    <>
                        <div className="flex flex-col gap-3">
                            <Field label="Cliente">
                                <TextInput disabled={!perms.canEdit} value={name} onChange={(e) => setName(e.target.value)} />
                            </Field>
                            <Field label="Teléfono">
                                <TextInput disabled={!perms.canEdit} value={phone} onChange={(e) => setPhone(e.target.value)} />
                            </Field>
                            <Field label="Servicio">
                                <select
                                    disabled={!perms.canEdit}
                                    value={serviceId}
                                    onChange={(e) => setServiceId(e.target.value)}
                                    className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                                >
                                    <option value="">Sin especificar</option>
                                    {services.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            {barbers.length > 0 ? (
                                <Field label="Barbero">
                                    <select
                                        disabled={!perms.canEdit}
                                        value={barberId}
                                        onChange={(e) => setBarberId(e.target.value)}
                                        className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                                    >
                                        <option value="">Sin asignar</option>
                                        {barbers.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            ) : null}
                        </div>
                        <div className="my-3 flex items-center justify-between text-[13.5px]">
                            <span className="text-zinc-400">Estado actual</span>
                            <Badge tone={BOOKING_STATUS_META[selected.status].tone}>{BOOKING_STATUS_META[selected.status].label}</Badge>
                        </div>

                        {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}

                        <div className="flex flex-col gap-2">
                            {perms.canEdit ? (
                                <>
                                    <SheetButton
                                        variant="ghost"
                                        loading={isPending}
                                        onClick={() =>
                                            run(
                                                () =>
                                                    updateBooking(selected.id, slug, {
                                                        customerName: name,
                                                        customerPhone: phone,
                                                        serviceId: serviceId || null,
                                                        barberId: barberId || null,
                                                    }),
                                                null,
                                                "✅ Cambios guardados"
                                            )
                                        }
                                    >
                                        Guardar cambios
                                    </SheetButton>
                                    {selected.status !== "COMPLETED" ? (
                                        <>
                                            <Field label="Método de pago al completar">
                                                <select
                                                    value={paymentMethod}
                                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                                    className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                                                >
                                                    {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                                                        <option key={key} value={key}>
                                                            {label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>
                                            <Field label="Estatus de pago">
                                                <select
                                                    value={paymentStatus}
                                                    onChange={(e) => setPaymentStatus(e.target.value)}
                                                    className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                                                >
                                                    {Object.entries(PAYMENT_STATUS_META).map(([key, meta]) => (
                                                        <option key={key} value={key}>
                                                            {meta.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>
                                            {paymentStatus === "PARCIAL" ? (
                                                <Field label={`Monto pagado (de ${money(selected.priceChargedCents ?? 0)})`}>
                                                    <NumberInput value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} min="0" />
                                                </Field>
                                            ) : null}
                                            <SheetButton
                                                variant="brand"
                                                style={brandStyle}
                                                loading={isPending}
                                                onClick={() =>
                                                    run(
                                                        () =>
                                                            markBookingCompleted(selected.id, slug, {
                                                                paymentMethod,
                                                                paymentStatus,
                                                                amountPaidCents: Math.round(parseFloat(amountPaid || "0") * 100),
                                                            }),
                                                        null,
                                                        "✅ Cita completada"
                                                    )
                                                }
                                            >
                                                Marcar completado
                                            </SheetButton>
                                        </>
                                    ) : null}
                                    {selected.status !== "CANCELLED" ? (
                                        <SheetButton
                                            variant="danger"
                                            loading={isPending}
                                            onClick={() => run(() => cancelBooking(selected.id, slug), null, "Cita cancelada")}
                                        >
                                            Cancelar cita
                                        </SheetButton>
                                    ) : null}
                                </>
                            ) : null}
                            {perms.canDelete ? (
                                <SheetButton
                                    variant="danger"
                                    loading={isPending}
                                    onClick={() => run(() => deleteBooking(selected.id, slug), () => setSelectedId(null), "🗑️ Cita eliminada")}
                                >
                                    Eliminar cita
                                </SheetButton>
                            ) : null}
                        </div>
                    </>
                ) : null}
            </BottomSheet>
        </div>
    );
}
