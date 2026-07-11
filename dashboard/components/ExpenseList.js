"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { money, shortDate, contrastText } from "@/lib/format";
import { EXPENSE_CATEGORY_META } from "@/lib/finance";
import { createExpense, deleteExpense } from "@/app/t/[slug]/finance-actions";

const emptyForm = { category: "INSUMOS", description: "", amount: "" };

export default function ExpenseList({ expenses, slug, brandColor, perms }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };

    const submit = () => {
        setError("");
        startTransition(async () => {
            try {
                await createExpense(slug, { category: form.category, description: form.description, amountCents: Math.round(parseFloat(form.amount || "0") * 100) });
                setOpen(false);
                setForm(emptyForm);
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
            }
        });
    };

    const remove = (id) => startTransition(() => deleteExpense(id, slug));

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Gastos recientes</p>
                {perms.canAdd ? (
                    <button onClick={() => setOpen(true)} style={brandStyle} className="flex h-8 items-center gap-1 rounded-md px-3 text-xs font-bold">
                        + Registrar gasto
                    </button>
                ) : null}
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3.5">
                {expenses.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 border-b border-zinc-800 py-2.5 text-sm last:border-b-0">
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-zinc-100">{e.description}</p>
                            <p className="text-[11.5px] text-zinc-500">
                                {EXPENSE_CATEGORY_META[e.category].label} · {shortDate(e.createdAt)}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="font-numeric font-bold text-red-400">-{money(e.amountCents)}</span>
                            {perms.canDelete ? (
                                <button onClick={() => remove(e.id)} disabled={isPending} className="text-xs text-zinc-600 underline disabled:opacity-50">
                                    borrar
                                </button>
                            ) : null}
                        </div>
                    </div>
                ))}
                {expenses.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Sin gastos registrados.</p> : null}
            </div>

            <BottomSheet open={open} onClose={() => setOpen(false)} title="Registrar gasto">
                <div className="flex flex-col gap-3">
                    <Field label="Categoría">
                        <select
                            value={form.category}
                            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none"
                        >
                            {Object.entries(EXPENSE_CATEGORY_META).map(([key, meta]) => (
                                <option key={key} value={key}>
                                    {meta.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Descripción">
                        <TextInput value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ej. Renta de julio" />
                    </Field>
                    <Field label="Monto (MXN)">
                        <NumberInput value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} min="0" />
                    </Field>
                </div>
                {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
                <div className="mt-4 flex flex-col gap-2">
                    <SheetButton variant="brand" style={brandStyle} disabled={isPending} onClick={submit}>
                        Guardar gasto
                    </SheetButton>
                    <SheetButton variant="ghost" onClick={() => setOpen(false)}>
                        Cancelar
                    </SheetButton>
                </div>
            </BottomSheet>
        </div>
    );
}
