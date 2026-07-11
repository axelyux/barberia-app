import { money } from "@/lib/format";
import { RevenueExpenseChart, CategoryBreakdown } from "@/components/FinanceCharts";
import ExpenseList from "@/components/ExpenseList";

export default function FinancePanel({ finance, expenses, slug, brandColor, perms }) {
    const profitGood = finance.profit30 >= 0;

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-zinc-500">Ingresos 30d</p>
                    <p className="font-numeric mt-1.5 text-[16px] font-bold text-emerald-400">{money(finance.revenue30)}</p>
                </div>
                <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-zinc-500">Gastos 30d</p>
                    <p className="font-numeric mt-1.5 text-[16px] font-bold text-red-400">{money(finance.expense30)}</p>
                </div>
                <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-zinc-500">Utilidad 30d</p>
                    <p className={`font-numeric mt-1.5 text-[16px] font-bold ${profitGood ? "text-zinc-50" : "text-red-400"}`}>
                        {money(finance.profit30)}
                    </p>
                </div>
            </div>

            <RevenueExpenseChart daily={finance.daily} />
            <CategoryBreakdown categoryTotals={finance.categoryTotals} />
            <ExpenseList expenses={expenses} slug={slug} brandColor={brandColor} perms={perms} />
        </div>
    );
}
