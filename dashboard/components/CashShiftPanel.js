"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { money, shortDateTime, contrastText } from "@/lib/format";
import { closeShift, registerCashMovement } from "@/app/t/[slug]/shift-actions";
import { useToast } from "@/components/Toast";

const CASH_MOVEMENT_META = {
    RETIRO: { label: "Retiro", sign: "−", color: "text-red-400" },
    DEPOSITO: { label: "Depósito", sign: "+", color: "text-emerald-400" },
};

function CashMovementForm({ brandStyle, isPending, error, onSave, onCancel }) {
    const [type, setType] = useState("RETIRO");
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");

    return (
        <>
            <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setType("RETIRO")}
                        className={`flex h-11 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
                            type === "RETIRO" ? "border-red-700/60 bg-red-500/10 text-red-400" : "border-zinc-700/80 text-zinc-400"
                        }`}
                    >
                        − Sacar dinero
                    </button>
                    <button
                        onClick={() => setType("DEPOSITO")}
                        className={`flex h-11 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
                            type === "DEPOSITO" ? "border-emerald-700/60 bg-emerald-500/10 text-emerald-400" : "border-zinc-700/80 text-zinc-400"
                        }`}
                    >
                        + Meter dinero
                    </button>
                </div>
                <Field label="Monto (MXN)">
                    <NumberInput value={amount} onChange={(e) => setAmount(e.target.value)} min="0" />
                </Field>
                <Field label="Motivo">
                    <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Pago urgente de proveedor" />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    loading={isPending}
                    disabled={!amount || !reason.trim()}
                    onClick={() => onSave({ type, amountCents: Math.round(parseFloat(amount || "0") * 100), reason })}
                >
                    Registrar
                </SheetButton>
                <SheetButton variant="ghost" onClick={onCancel}>
                    Cancelar
                </SheetButton>
            </div>
        </>
    );
}

export default function CashShiftPanel({ openShift, shiftHistory, cashMovements: initialCashMovements, slug, brandColor, canClose, canAddCashMovement }) {
    const [closingCash, setClosingCash] = useState("0");
    const [notes, setNotes] = useState("");
    const [cashMovements, setCashMovements] = useState(initialCashMovements ?? []);
    const [movementOpen, setMovementOpen] = useState(false);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };
    const showToast = useToast();

    const doClose = () => {
        setError("");
        startTransition(async () => {
            try {
                await closeShift(slug, { closingCashCents: Math.round(parseFloat(closingCash || "0") * 100), notes });
            } catch (err) {
                setError(err?.message ?? "⚠️ Algo salió mal, intenta de nuevo.");
            }
        });
    };

    const saveMovement = (data) => {
        setError("");
        startTransition(async () => {
            try {
                await registerCashMovement(slug, data);
                setCashMovements((prev) => [{ ...data, id: `tmp-${Date.now()}`, createdAt: new Date().toISOString() }, ...prev]);
                setMovementOpen(false);
                showToast(data.type === "RETIRO" ? "✅ Salida de efectivo registrada" : "✅ Entrada de efectivo registrada");
            } catch (err) {
                setError(err?.message ?? "⚠️ Algo salió mal, intenta de nuevo.");
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

                {canAddCashMovement ? (
                    <button
                        onClick={() => {
                            setError("");
                            setMovementOpen(true);
                        }}
                        className="mt-3 flex min-h-10 w-full items-center justify-center rounded-lg border border-white/10 text-xs font-bold text-zinc-300 hover:bg-white/5"
                    >
                        💵 Sacar / meter dinero de la caja
                    </button>
                ) : null}

                {cashMovements.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-3">
                        {cashMovements.map((m) => {
                            const meta = CASH_MOVEMENT_META[m.type];
                            return (
                                <div key={m.id} className="flex items-center justify-between text-xs">
                                    <span className="truncate text-zinc-400">{m.reason || meta.label}</span>
                                    <span className={`font-numeric shrink-0 font-bold ${meta.color}`}>
                                        {meta.sign}
                                        {money(m.amountCents)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
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

            {canAddCashMovement ? (
                <BottomSheet open={movementOpen} onClose={() => setMovementOpen(false)} title="Sacar / meter dinero">
                    {movementOpen ? (
                        <CashMovementForm
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setMovementOpen(false)}
                            onSave={saveMovement}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}
        </div>
    );
}
