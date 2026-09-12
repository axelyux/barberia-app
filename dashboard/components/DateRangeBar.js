"use client";

const inputClass =
    "min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-2.5 text-[13px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 sm:flex-none";

const buttonClass =
    "flex min-h-11 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 active:bg-zinc-800/80 disabled:cursor-not-allowed disabled:opacity-50";

export default function DateRangeBar({ from, to, onFrom, onTo, onFilter, isPending }) {
    return (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className={inputClass} />
                <span className="shrink-0 text-xs text-zinc-500">a</span>
                <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className={inputClass} />
            </div>
            <button onClick={onFilter} disabled={isPending} className={buttonClass}>
                Filtrar
            </button>
        </div>
    );
}
