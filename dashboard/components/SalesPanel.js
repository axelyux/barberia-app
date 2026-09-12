"use client";
import { useGlobalPending } from "@/components/GlobalLoading";
import { friendlyError } from "@/lib/errors";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import DateRangeBar from "@/components/DateRangeBar";
import Badge from "@/components/Badge";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { money, shortDateTime, toDatetimeLocalValue, toDateInputValue, localInputToISO, contrastText } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META, visiblePaymentMethods } from "@/lib/payments";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "@/components/Toast";
import {
    registerProductSale,
    updateProductSale,
    cancelProductSale,
    registerServiceSale,
    updateServiceSale,
    cancelServiceSale,
    getSalesForRange,
    exportSalesCSV,
} from "@/app/t/[slug]/sales-actions";

const startOf30DaysAgo = () => toDateInputValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

function PaymentMethodSelect({ value, onChange, disabled, activeMethods }) {
    return (
        <select
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {visiblePaymentMethods(activeMethods, value).map(([key, label]) => (
                <option key={key} value={key}>
                    {label}
                </option>
            ))}
        </select>
    );
}

function PaymentStatusFields({ status, amountPaid, netTotalCents, onStatus, onAmountPaid, disabled }) {
    return (
        <>
            <Field label="Estatus de pago">
                <select
                    value={status}
                    onChange={(e) => onStatus(e.target.value)}
                    disabled={disabled}
                    className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {Object.entries(PAYMENT_STATUS_META).map(([key, meta]) => (
                        <option key={key} value={key}>
                            {meta.label}
                        </option>
                    ))}
                </select>
            </Field>
            {status === "PARCIAL" ? (
                <Field label={`Monto pagado (de ${money(netTotalCents)})`}>
                    <NumberInput value={amountPaid} onChange={(e) => onAmountPaid(e.target.value)} min="0" disabled={disabled} />
                </Field>
            ) : null}
        </>
    );
}

function QuantityDiscountTipFields({ showQuantity, quantity, discount, tip, notes, onQuantity, onDiscount, onTip, onNotes, disabled }) {
    return (
        <>
            {showQuantity ? (
                <Field label="Cantidad">
                    <NumberInput
                        value={quantity}
                        onChange={(e) => onQuantity(e.target.value.replace(/[^0-9]/g, ""))}
                        min="1"
                        step="1"
                        inputMode="numeric"
                        disabled={disabled}
                    />
                </Field>
            ) : null}
            <div className="grid grid-cols-2 gap-2.5">
                <Field label="Descuento (MXN)">
                    <NumberInput value={discount} onChange={(e) => onDiscount(e.target.value)} min="0" disabled={disabled} />
                </Field>
                <Field label="Propina (MXN)">
                    <NumberInput value={tip} onChange={(e) => onTip(e.target.value)} min="0" disabled={disabled} />
                </Field>
            </div>
            <Field label="Notas (opcional)">
                <TextInput value={notes} onChange={(e) => onNotes(e.target.value)} placeholder="Ej. Pidió cita para la próxima semana" disabled={disabled} />
            </Field>
        </>
    );
}

function BarberSelect({ barbers, value, onChange, disabled }) {
    if (barbers.length === 0) return null;
    return (
        <Field label="Barbero">
            <select
                value={value}
                onChange={onChange}
                disabled={disabled}
                className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <option value="">Sin asignar</option>
                {barbers.map((b) => (
                    <option key={b.id} value={b.id}>
                        {b.name}
                    </option>
                ))}
            </select>
        </Field>
    );
}

function CustomerSelect({ customers, value, onChange, disabled }) {
    return (
        <Field label="Cliente">
            <select
                value={value}
                onChange={onChange}
                disabled={disabled}
                className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <option value="">Sin especificar</option>
                {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name} · {c.phone}
                    </option>
                ))}
            </select>
        </Field>
    );
}

