import { money } from "@/lib/format";

const GOOD = "#0ca30c";
const CRITICAL = "#d03b3b";

export function RevenueExpenseChart({ daily }) {
    const max = Math.max(1, ...daily.flatMap((d) => [d.revenueCents, d.expenseCents]));
    const w = 328;
    const h = 120;
    const padBottom = 18;
    const barH = h - padBottom;
    const groupW = w / daily.length;
    const barW = 9;
    const gap = 3;

    return (
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3.5">
            <div className="mb-3 flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Ingresos vs. gastos · 7 días</p>
                <div className="flex items-center gap-3 text-[11px] font-semibold text-zinc-400">
                    <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm" style={{ background: GOOD }} /> Ingresos
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm" style={{ background: CRITICAL }} /> Gastos
                    </span>
                </div>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Ingresos y gastos de los últimos 7 días">
                {[0.25, 0.5, 0.75, 1].map((f) => (
                    <line key={f} x1={0} x2={w} y1={barH - barH * f} y2={barH - barH * f} stroke="#2c2c2a" strokeWidth="1" />
                ))}
                <line x1={0} x2={w} y1={barH} y2={barH} stroke="#383835" strokeWidth="1" />

                {daily.map((d, i) => {
                    const cx = i * groupW + groupW / 2;
                    const revH = (d.revenueCents / max) * (barH - 6);
                    const expH = (d.expenseCents / max) * (barH - 6);
                    return (
                        <g key={d.key}>
                            <rect x={cx - gap / 2 - barW} y={barH - revH} width={barW} height={Math.max(revH, 1)} rx="2" fill={GOOD}>
                                <title>{`${d.label}: ${money(d.revenueCents)} en ingresos`}</title>
                            </rect>
                            <rect x={cx + gap / 2} y={barH - expH} width={barW} height={Math.max(expH, 1)} rx="2" fill={CRITICAL}>
                                <title>{`${d.label}: ${money(d.expenseCents)} en gastos`}</title>
                            </rect>
                            <text x={cx} y={h - 3} textAnchor="middle" fontSize="9" fill="#898781" fontWeight="600">
                                {d.label.replace(".", "")}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

export function CategoryBreakdown({ categoryTotals }) {
    const max = Math.max(1, ...categoryTotals.map((c) => c.amountCents));
    return (
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3.5">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-zinc-500">Gastos por categoría · 30 días</p>
            <div className="flex flex-col gap-2.5">
                {categoryTotals.map((c) => (
                    <div key={c.category}>
                        <div className="mb-1 flex items-center justify-between text-[12.5px]">
                            <span className="font-semibold text-zinc-200">{c.label}</span>
                            <span className="font-numeric font-semibold text-zinc-100">{money(c.amountCents)}</span>
                        </div>
                        <div className="h-2 w-full rounded-sm bg-zinc-800">
                            <div
                                className="h-2 rounded-sm"
                                style={{ width: `${Math.max(4, (c.amountCents / max) * 100)}%`, background: c.color }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
