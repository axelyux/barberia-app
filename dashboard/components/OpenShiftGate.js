"use client";

import { useState, useTransition } from "react";
import { Field, NumberInput } from "@/components/FormField";
import { contrastText } from "@/lib/format";
import { openShift } from "@/app/t/[slug]/shift-actions";

export default function OpenShiftGate({ slug, brandColor, tenantName, shiftTypes, canOpen }) {
    const [shiftTypeId, setShiftTypeId] = useState(shiftTypes[0]?.id ?? "");
    const [openingCash, setOpeningCash] = useState("0");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };

    if (!canOpen) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: brandColor }}>
                    {tenantName}
                </p>
                <div className="max-w-xs rounded-xl border border-white/10 bg-zinc-900/60 p-6 shadow-[var(--shadow-panel)]">
                    <p className="text-sm text-zinc-400">
                        La caja todavía no se ha abierto hoy. Pídele a un administrador o gerente que abra el turno para poder entrar.
                    </p>
                </div>
            </main>
        );
    }

    const submit = () => {
        setError("");
        startTransition(async () => {
            try {
                await openShift(slug, {
                    shiftTypeId: shiftTypeId || null,
                    openingCashCents: Math.round(parseFloat(openingCash || "0") * 100),
                });
            } catch (err) {
                setError(err?.message ?? "⚠️ Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-center">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: brandColor }}>
                    {tenantName}
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-50">Abrir caja</h1>
                <p className="mt-1 text-sm text-zinc-500">Antes de empezar, registra tu turno y el efectivo con el que arrancas la caja.</p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-4 rounded-xl border border-white/10 bg-zinc-900/60 p-5 text-left shadow-[var(--shadow-panel)]">
                {shiftTypes.length > 0 ? (
                    <Field label="Turno">
                        <select
                            value={shiftTypeId}
                            onChange={(e) => setShiftTypeId(e.target.value)}
                            className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                        >
                            {shiftTypes.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                ) : (
                    <p className="rounded-lg border border-dashed border-white/10 bg-zinc-900/40 p-3 text-xs text-zinc-500">
                        No has configurado turnos todavía (puedes hacerlo en Ajustes). Por ahora se abrirá sin turno asignado.
                    </p>
                )}
                <Field label="Monto inicial en caja (MXN)">
                    <NumberInput value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} min="0" />
                </Field>
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
                <button
                    onClick={submit}
                    disabled={isPending}
                    style={brandStyle}
                    className="mt-1 flex min-h-11 items-center justify-center rounded-lg text-sm font-bold tracking-tight shadow-[0_1px_0_rgba(255,255,255,0.15)_inset] transition-colors disabled:opacity-50"
                >
                    {isPending ? "Abriendo…" : "Abrir caja y entrar"}
                </button>
            </div>
        </main>
    );
}
