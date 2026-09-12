"use client";
import { useGlobalPending } from "@/components/GlobalLoading";
import { friendlyError } from "@/lib/errors";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import DateRangeBar from "@/components/DateRangeBar";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { money, shortDateTime, toDatetimeLocalValue, toDateInputValue, contrastText } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, visiblePaymentMethods } from "@/lib/payments";
import { downloadCSV } from "@/lib/csv";
import { useToast } from "@/components/Toast";
import { EXPENSE_CATEGORY_META } from "@/lib/finance";
import { createExpense, updateExpense, deleteExpense, getExpensesForRange, exportExpensesCSV } from "@/app/t/[slug]/finance-actions";

const emptyForm = { category: "INSUMOS", description: "", amount: "", productId: "", quantity: "1", paymentMethod: "EFECTIVO" };

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
const startOf30DaysAgo = () => toDateInputValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

function CategorySelect({ value, onChange, disabled }) {
    return (
        <select
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {Object.entries(EXPENSE_CATEGORY_META).map(([key, meta]) => (
                <option key={key} value={key}>
                    {meta.label}
                </option>
            ))}
        </select>
    );
}

function VendorFields({ vendor, receiptNumber, isRecurring, paidByName, onVendor, onReceiptNumber, onIsRecurring, onPaidByName, disabled }) {
    return (
        <>
            <div className="grid grid-cols-2 gap-2.5">
                <Field label="Proveedor (opcional)">
                    <TextInput disabled={disabled} value={vendor} onChange={(e) => onVendor(e.target.value)} placeholder="Ej. CFE" />
                </Field>
                <Field label="Folio/factura (opcional)">
                    <TextInput disabled={disabled} value={receiptNumber} onChange={(e) => onReceiptNumber(e.target.value)} placeholder="Ej. A-1234" />
                </Field>
            </div>
            <Field label="¿Quién lo pagó? (opcional)">
                <TextInput disabled={disabled} value={paidByName} onChange={(e) => onPaidByName(e.target.value)} placeholder="Ej. Gerente" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                    type="checkbox"
                    disabled={disabled}
                    checked={isRecurring}
                    onChange={(e) => onIsRecurring(e.target.checked)}
                    className="h-4 w-4 rounded-sm border-zinc-600 bg-zinc-800"
                />
                Gasto recurrente (ej. renta, nómina)
            </label>
        </>
    );
}

function ProductPurchaseFields({ products, productId, quantity, onProductId, onQuantity, disabled }) {
    if (products.length === 0) return null;
    return (
        <>
            <Field label="¿Es una compra de stock? (opcional)">
                <select
                    value={productId}
                    onChange={(e) => onProductId(e.target.value)}
                    disabled={disabled}
                    className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <option value="">No, es un gasto normal</option>
                    {products.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name} (stock actual: {p.stock})
                        </option>
                    ))}
                </select>
            </Field>
            {productId ? (
                <Field label="Cantidad comprada (se suma al stock)">
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
        </>
    );
}

