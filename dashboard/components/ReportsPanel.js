"use client";

import { useState, useTransition } from "react";
import { useGlobalPending } from "@/components/GlobalLoading";
import { friendlyError } from "@/lib/errors";
import DateRangeBar from "@/components/DateRangeBar";
import { money, shortDateTime, toDateInputValue } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { getReports } from "@/app/t/[slug]/report-actions";

const VISTAS = [
    { key: "turnos", label: "Turnos" },
    { key: "barberos", label: "Barberos" },
    { key: "caja", label: "Caja" },
];

const startOf30DaysAgo = () => toDateInputValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

function Linea({ label, value, tone }) {
    const color = tone === "bad" ? "text-red-400" : tone === "good" ? "text-emerald-400" : "text-zinc-100";
    return (
        <div className="flex items-center justify-between gap-2 border-b border-white/10 py-2 text-sm last:border-b-0">
            <span className="min-w-0 text-zinc-400">{label}</span>
            <b className={`font-numeric shrink-0 ${color}`}>{value}</b>
        </div>
    );
}

function Tarjeta({ title, children }) {
    return (
        <div className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 py-1 shadow-[var(--shadow-panel)]">
            {title ? <p className="pt-2.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">{title}</p> : null}
            {children}
        </div>
    );
}

// Un turno cerrado guarda su propio corte (lo que se esperaba vs. lo que se contó). Un
// turno todavía abierto no tiene esos números hasta que se cierre, así que se muestra
// aparte en vez de con ceros que parecerían un descuadre.
function TurnoCard({ t }) {
    const dif = t.cashDifferenceCents ?? 0;
    return (
        <div className="border-b border-white/10 py-3 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-bold text-zinc-100">{t.label}</span>
                {t.abierto ? (
                    <span className="shrink-0 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">EN CURSO</span>
                ) : (
                    <span className={`font-numeric shrink-0 text-xs font-bold ${dif === 0 ? "text-zinc-400" : dif > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {dif === 0 ? "Cuadró" : dif > 0 ? `Sobró ${money(dif)}` : `Faltó ${money(Math.abs(dif))}`}
                    </span>
                )}
            </div>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
                {shortDateTime(t.startedAt)}
                {t.endedAt ? ` — ${shortDateTime(t.endedAt)}` : " — sin cerrar"} · abrió {t.openedByName}
                {t.closedByName ? ` → cerró ${t.closedByName}` : ""}
            </p>
            <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-zinc-400">
                <div className="flex justify-between">
                    <span>Fondo inicial</span>
                    <b className="font-numeric text-zinc-300">{money(t.openingCashCents)}</b>
                </div>
                {t.abierto ? null : (
                    <>
                        <div className="flex justify-between">
                            <span>Efectivo esperado / contado</span>
                            <b className="font-numeric text-zinc-300">
                                {money(t.expectedCashCents ?? 0)} / {money(t.closingCashCents ?? 0)}
                            </b>
                        </div>
                        <div className="flex justify-between">
                            <span>Ingresos / gastos del turno</span>
                            <b className="font-numeric text-zinc-300">
                                {money(t.totalRevenueCents ?? 0)} / {money(t.totalExpenseCents ?? 0)}
                            </b>
                        </div>
                        <div className="flex justify-between">
                            <span>Ventas registradas</span>
                            <b className="font-numeric text-zinc-300">{t.salesCount ?? 0}</b>
                        </div>
                    </>
                )}
            </div>
            {t.notes ? <p className="mt-1.5 text-[11.5px] text-zinc-500">Nota: {t.notes}</p> : null}
        </div>
    );
}

export default function ReportsPanel({ slug }) {
    const [fromDate, setFromDate] = useState(startOf30DaysAgo);
    const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
    const [vista, setVista] = useState("turnos");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    useGlobalPending(isPending);

    const cargar = () => {
        setError("");
        startTransition(async () => {
            try {
                setData(await getReports(slug, { from: `${fromDate}T00:00:00`, to: `${toDate}T23:59:59` }));
            } catch (err) {
                setError(friendlyError(err));
            }
        });
    };

    return (
        <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Reportes</p>
            <DateRangeBar from={fromDate} to={toDate} onFrom={setFromDate} onTo={setToDate} onFilter={cargar} isPending={isPending} />

            {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}

            {!data ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                    Elige las fechas y toca “Filtrar” para ver el reporte.
                </div>
            ) : (
                <>
                    <div className="mb-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-[var(--shadow-panel)]">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Ingresos</p>
                            <p className="font-numeric mt-1.5 text-[15px] font-bold text-emerald-400">{money(data.totales.ingresoCents)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-[var(--shadow-panel)]">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Gastos</p>
                            <p className="font-numeric mt-1.5 text-[15px] font-bold text-red-400">{money(data.totales.gastoCents)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-[var(--shadow-panel)]">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Utilidad</p>
                            <p className={`font-numeric mt-1.5 text-[15px] font-bold ${data.totales.utilidadCents >= 0 ? "text-zinc-50" : "text-red-400"}`}>
                                {money(data.totales.utilidadCents)}
                            </p>
                        </div>
                    </div>

                    <div className="mb-3 grid grid-cols-3 gap-2">
                        {VISTAS.map((v) => (
                            <button
                                key={v.key}
                                onClick={() => setVista(v.key)}
                                className={`flex min-h-10 items-center justify-center rounded-lg border text-sm font-semibold ${
                                    vista === v.key ? "border-zinc-400 text-zinc-100" : "border-zinc-700/80 text-zinc-400"
                                }`}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>

                    {vista === "turnos" ? (
                        <Tarjeta>
                            {data.turnos.length === 0 ? (
                                <p className="py-6 text-center text-sm text-zinc-500">No hubo turnos en estas fechas.</p>
                            ) : (
                                data.turnos.map((t) => <TurnoCard key={t.id} t={t} />)
                            )}
                        </Tarjeta>
                    ) : null}

                    {vista === "barberos" ? (
                        <div className="flex flex-col gap-3">
                            <Tarjeta>
                                {data.barberos.filas.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-zinc-500">Ningún barbero registró ventas en estas fechas.</p>
                                ) : (
                                    data.barberos.filas.map((b) => (
                                        <div key={b.id} className="border-b border-white/10 py-3 last:border-b-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="min-w-0 truncate text-sm font-bold text-zinc-100">{b.name}</span>
                                                <b className="font-numeric shrink-0 text-sm text-emerald-400">{money(b.ingresoCents)}</b>
                                            </div>
                                            <p className="mt-0.5 text-[11.5px] text-zinc-500">
                                                {b.ventasCount} ventas · {b.citasCount} citas
                                                {b.paymentType === "SUELDO"
                                                    ? ` · sueldo fijo ${money(b.salaryCents)}`
                                                    : ` · comisión ${b.commissionPercent}%`}
                                            </p>
                                            {b.paymentType !== "SUELDO" ? (
                                                <div className="mt-1 flex justify-between text-xs text-zinc-400">
                                                    <span>Comisión que le tocaría</span>
                                                    <b className="font-numeric text-zinc-200">{money(b.comisionCents)}</b>
                                                </div>
                                            ) : null}
                                        </div>
                                    ))
                                )}
                            </Tarjeta>
                            {data.barberos.sinBarberoCents > 0 ? (
                                <Tarjeta>
                                    <Linea label="Cobrado sin barbero asignado" value={money(data.barberos.sinBarberoCents)} />
                                </Tarjeta>
                            ) : null}
                            <p className="text-[11.5px] text-zinc-500">
                                La comisión es informativa: pagarla sigue siendo un gasto que registras aparte, en la categoría Nómina.
                            </p>
                        </div>
                    ) : null}

                    {vista === "caja" ? (
                        <div className="flex flex-col gap-3">
                            <Tarjeta title="Efectivo">
                                <Linea label="Entró en efectivo (ventas y citas)" value={money(data.caja.ingresoEfectivoCents)} tone="good" />
                                <Linea label="Gastos pagados desde la caja" value={money(data.caja.gastoEfectivoCajaCents)} tone="bad" />
                                <Linea label="Entradas manuales de efectivo" value={money(data.caja.depositosCents)} tone="good" />
                                <Linea label="Salidas manuales de efectivo" value={money(data.caja.retirosCents)} tone="bad" />
                            </Tarjeta>

                            <Tarjeta title="Cortes de turno">
                                <Linea label="Turnos cerrados" value={data.caja.turnosCerradosCount} />
                                <Linea
                                    label="Diferencia acumulada (sobró / faltó)"
                                    value={money(data.caja.diferenciaTotalCents)}
                                    tone={data.caja.diferenciaTotalCents === 0 ? undefined : data.caja.diferenciaTotalCents > 0 ? "good" : "bad"}
                                />
                            </Tarjeta>

                            <Tarjeta title="Ingresos por método de pago">
                                {data.caja.porMetodo.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-zinc-500">Sin ingresos en estas fechas.</p>
                                ) : (
                                    data.caja.porMetodo.map((m) => (
                                        <Linea key={m.method} label={PAYMENT_METHOD_LABELS[m.method] ?? m.method} value={money(m.amountCents)} />
                                    ))
                                )}
                            </Tarjeta>

                            <Tarjeta title="Gastos en efectivo pagados por fuera">
                                <Linea label="No salieron de la caja" value={money(data.caja.gastoEfectivoFueraCents)} />
                            </Tarjeta>

                            {data.totales.canceladasCount > 0 || data.totales.gastosCanceladosCount > 0 ? (
                                <Tarjeta title="Cancelaciones">
                                    <Linea
                                        label={`Ventas canceladas (${data.totales.canceladasCount})`}
                                        value={money(data.totales.canceladasCents)}
                                        tone="bad"
                                    />
                                    <Linea label="Gastos cancelados" value={data.totales.gastosCanceladosCount} />
                                </Tarjeta>
                            ) : null}
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
