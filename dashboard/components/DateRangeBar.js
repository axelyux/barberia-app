"use client";

const inputClass =
    "min-h-9 rounded-md border border-zinc-700 bg-zinc-800/60 px-2 text-[13px] text-zinc-50 focus:border-amber-500 focus:outline-none";

export default function DateRangeBar({ from, to, onFrom, onTo, onFilter, onExport, isPending }) {
    return (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className={inputClass} />
            <span className="text-xs text-zinc-500">a</span>
            <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className={inputClass} />
            <button
                onClick={onFilter}
                disabled={isPending}
                className="flex h-9 items-center rounded-md border border-zinc-700 px-2.5 text-xs font-semibold text-zinc-300 disabled:opacity-50"
            >
                Filtrar
            </button>
            {onExport ? (
                <button
                    onClick={onExport}
                    disabled={isPending}
                    className="flex h-9 items-center rounded-md border border-zinc-700 px-2.5 text-xs font-semibold text-zinc-300 disabled:opacity-50"
                >
                    Exportar CSV
                </button>
            ) : null}
        </div>
    );
}