function CreateExpenseForm({ products, activeMethods, brandStyle, isPending, error, onSave, onCancel }) {
    const [form, setForm] = useState(emptyForm);
    const [vendor, setVendor] = useState("");
    const [receiptNumber, setReceiptNumber] = useState("");
    const [isRecurring, setIsRecurring] = useState(false);
    const [paidByName, setPaidByName] = useState("");
    const [when, setWhen] = useState(() => toDatetimeLocalValue(new Date()));

    return (
        <>
            <div className="flex flex-col gap-3.5">
                <ProductPurchaseFields
                    products={products}
                    productId={form.productId}
                    quantity={form.quantity}
                    onProductId={(v) =>
                        setForm((f) => ({
                            ...f,
                            productId: v,
                            category: v ? "INSUMOS" : f.category,
                            description: v && !f.description ? `Compra: ${products.find((p) => p.id === v)?.name}` : f.description,
                        }))
                    }
                    onQuantity={(v) => setForm((f) => ({ ...f, quantity: v }))}
                />
                <Field label="Categoría">
                    <CategorySelect value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
                </Field>
                <Field label="Descripción">
                    <TextInput value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ej. Renta de julio" />
                </Field>
                <Field label="Monto total (MXN)">
                    <NumberInput value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} min="0" />
                </Field>
                <Field label="Método de pago">
                    <PaymentMethodSelect
                        value={form.paymentMethod}
                        onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                        activeMethods={activeMethods}
                    />
                </Field>
                <VendorFields
                    vendor={vendor}
                    receiptNumber={receiptNumber}
                    isRecurring={isRecurring}
                    paidByName={paidByName}
                    onVendor={setVendor}
                    onReceiptNumber={setReceiptNumber}
                    onIsRecurring={setIsRecurring}
                    onPaidByName={setPaidByName}
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
                    onClick={() =>
                        onSave({
                            category: form.category,
                            description: form.description,
                            amountCents: Math.round(parseFloat(form.amount || "0") * 100),
                            productId: form.productId || null,
                            quantity: form.productId ? parseInt(form.quantity || "1", 10) : null,
                            paymentMethod: form.paymentMethod,
                            vendor,
                            receiptNumber,
                            isRecurring,
                            paidByName,
                            createdAt: when,
                        })
                    }
                >
                    Guardar gasto
                </SheetButton>
                <SheetButton variant="ghost" onClick={onCancel}>
                    Cancelar
                </SheetButton>
            </div>
        </>
    );
}

