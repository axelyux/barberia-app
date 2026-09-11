"use client";

import { useState, useTransition } from "react";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { money, shortDateTime, contrastText } from "@/lib/format";
import { closeShift } from "@/app/t/[slug]/shift-actions";

export default function CashShiftPanel({ openShift, shiftHistory, slug, brandColor, canClose }) {
    const [closingCash, setClosingCash] = useState("0");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };

    const doClose = () => {
        setError("");
        startTransition(async () => {
            try {
                await closeShift(slug, { closingCashCents: Math.round(parseFloat(closingCash || "0") * 100), notes });
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Turno actual</p>
            <div className="rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-[var(--shadow-panel)]">
                <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-zinc-100">{openShift.shiftType?.name ?? "Sin turno asignado"}</span>
                    <span className="text-xs text-zinc-500">Abrió {openShift.openedByName}</span>
                </div>
                <div className="mt-2 flex justify-between text-xs text-zinc-400">
                    <span>Entrada</span>
                    <b className="font-numeric text-zinc-200">{shortDateTime(openShift.startedAt)}</b>
                </div>
                <div className="flex justify-between text-xs text-zinc-400">
                    <span>Fondo inicial (efectivo)</span>
                    <b className="font-numeric text-zinc-200">{money(openShift.openingCashCents)}</b>
                </div>
            </div>

            {canClose ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-[var(--shadow-panel)]">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Cerrar turno</p>
                    <div className="flex flex-col gap-3">
                        <Field label="Efectivo contado en caja (MXN)">
                            <NumberInput value={closingCash} onChange={(e) => setClosingCash(e.target.value)} min="0" />
                        </Field>
                        <Field label="Notas (opcional)">
                            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Faltaron $50" />
                        </Field>
                    </div>
                    {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
                    <div className="mt-3">
                        <SheetButton variant="brand" style={brandStyle} loading={isPending} onClick={doClose}>
                            Cerrar turno (salida)
                        </SheetButton>
                    </div>
                </div>
            ) : null}

            <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Turnos anteriores</p>
            <div className="rounded-xl border border-white/10 bg-zinc-900 px-4 shadow-[var(--shadow-panel)]">
                {shiftHistory.map((s) => (
                    <div key={s.id} className="border-b border-white/10 py-3 text-sm last:border-b-0">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-zinc-100">{s.shiftType?.name ?? "Sin turno"}</span>
                            <span
                                className={`font-numeric text-xs font-bold ${
                                    (s.cashDifferenceCents ?? 0) === 0 ? "text-zinc-400" : (s.cashDifferenceCents ?? 0) > 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                            >
                                {(s.cashDifferenceCents ?? 0) === 0
                                    ? "Cuadró"
                                    : (s.cashDifferenceCents ?? 0) > 0
                                      ? `Sobró ${money(s.cashDifferenceCents)}`
                                      : `Faltó ${money(Math.abs(s.cashDifferenceCents ?? 0))}`}
                            </span>
                        </div>
                        <p className="text-[11.5px] text-zinc-500">
                            {shortDateTime(s.startedAt)} — {shortDateTime(s.endedAt)} · {s.salesCount ?? 0} ventas · {s.openedByName}
                            {s.closedByName ? ` → ${s.closedByName}` : ""}
                        </p>
                        <div className="mt-1 flex justify-between text-xs text-zinc-400">
                            <span>Efectivo esperado / contado</span>
                            <b className="font-numeric text-zinc-200">
                                {money(s.expectedCashCents ?? 0)} / {money(s.closingCashCents ?? 0)}
                            </b>
                        </div>
                    </div>
                ))}
                {shiftHistory.length === 0 ? (
                    <div className="my-4 rounded-lg border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                        Sin turnos cerrados todavía.
                    </div>
                ) : null}
            </div>
        </div>
    );
}
