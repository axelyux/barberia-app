"use client";

import { useState, useTransition } from "react";
import SheetButton from "@/components/SheetButton";
import { contrastText } from "@/lib/format";
import { updateBusinessHours } from "@/app/t/[slug]/hours-actions";

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const minToHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const hhmmToMin = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
};

export default function BusinessHoursEditor({ tenant, hours, perms }) {
    const initial = DAY_LABELS.map((_, weekday) => {
        const row = hours.find((h) => h.weekday === weekday);
        return row
            ? { weekday, isClosed: row.isClosed, openMin: row.openMin, closeMin: row.closeMin }
            : { weekday, isClosed: weekday === 0, openMin: 540, closeMin: 1200 };
    });
    const [days, setDays] = useState(initial);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();

    const update = (weekday, patch) =>
        setDays((ds) => ds.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));

    const save = () => {
        setError("");
        setSaved(false);
        startTransition(async () => {
            try {
                await updateBusinessHours(tenant.slug, days);
                setSaved(true);
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-zinc-500">Horario de atención</p>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3.5">
                <p className="mb-3 text-xs text-zinc-500">
                    El bot avisa automáticamente si te escriben fuera de estas horas.
                </p>
                <div className="flex flex-col gap-2.5">
                    {days.map((d) => (
                        <div key={d.weekday} className="flex items-center gap-2.5">
                            <span className="w-[76px] shrink-0 text-[12.5px] font-semibold text-zinc-300">{DAY_LABELS[d.weekday]}</span>
                            <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-zinc-400">
                                <input
                                    type="checkbox"
                                    disabled={!perms.canEdit}
                                    checked={!d.isClosed}
                                    onChange={(e) => update(d.weekday, { isClosed: !e.target.checked })}
                                    className="h-4 w-4 rounded-sm border-zinc-600 bg-zinc-800"
                                />
                                Abierto
                            </label>
                            {!d.isClosed ? (
                                <div className="flex flex-1 items-center gap-1.5">
                                    <input
                                        type="time"
                                        disabled={!perms.canEdit}
                                        value={minToHHMM(d.openMin)}
                                        onChange={(e) => update(d.weekday, { openMin: hhmmToMin(e.target.value) })}
                                        className="h-9 flex-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-2 text-[12.5px] text-zinc-50"
                                    />
                                    <span className="text-zinc-600">–</span>
                                    <input
                                        type="time"
                                        disabled={!perms.canEdit}
                                        value={minToHHMM(d.closeMin)}
                                        onChange={(e) => update(d.weekday, { closeMin: hhmmToMin(e.target.value) })}
                                        className="h-9 flex-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-2 text-[12.5px] text-zinc-50"
                                    />
                                </div>
                            ) : (
                                <span className="flex-1 text-[12.5px] text-zinc-600">Cerrado</span>
                            )}
                        </div>
                    ))}
                </div>

                {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
                {saved && !isPending ? <p className="mt-3 text-sm text-emerald-400">Guardado.</p> : null}

                {perms.canEdit ? (
                    <div className="mt-3.5">
                        <SheetButton
                            variant="brand"
                            style={{ background: tenant.brandColor, color: contrastText(tenant.brandColor) }}
                            disabled={isPending}
                            onClick={save}
                        >
                            Guardar horario
                        </SheetButton>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