function EditExpenseForm({ expense, products, activeMethods, brandStyle, isPending, error, canEdit, canDelete, onSave, onDelete }) {
    const [category, setCategory] = useState(expense.category);
    const [description, setDescription] = useState(expense.description);
    const [amount, setAmount] = useState(String(expense.amountCents / 100));
    const [productId, setProductId] = useState(expense.productId ?? "");
    const [quantity, setQuantity] = useState(String(expense.quantity ?? 1));
    const [paymentMethod, setPaymentMethod] = useState(expense.paymentMethod ?? "EFECTIVO");
    const [vendor, setVendor] = useState(expense.vendor ?? "");
    const [receiptNumber, setReceiptNumber] = useState(expense.receiptNumber ?? "");
    const [isRecurring, setIsRecurring] = useState(expense.isRecurring ?? false);
    const [paidByName, setPaidByName] = useState(expense.paidByName ?? "");
    const [when, setWhen] = useState(() => toDatetimeLocalValue(expense.createdAt));

    return (
        <>
            <div className="flex flex-col gap-3.5">
                <ProductPurchaseFields
                    products={products}
                    productId={productId}
                    quantity={quantity}
                    onProductId={setProductId}
                    onQuantity={setQuantity}
                    disabled={!canEdit}
                />
                <Field label="Categoría">
                    <CategorySelect value={category} onChange={(e) => setCategory(e.target.value)} disabled={!canEdit} />
                </Field>
                <Field label="Descripción">
                    <TextInput disabled={!canEdit} value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field>
                <Field label="Monto total (MXN)">
                    <NumberInput disabled={!canEdit} value={amount} onChange={(e) => setAmount(e.target.value)} min="0" />
                </Field>
                <Field label="Método de pago">
                    <PaymentMethodSelect
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        disabled={!canEdit}
                        activeMethods={activeMethods}
                    />
                </Field>
                <VendorFields
                    vendor={vendor}
                    receiptNumber={receiptNumber}
                    isRecurring={isRecurring}
                    paidByName={paidByName}
                    onVendor={setVendor}
                    onReceiptNumber={setReceiptNumber}
                    onIsRecurring={setIsRecurring}
                    onPaidByName={setPaidByName}
                    disabled={!canEdit}
                />
                <Field label="Fecha y hora">
                    <input
                        type="datetime-local"
                        disabled={!canEdit}
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                        className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            {canEdit || canDelete ? (
                <div className="mt-4 flex flex-col gap-2.5">
                    {canEdit ? (
                        <SheetButton
                            variant="brand"
                            style={brandStyle}
                            loading={isPending}
                            onClick={() =>
                                onSave({
                                    category,
                                    description,
                                    amountCents: Math.round(parseFloat(amount || "0") * 100),
                                    productId: productId || null,
                                    quantity: productId ? parseInt(quantity || "1", 10) : null,
                                    paymentMethod,
                                    vendor,
                                    receiptNumber,
                                    isRecurring,
                                    paidByName,
                                    createdAt: when,
                                })
                            }
                        >
                            Guardar cambios
                        </SheetButton>
                    ) : null}
                    {canDelete ? (
                        <SheetButton variant="danger" loading={isPending} onClick={onDelete}>
                            Eliminar
                        </SheetButton>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}

export default function ExpenseList({ expenses: initialExpenses, products = [], activeMethods = [], slug, brandColor, perms }) {
    const [expenses, setExpenses] = useState(initialExpenses);
    const [visibleCount, setVisibleCount] = useState(20);
    const [fromDate, setFromDate] = useState(startOf30DaysAgo);
    const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    useGlobalPending(isPending);
    const editing = expenses.find((e) => e.id === editingId) ?? null;
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };
    const showToast = useToast();

    const range = () => ({ from: `${fromDate}T00:00:00`, to: `${toDate}T23:59:59` });

    const run = (fn, onDone, successMessage) => {
        setError("");
        startTransition(async () => {
            try {
                await fn();
                setExpenses(await getExpensesForRange(slug, range()));
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
                const csv = await exportExpensesCSV(slug, range());
                downloadCSV(csv, `gastos_${fromDate}_a_${toDate}.csv`);
            } catch (err) {
                setError(err?.message ?? "No se pudo exportar el CSV.");
            }
        });
    };

    return (
        <div>
            <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Gastos</p>
                {perms.canAdd ? (
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
                {expenses.slice(0, visibleCount).map((e) => (
                    <button
                        key={e.id}
                        onClick={() => {
                            setError("");
                            setEditingId(e.id);
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-white/10 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-zinc-800/30 active:bg-zinc-800/40"
                    >
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-zinc-100">
                                {e.folio ? <span className="text-zinc-500">#{e.folio} · </span> : null}
                                {e.description}
                                {e.isRecurring ? (
                                    <span className="ml-1.5 rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">recurrente</span>
                                ) : null}
                            </p>
                            <p className="text-[11.5px] text-zinc-500">
                                {EXPENSE_CATEGORY_META[e.category].label} · {shortDateTime(e.createdAt)} · {PAYMENT_METHOD_LABELS[e.paymentMethod ?? "EFECTIVO"]}
                                {e.product ? ` · +${e.quantity} ${e.product.name} a stock` : ""}
                                {e.vendor ? ` · ${e.vendor}` : ""}
                            </p>
                        </div>
                        <span className="font-numeric shrink-0 font-bold text-red-400">-{money(e.amountCents)}</span>
                    </button>
                ))}
                {expenses.length === 0 ? (
                    <div className="my-3 rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                        Sin gastos registrados.
                    </div>
                ) : null}
            </div>
            {expenses.length > visibleCount ? (
                <button
                    onClick={() => setVisibleCount((n) => n + 20)}
                    className="mt-2.5 flex min-h-11 w-full items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-sm font-semibold text-zinc-300 hover:bg-zinc-800/60"
                >
                    Cargar más ({expenses.length - visibleCount} restantes)
                </button>
            ) : null}

            {perms.canAdd ? (
                <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Registrar gasto">
                    {createOpen ? (
                        <CreateExpenseForm
                            products={products}
                            activeMethods={activeMethods}
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setCreateOpen(false)}
                            onSave={(data) => run(() => createExpense(slug, data), () => setCreateOpen(false), "Gasto registrado")}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}

            <BottomSheet open={!!editing} onClose={() => setEditingId(null)} title={editing?.description}>
                {editing ? (
                    <EditExpenseForm
                        key={editing.id}
                        expense={editing}
                        products={products}
                        activeMethods={activeMethods}
                        brandStyle={brandStyle}
                        isPending={isPending}
                        error={error}
                        canEdit={perms.canEdit}
                        canDelete={perms.canDelete}
                        onSave={(data) => run(() => updateExpense(editing.id, slug, data), null, "Cambios guardados")}
                        onDelete={() => run(() => deleteExpense(editing.id, slug), () => setEditingId(null), "Gasto eliminado")}
                    />
                ) : null}
            </BottomSheet>
        </div>
    );
}