function CreateSaleForm({ products, services, barbers, customers, canSellProducts, canSellServices, activeMethods, brandStyle, isPending, error, onSave, onCancel }) {
    const [kind, setKind] = useState(canSellProducts ? "product" : "service");
    const [productId, setProductId] = useState(products[0]?.id ?? "");
    const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
    const [quantity, setQuantity] = useState("1");
    const [discount, setDiscount] = useState("0");
    const [tip, setTip] = useState("0");
    const [notes, setNotes] = useState("");
    const [barberId, setBarberId] = useState("");
    const [customerId, setCustomerId] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
    const [paymentStatus, setPaymentStatus] = useState("PAGADO");
    const [amountPaid, setAmountPaid] = useState("0");
    const [when, setWhen] = useState(() => toDatetimeLocalValue(new Date()));

    const unitPrice = kind === "product" ? products.find((p) => p.id === productId)?.priceCents ?? 0 : services.find((s) => s.id === serviceId)?.priceCents ?? 0;
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const subtotal = unitPrice * qty;
    const netTotal = Math.max(0, subtotal - Math.round(parseFloat(discount || "0") * 100) + Math.round(parseFloat(tip || "0") * 100));

    return (
        <>
            <div className="flex flex-col gap-3.5">
                {canSellProducts && canSellServices ? (
                    <div className="grid grid-cols-2 gap-2.5">
                        <button
                            onClick={() => setKind("product")}
                            className={`flex h-9 items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${kind === "product" ? "border-amber-500/70 bg-amber-500/10 text-amber-400" : "border-zinc-700/80 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800"}`}
                        >
                            Producto
                        </button>
                        <button
                            onClick={() => setKind("service")}
                            className={`flex h-9 items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${kind === "service" ? "border-amber-500/70 bg-amber-500/10 text-amber-400" : "border-zinc-700/80 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800"}`}
                        >
                            Servicio
                        </button>
                    </div>
                ) : null}

                {kind === "product" ? (
                    <Field label="Producto">
                        <select
                            value={productId}
                            onChange={(e) => setProductId(e.target.value)}
                            className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                        >
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} · {money(p.priceCents)} (stock: {p.stock})
                                </option>
                            ))}
                        </select>
                    </Field>
                ) : (
                    <Field label="Servicio">
                        <select
                            value={serviceId}
                            onChange={(e) => setServiceId(e.target.value)}
                            className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                        >
                            {services.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name} · {money(s.priceCents)}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}

                <QuantityDiscountTipFields
                    showQuantity={kind === "product"}
                    quantity={quantity}
                    discount={discount}
                    tip={tip}
                    notes={notes}
                    onQuantity={setQuantity}
                    onDiscount={setDiscount}
                    onTip={setTip}
                    onNotes={setNotes}
                />

                <BarberSelect barbers={barbers} value={barberId} onChange={(e) => setBarberId(e.target.value)} />
                <CustomerSelect customers={customers} value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
                <Field label="Método de pago">
                    <PaymentMethodSelect value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} activeMethods={activeMethods} />
                </Field>
                <PaymentStatusFields
                    status={paymentStatus}
                    amountPaid={amountPaid}
                    netTotalCents={netTotal}
                    onStatus={setPaymentStatus}
                    onAmountPaid={setAmountPaid}
                />
                <Field label="Fecha y hora">
                    <input
                        type="datetime-local"
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                        className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                    />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2.5">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    loading={isPending}
                    disabled={kind === "product" ? !productId : !serviceId}
                    onClick={() =>
                        onSave(kind, {
                            productId: kind === "product" ? productId : undefined,
                            serviceId: kind === "service" ? serviceId : undefined,
                            quantity: qty,
                            discountCents: Math.round(parseFloat(discount || "0") * 100),
                            tipCents: Math.round(parseFloat(tip || "0") * 100),
                            notes,
                            barberId: barberId || null,
                            customerId: customerId || null,
                            paymentMethod,
                            paymentStatus,
                            amountPaidCents: Math.round(parseFloat(amountPaid || "0") * 100),
                            createdAt: localInputToISO(when),
                        })
                    }
                >
                    Registrar venta ({money(netTotal)})
                </SheetButton>
                <SheetButton variant="ghost" onClick={onCancel}>
                    Cancelar
                </SheetButton>
            </div>
        </>
    );
}

