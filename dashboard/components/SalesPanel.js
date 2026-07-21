"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import DateRangeBar from "@/components/DateRangeBar";
import Badge from "@/components/Badge";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { money, shortDateTime, toDatetimeLocalValue, toDateInputValue, contrastText } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META } from "@/lib/payments";
import { downloadCSV } from "@/lib/csv";
import {
    registerProductSale,
    updateProductSale,
    deleteProductSale,
    registerServiceSale,
    updateServiceSale,
    deleteServiceSale,
    getSalesForRange,
    exportSalesCSV,
} from "@/app/t/[slug]/sales-actions";

const startOf30DaysAgo = () => toDateInputValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

function PaymentMethodSelect({ value, onChange, disabled }) {
    return (
        <select
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none disabled:opacity-50"
        >
            {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
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
                    className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none disabled:opacity-50"
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
                    <NumberInput value={quantity} onChange={(e) => onQuantity(e.target.value)} min="1" disabled={disabled} />
                </Field>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
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
                className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none disabled:opacity-50"
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
                className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none disabled:opacity-50"
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

function CreateSaleForm({ products, services, barbers, customers, canSellProducts, canSellServices, brandStyle, isPending, error, onSave, onCancel }) {
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
            <div className="flex flex-col gap-3">
                {canSellProducts && canSellServices ? (
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setKind("product")}
                            className={`flex h-9 items-center justify-center rounded-md border text-sm font-semibold ${kind === "product" ? "border-amber-500 text-amber-400" : "border-zinc-700 text-zinc-400"}`}
                        >
                            Producto
                        </button>
                        <button
                            onClick={() => setKind("service")}
                            className={`flex h-9 items-center justify-center rounded-md border text-sm font-semibold ${kind === "service" ? "border-amber-500 text-amber-400" : "border-zinc-700 text-zinc-400"}`}
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
                            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none"
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
                            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none"
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
                    <PaymentMethodSelect value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
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
                        className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none"
                    />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    disabled={isPending || (kind === "product" ? !productId : !serviceId)}
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
                            createdAt: when,
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

function EditSaleForm({ sale, barbers, customers, brandStyle, isPending, error, canEdit, canDelete, onSave, onDelete }) {
    const [name, setName] = useState(sale.name);
    const [price, setPrice] = useState(String(sale.priceCents / 100));
    const [quantity, setQuantity] = useState(String(sale.quantity ?? 1));
    const [discount, setDiscount] = useState(String((sale.discountCents ?? 0) / 100));
    const [tip, setTip] = useState(String((sale.tipCents ?? 0) / 100));
    const [notes, setNotes] = useState(sale.notes ?? "");
    const [barberId, setBarberId] = useState(sale.barberId ?? "");
    const [customerId, setCustomerId] = useState(sale.customerId ?? "");
    const [paymentMethod, setPaymentMethod] = useState(sale.paymentMethod ?? "EFECTIVO");
    const [paymentStatus, setPaymentStatus] = useState(sale.paymentStatus ?? "PAGADO");
    const [amountPaid, setAmountPaid] = useState(String((sale.amountPaidCents ?? sale.priceCents) / 100));
    const [when, setWhen] = useState(() => toDatetimeLocalValue(sale.createdAt));

    const netTotal = Math.max(
        0,
        Math.round(parseFloat(price || "0") * 100) - Math.round(parseFloat(discount || "0") * 100) + Math.round(parseFloat(tip || "0") * 100)
    );

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label={sale.kind === "product" ? "Producto" : "Servicio"}>
                    <TextInput disabled={!canEdit} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Subtotal (MXN)">
                    <NumberInput disabled={!canEdit} value={price} onChange={(e) => setPrice(e.target.value)} min="0" />
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
                    disabled={!canEdit}
                />
                <BarberSelect barbers={barbers} value={barberId} onChange={(e) => setBarberId(e.target.value)} disabled={!canEdit} />
                <CustomerSelect customers={customers} value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!canEdit} />
                <Field label="Método de pago">
                    <PaymentMethodSelect value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={!canEdit} />
                </Field>
                <PaymentStatusFields
                    status={paymentStatus}
                    amountPaid={amountPaid}
                    netTotalCents={netTotal}
                    onStatus={setPaymentStatus}
                    onAmountPaid={setAmountPaid}
                    disabled={!canEdit}
                />
                <Field label="Fecha y hora">
                    <input
                        type="datetime-local"
                        disabled={!canEdit}
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                        className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                    />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            {canEdit || canDelete ? (
                <div className="mt-4 flex flex-col gap-2">
                    {canEdit ? (
                        <SheetButton
                            variant="brand"
                            style={brandStyle}
                            disabled={isPending}
                            onClick={() =>
                                onSave({
                                    name,
                                    priceCents: Math.round(parseFloat(price || "0") * 100),
                                    quantity: Math.max(1, parseInt(quantity, 10) || 1),
                                    discountCents: Math.round(parseFloat(discount || "0") * 100),
                                    tipCents: Math.round(parseFloat(tip || "0") * 100),
                                    notes,
                                    barberId: barberId || null,
                                    customerId: customerId || null,
                                    paymentMethod,
                                    paymentStatus,
                                    amountPaidCents: Math.round(parseFloat(amountPaid || "0") * 100),
                                    createdAt: when,
                                })
                            }
                        >
                            Guardar cambios
                        </SheetButton>
                    ) : null}
                    {canDelete ? (
                        <SheetButton variant="danger" disabled={isPending} onClick={onDelete}>
                            Eliminar
                        </SheetButton>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}

export default function SalesPanel({ products, services, sales: initialSales, barbers = [], customers = [], slug, brandColor, perms }) {
    const [sales, setSales] = useState(initialSales);
    const [fromDate, setFromDate] = useState(startOf30DaysAgo);
    const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();

    const activeProducts = products.filter((p) => p.active);
    const activeServices = services.filter((s) => s.active);
    const activeBarbers = barbers.filter((b) => b.active);
    const editing = sales.find((s) => s.id === editingId) ?? null;
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };
    const canAdd = perms.productos.canAdd || perms.servicios.canAdd;

    const range = () => ({ from: `${fromDate}T00:00:00`, to: `${toDate}T23:59:59` });

    const run = (fn, onDone) => {
        setError("");
        startTransition(async () => {
            try {
                await fn();
                setSales(await getSalesForRange(slug, range()));
                onDone?.();
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
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
        run(() => action(slug, data), () => setCreateOpen(false));
    };

    const save = (data) => {
        const action = editing.kind === "product" ? updateProductSale : updateServiceSale;
        run(() => action(editing.id, slug, data));
    };

    const remove = () => {
        const action = editing.kind === "product" ? deleteProductSale : deleteServiceSale;
        run(() => action(editing.id, slug), () => setEditingId(null));
    };

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Ventas</p>
                {canAdd ? (
                    <button
                        onClick={() => {
                            setError("");
                            setCreateOpen(true);
                        }}
                        style={brandStyle}
                        className="flex h-8 items-center gap-1 rounded-md px-3 text-xs font-bold"
                    >
                        + Agregar
                    </button>
                ) : null}
            </div>

            <DateRangeBar from={fromDate} to={toDate} onFrom={setFromDate} onTo={setToDate} onFilter={filter} onExport={exportCSV} isPending={isPending} />

            <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3.5">
                {sales.map((s) => {
                    const statusMeta = PAYMENT_STATUS_META[s.paymentStatus ?? "PAGADO"];
                    return (
                        <button
                            key={s.id}
                            onClick={() => {
                                setError("");
                                setEditingId(s.id);
                            }}
                            className="flex w-full items-center justify-between gap-2 border-b border-zinc-800 py-2.5 text-left text-sm last:border-b-0"
                        >
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-zinc-100">
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
                                {statusMeta.label !== "Pagado" ? (
                                    <div className="mt-1">
                                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                                    </div>
                                ) : null}
                            </div>
                            <span className="font-numeric shrink-0 font-bold text-emerald-400">
                                +{money(s.priceCents - (s.discountCents ?? 0) + (s.tipCents ?? 0))}
                            </span>
                        </button>
                    );
                })}
                {sales.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Sin ventas registradas todavía.</p> : null}
            </div>

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
                        onDelete={remove}
                    />
                ) : null}
            </BottomSheet>
        </div>
    );
}
