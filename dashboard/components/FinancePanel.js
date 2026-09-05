import { money } from "@/lib/format";
import { RevenueExpenseChart, CategoryBreakdown, TopProductsChart } from "@/components/FinanceCharts";

export default function FinancePanel({ finance }) {
    const profitGood = finance.profit30 >= 0;

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-[var(--shadow-panel)]">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Ingresos 30d</p>
                    <p className="font-numeric mt-1.5 text-[16px] font-bold text-emerald-400">{money(finance.revenue30)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-[var(--shadow-panel)]">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Gastos 30d</p>
                    <p className="font-numeric mt-1.5 text-[16px] font-bold text-red-400">{money(finance.expense30)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-[var(--shadow-panel)]">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Utilidad 30d</p>
                    <p className={`font-numeric mt-1.5 text-[16px] font-bold ${profitGood ? "text-zinc-50" : "text-red-400"}`}>
                        {money(finance.profit30)}
                    </p>
                </div>
            </div>

            {finance.pendingCents > 0 ? (
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3.5 shadow-[var(--shadow-panel)]">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-orange-400">Pendiente de cobro</p>
                    <p className="font-numeric mt-1 text-[20px] font-bold text-orange-300">{money(finance.pendingCents)}</p>
                    <p className="mt-0.5 text-[12.5px] text-orange-200/80">De ventas y citas marcadas como parcial o no pagadas.</p>
                </div>
            ) : null}

            <RevenueExpenseChart daily={finance.daily} />
            <TopProductsChart topProducts={finance.topProducts} />
            <CategoryBreakdown categoryTotals={finance.categoryTotals} />

            {finance.barberBreakdown.length > 0 ? (
                <div className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 shadow-[var(--shadow-panel)]">
                    <p className="pt-3.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Comisiones por barbero · 30 días</p>
                    {finance.barberBreakdown.map((b) => (
                        <div key={b.id} className="flex items-center justify-between border-b border-white/10 py-2.5 text-sm last:border-b-0">
                            <div>
                                <p className="font-semibold text-zinc-100">{b.name}</p>
                                <p className="text-[11.5px] text-zinc-500">
                                    {money(b.revenueCents)} generados · {b.commissionPercent}%
                                </p>
                            </div>
                            <span className="font-numeric font-bold text-emerald-400">{money(b.commissionCents)}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