function EditSaleForm({ sale, barbers, customers, brandStyle, isPending, error, canEdit, canDelete, onSave, onCancelSale }) {
    const [name, setName] = useState(sale.name);
    const [price, setPrice] = useState(String(sale.priceCents / 100));
    const [quantity, setQuantity] = useState(String(sale.quantity ?? 1));
    const [discount, setDiscount] = useState(String((sale.discountCents ?? 0) / 100));
    const [tip, setTip] = useState(String((sale.tipCents ?? 0) / 100));
    const [notes, setNotes] = useState(sale.notes ?? "");
    const [barberId, setBarberId] = useState(sale.barberId ?? "");
    const [customerId, setCustomerId] = useState(sale.customerId ?? "");
    const [paymentStatus, setPaymentStatus] = useState(sale.paymentStatus ?? "PAGADO");
    const [amountPaid, setAmountPaid] = useState(String((sale.amountPaidCents ?? sale.priceCents) / 100));
    const [when, setWhen] = useState(() => toDatetimeLocalValue(sale.createdAt));
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const isCancelled = !!sale.cancelledAt;

    const netTotal = Math.max(
        0,
        Math.round(parseFloat(price || "0") * 100) - Math.round(parseFloat(discount || "0") * 100) + Math.round(parseFloat(tip || "0") * 100)
    );

    const editable = canEdit && !isCancelled;

    return (
        <>
            {isCancelled ? (
                <div className="mb-3 rounded-lg border border-red-800/40 bg-red-500/10 p-3">
                    <p className="text-sm font-bold text-red-300">Venta cancelada</p>
                    <p className="mt-0.5 text-[12px] text-red-200/80">
                        {shortDateTime(sale.cancelledAt)}
                        {sale.cancelledByName ? ` · por ${sale.cancelledByName}` : ""}
                    </p>
                    {sale.cancelReason ? <p className="mt-1 text-[12px] text-red-200/80">Motivo: {sale.cancelReason}</p> : null}
                </div>
            ) : null}
            <div className="flex flex-col gap-3.5">
                <Field label={sale.kind === "product" ? "Producto" : "Servicio"}>
                    <TextInput disabled={!editable} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Subtotal (MXN) · se recalcula del catálogo al guardar">
                    <NumberInput disabled value={price} min="0" />
                </Field>
                <QuantityDiscountTipFields
                    showQuantity={sale.kind === "product"}
                    quantity={quantity}
                    discount={discount}
                    tip={tip}
                    notes={notes}
                    onQuantity={setQuantity}
                    onDiscount={setDiscount}
                    onTip={setTip}
                    onNotes={setNotes}
                    disabled={!editable}
                />
                <BarberSelect barbers={barbers} value={barberId} onChange={(e) => setBarberId(e.target.value)} disabled={!editable} />
                <CustomerSelect customers={customers} value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!editable} />
                <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Método de pago</p>
                    <div className="flex min-h-11 items-center rounded-lg border border-zinc-700/80 bg-zinc-800/30 px-3.5 text-[15px] text-zinc-400">
                        {PAYMENT_METHOD_LABELS[sale.paymentMethod ?? "EFECTIVO"]}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                        No se puede cambiar después de cobrar. Si te equivocaste, cancela la venta y regístrala de nuevo.
                    </p>
                </div>
                <PaymentStatusFields
                    status={paymentStatus}
                    amountPaid={amountPaid}
                    netTotalCents={netTotal}
                    onStatus={setPaymentStatus}
                    onAmountPaid={setAmountPaid}
                    disabled={!editable}
                />
                <Field label="Fecha y hora">
                    <input
                        type="datetime-local"
                        disabled={!editable}
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                        className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            {isCancelled ? null : (
                <div className="mt-4 flex flex-col gap-2.5">
                    {canEdit ? (
                        <SheetButton
                            variant="brand"
                            style={brandStyle}
                            loading={isPending}
                            onClick={() =>
                                onSave({
                                    name,
                                    quantity: Math.max(1, parseInt(quantity, 10) || 1),
                                    discountCents: Math.round(parseFloat(discount || "0") * 100),
                                    tipCents: Math.round(parseFloat(tip || "0") * 100),
                                    notes,
                                    barberId: barberId || null,
                                    customerId: customerId || null,
                                    paymentStatus,
                                    amountPaidCents: Math.round(parseFloat(amountPaid || "0") * 100),
                                    createdAt: localInputToISO(when),
                                })
                            }
                        >
                            Guardar cambios
                        </SheetButton>
                    ) : null}
                    {canDelete ? (
                        confirmCancel ? (
                            <div className="flex flex-col gap-2.5 rounded-lg border border-red-900/40 p-3">
                                <p className="text-xs text-zinc-400">
                                    La venta no se borra: queda registrada como cancelada y deja de contar para ingresos y caja.
                                    {sale.kind === "product" ? " El producto regresa al inventario." : ""}
                                </p>
                                <Field label="Motivo (opcional)">
                                    <TextInput
                                        value={cancelReason}
                                        onChange={(e) => setCancelReason(e.target.value)}
                                        placeholder="Ej. Se registró dos veces por error"
                                    />
                                </Field>
                                <SheetButton variant="danger" loading={isPending} onClick={() => onCancelSale({ reason: cancelReason })}>
                                    Confirmar cancelación
                                </SheetButton>
                                <SheetButton variant="ghost" onClick={() => setConfirmCancel(false)}>
                                    Volver
                                </SheetButton>
                            </div>
                        ) : (
                            <SheetButton variant="danger" loading={isPending} onClick={() => setConfirmCancel(true)}>
                                Cancelar venta
                            </SheetButton>
                        )
                    ) : null}
                </div>
            )}
        </>
    );
}

