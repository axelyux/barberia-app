"use client";

const inputClass =
    "min-h-9 rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-2.5 text-[13px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25";

const buttonClass =
    "flex h-9 items-center rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 active:bg-zinc-800/80 disabled:cursor-not-allowed disabled:opacity-50";

export default function DateRangeBar({ from, to, onFrom, onTo, onFilter, onExport, isPending }) {
    return (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className={inputClass} />
            <span className="text-xs text-zinc-500">a</span>
            <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className={inputClass} />
            <button onClick={onFilter} disabled={isPending} className={buttonClass}>
                Filtrar
            </button>
            {onExport ? (
                <button onClick={onExport} disabled={isPending} className={buttonClass}>
                    Exportar CSV
                </button>
            ) : null}
        </div>
    );
}
