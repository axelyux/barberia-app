"use client";
import { useGlobalPending } from "@/components/GlobalLoading";
import { friendlyError } from "@/lib/errors";

import { useState, useTransition } from "react";
import SheetButton from "@/components/SheetButton";
import { contrastText } from "@/lib/format";
import { updateBusinessHours } from "@/app/t/[slug]/hours-actions";
import { TIME_ZONES, DEFAULT_TIME_ZONE } from "@/lib/scheduling";
import { problemMessage } from "@/lib/action-result";

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
    const [minNotice, setMinNotice] = useState(String(tenant.bookingMinNoticeMin ?? 30));
    const [timeZone, setTimeZone] = useState(tenant.timeZone ?? DEFAULT_TIME_ZONE);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    useGlobalPending(isPending);

    const update = (weekday, patch) =>
        setDays((ds) => ds.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));

    const save = () => {
        setError("");
        setSaved(false);
        startTransition(async () => {
            try {
                const problema = problemMessage(await updateBusinessHours(tenant.slug, days, parseInt(minNotice, 10) || 0, timeZone));
                if (problema) {
                    setError(problema);
                    return;
                }
                setSaved(true);
            } catch (err) {
                setError(friendlyError(err));
            }
        });
    };

    return (
        <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Horario de atención</p>
            <div className="rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-[var(--shadow-panel)]">
                <p className="mb-3.5 text-xs text-zinc-500">
                    El bot avisa automáticamente si te escriben fuera de estas horas.
                </p>
                <div className="mb-3.5">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Zona horaria</p>
                    <select
                        value={timeZone}
                        onChange={(e) => setTimeZone(e.target.value)}
                        disabled={!perms.canEdit}
                        className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] focus:border-amber-500/70 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {TIME_ZONES.map((z) => (
                            <option key={z.value} value={z.value}>
                                {z.label}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-[11px] text-zinc-500">
                        De esto dependen los horarios de las citas y a qué día pertenece cada venta.
                    </p>
                </div>
                <div className="flex flex-col divide-y divide-white/10/80">
                    {days.map((d) => (
                        <div key={d.weekday} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                            <label className="flex w-[92px] shrink-0 items-center gap-2">
                                <input
                                    type="checkbox"
                                    disabled={!perms.canEdit}
                                    checked={!d.isClosed}
                                    onChange={(e) => update(d.weekday, { isClosed: !e.target.checked })}
                                    className="h-4 w-4 rounded-sm border-zinc-600 bg-zinc-800"
                                />
                                <span className={`text-[13px] font-semibold ${d.isClosed ? "text-zinc-500" : "text-zinc-200"}`}>
                                    {DAY_LABELS[d.weekday]}
                                </span>
                            </label>
                            {!d.isClosed ? (
                                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                    <input
                                        type="time"
                                        disabled={!perms.canEdit}
                                        value={minToHHMM(d.openMin)}
                                        onChange={(e) => update(d.weekday, { openMin: hhmmToMin(e.target.value) })}
                                        className="h-9 w-0 min-w-0 flex-1 rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-1.5 text-[12.5px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] focus:border-amber-500/70 focus:outline-none"
                                    />
                                    <span className="shrink-0 text-zinc-600">–</span>
                                    <input
                                        type="time"
                                        disabled={!perms.canEdit}
                                        value={minToHHMM(d.closeMin)}
                                        onChange={(e) => update(d.weekday, { closeMin: hhmmToMin(e.target.value) })}
                                        className="h-9 w-0 min-w-0 flex-1 rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-1.5 text-[12.5px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] focus:border-amber-500/70 focus:outline-none"
                                    />
                                </div>
                            ) : (
                                <span className="flex-1 text-right text-[12.5px] text-zinc-600">Cerrado</span>
                            )}
                        </div>
                    ))}
                </div>

                <div className="mt-4 border-t border-white/10 pt-4">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500">Anticipación mínima para agendar</span>
                        <span className="text-xs text-zinc-500">
                            El bot no aceptará citas con menos de estos minutos de anticipación (evita que agenden “para ya mismo”).
                        </span>
                        <div className="mt-1.5 flex items-center gap-2">
                            <input
                                type="number"
                                min="0"
                                max="1440"
                                step="15"
                                disabled={!perms.canEdit}
                                value={minNotice}
                                onChange={(e) => setMinNotice(e.target.value)}
                                className="font-numeric h-9 w-24 rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-2.5 text-[12.5px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] focus:border-amber-500/70 focus:outline-none"
                            />
                            <span className="text-[12.5px] text-zinc-400">minutos</span>
                        </div>
                    </label>
                </div>

                {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
                {saved && !isPending ? <p className="mt-3 text-sm text-emerald-400">Guardado.</p> : null}

                {perms.canEdit ? (
                    <div className="mt-4">
                        <SheetButton
                            variant="brand"
                            style={{ background: tenant.brandColor, color: contrastText(tenant.brandColor) }}
                            loading={isPending}
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