export default function SalesPanel({ products, services, sales: initialSales, barbers = [], customers = [], activeMethods = [], slug, brandColor, perms, openCreateSignal }) {
    const [sales, setSales] = useState(initialSales);
    // La lista se pide completa (del rango de fechas), pero se renderiza de a poco — con un
    // negocio movido, 30 días pueden ser cientos de filas de un jalón, lo cual se siente
    // amontonado y va a ir más lento con el tiempo. "Cargar más" es el mismo patrón que ya
    // usa Clientes.
    const [visibleCount, setVisibleCount] = useState(20);
    const [fromDate, setFromDate] = useState(startOf30DaysAgo);
    const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
    const [createOpen, setCreateOpen] = useState(false);

    // Atajo de teclado F4 (ver TenantBoard.js): abre "Registrar venta" si hay permiso.
    // Patrón "ajustar estado durante el render" en vez de un efecto (ver BookingsPanel.js).
    const [seenCreateSignal, setSeenCreateSignal] = useState(openCreateSignal);
    if (openCreateSignal !== seenCreateSignal) {
        setSeenCreateSignal(openCreateSignal);
        if (openCreateSignal && (perms.productos.canAdd || perms.servicios.canAdd)) setCreateOpen(true);
    }
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    useGlobalPending(isPending);

    const activeProducts = products.filter((p) => p.active);
    const activeServices = services.filter((s) => s.active);
    const activeBarbers = barbers.filter((b) => b.active);
    const editing = sales.find((s) => s.id === editingId) ?? null;
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };
    const canAdd = perms.productos.canAdd || perms.servicios.canAdd;

    const range = () => ({ from: `${fromDate}T00:00:00`, to: `${toDate}T23:59:59` });
    const showToast = useToast();

    const run = (fn, onDone, successMessage) => {
        setError("");
        startTransition(async () => {
            try {
                await fn();
                setSales(await getSalesForRange(slug, range()));
                setVisibleCount(20);
                onDone?.();
                if (successMessage) showToast(successMessage);
            } catch (err) {
                setError(friendlyError(err));
            }
        });
    };

    const filter = () => run(() => Promise.resolve());

    const exportCSV = () => {
        setError("");
        startTransition(async () => {
            try {
                const csv = await exportSalesCSV(slug, range());
                downloadCSV(csv, `ventas_${fromDate}_a_${toDate}.csv`);
            } catch (err) {
                setError(err?.message ?? "No se pudo exportar el CSV.");
            }
        });
    };

    const create = (kind, data) => {
        const action = kind === "product" ? registerProductSale : registerServiceSale;
        run(() => action(slug, data), () => setCreateOpen(false), "Venta registrada");
    };

    const save = (data) => {
        const action = editing.kind === "product" ? updateProductSale : updateServiceSale;
        run(() => action(editing.id, slug, data), null, "Cambios guardados");
    };

    const cancelSale = ({ reason }) => {
        const action = editing.kind === "product" ? cancelProductSale : cancelServiceSale;
        run(() => action(editing.id, slug, { reason }), () => setEditingId(null), "Venta cancelada");
    };

    return (
        <div>
            <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Ventas</p>
                {canAdd ? (
                    <button
                        onClick={() => {
                            setError("");
                            setCreateOpen(true);
                        }}
                        style={brandStyle}
                        className="flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-bold transition-transform active:scale-95"
                    >
                        + Agregar
                    </button>
                ) : null}
            </div>

            <DateRangeBar from={fromDate} to={toDate} onFrom={setFromDate} onTo={setToDate} onFilter={filter} onExport={exportCSV} isPending={isPending} />

            <div className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 shadow-[var(--shadow-panel)]">
                {sales.slice(0, visibleCount).map((s) => {
                    const statusMeta = PAYMENT_STATUS_META[s.paymentStatus ?? "PAGADO"];
                    const cancelled = !!s.cancelledAt;
                    return (
                        <button
                            key={s.id}
                            onClick={() => {
                                setError("");
                                setEditingId(s.id);
                            }}
                            className="flex w-full items-center justify-between gap-2 border-b border-white/10 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-zinc-800/30 active:bg-zinc-800/40"
                        >
                            <div className="min-w-0">
                                <p className={`truncate font-semibold ${cancelled ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                                    {s.folio ? <span className="text-zinc-500">#{s.folio} · </span> : null}
                                    {s.name}
                                    {s.quantity > 1 ? ` x${s.quantity}` : ""}
                                    <span className="ml-1.5 rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">
                                        {s.kind === "product" ? "producto" : "servicio"}
                                    </span>
                                </p>
                                <p className="text-[11.5px] text-zinc-500">
                                    {shortDateTime(s.createdAt)} · {PAYMENT_METHOD_LABELS[s.paymentMethod ?? "EFECTIVO"]}
                                    {s.barber ? ` · ${s.barber.name}` : ""}
                                    {s.customer ? ` · ${s.customer.name}` : ""}
                                    {s.tipCents > 0 ? ` · propina ${money(s.tipCents)}` : ""}
                                </p>
                                {cancelled ? (
                                    <div className="mt-1.5">
                                        <Badge tone="bad">Cancelada{s.cancelledByName ? ` · ${s.cancelledByName}` : ""}</Badge>
                                    </div>
                                ) : statusMeta.label !== "Pagado" ? (
                                    <div className="mt-1.5">
                                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                                    </div>
                                ) : null}
                            </div>
                            <span className={`font-numeric shrink-0 font-bold ${cancelled ? "text-zinc-600 line-through" : "text-emerald-400"}`}>
                                {cancelled ? "" : "+"}
                                {money(s.priceCents - (s.discountCents ?? 0) + (s.tipCents ?? 0))}
                            </span>
                        </button>
                    );
                })}
                {sales.length === 0 ? (
                    <div className="my-3 rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                        Sin ventas registradas todavía.
                    </div>
                ) : null}
            </div>
            {sales.length > visibleCount ? (
                <button
                    onClick={() => setVisibleCount((n) => n + 20)}
                    className="mt-2.5 flex min-h-11 w-full items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-sm font-semibold text-zinc-300 hover:bg-zinc-800/60"
                >
                    Cargar más ({sales.length - visibleCount} restantes)
                </button>
            ) : null}

            {canAdd ? (
                <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Registrar venta">
                    {createOpen ? (
                        <CreateSaleForm
                            products={activeProducts}
                            services={activeServices}
                            barbers={activeBarbers}
                            customers={customers}
                            canSellProducts={perms.productos.canAdd && activeProducts.length > 0}
                            canSellServices={perms.servicios.canAdd && activeServices.length > 0}
                            activeMethods={activeMethods}
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setCreateOpen(false)}
                            onSave={create}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}

            <BottomSheet open={!!editing} onClose={() => setEditingId(null)} title={editing?.name}>
                {editing ? (
                    <EditSaleForm
                        key={editing.id}
                        sale={editing}
                        barbers={activeBarbers}
                        customers={customers}
                        brandStyle={brandStyle}
                        isPending={isPending}
                        error={error}
                        canEdit={editing.kind === "product" ? perms.productos.canEdit : perms.servicios.canEdit}
                        canDelete={editing.kind === "product" ? perms.productos.canDelete : perms.servicios.canDelete}
                        onSave={save}
                        onCancelSale={cancelSale}
                    />
                ) : null}
            </BottomSheet>
        </div>
    );
}
