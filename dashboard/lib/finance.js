const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};

const itemName = (s) => s.productName ?? s.serviceName;
const netTotalOf = (s) => (s.priceCents ?? 0) - (s.discountCents ?? 0) + (s.tipCents ?? 0);

export const EXPENSE_CATEGORY_META = {
    RENTA: { label: "Renta", color: "#3987e5" },
    INSUMOS: { label: "Insumos", color: "#199e70" },
    SERVICIOS: { label: "Servicios", color: "#c98500" },
    NOMINA: { label: "Nómina", color: "#008300" },
    OTRO: { label: "Otro", color: "#9085e9" },
};

// Arma la serie diaria (7 días) de ingresos vs gastos, y el desglose de gastos por categoría (30 días).
export function buildFinanceData({ completedBookings, productSales, serviceSales = [], expenses30, barbers = [] }) {
    // Una venta cancelada no es ingreso, no genera comisión y no entra a ninguna gráfica:
    // se conserva solo como registro de que existió (ver cancelProductSale/cancelServiceSale).
    const sales = [...productSales, ...serviceSales].filter((s) => !s.cancelledAt);
    const today0 = startOfDay(new Date());
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today0.getTime() - i * DAY_MS);
        days.push({ date, key: date.toDateString(), label: date.toLocaleDateString("es-MX", { weekday: "short" }), revenueCents: 0, expenseCents: 0 });
    }
    const dayByKey = Object.fromEntries(days.map((d) => [d.key, d]));

    for (const b of completedBookings) {
        const key = new Date(b.scheduledAt ?? b.createdAt).toDateString();
        if (dayByKey[key]) dayByKey[key].revenueCents += b.amountPaidCents ?? 0;
    }
    for (const s of sales) {
        const key = new Date(s.createdAt).toDateString();
        if (dayByKey[key]) dayByKey[key].revenueCents += s.amountPaidCents ?? 0;
    }
    for (const e of expenses30) {
        const key = new Date(e.createdAt).toDateString();
        if (dayByKey[key]) dayByKey[key].expenseCents += e.amountCents;
    }

    const categoryTotals = Object.keys(EXPENSE_CATEGORY_META).map((category) => ({
        category,
        ...EXPENSE_CATEGORY_META[category],
        amountCents: expenses30.filter((e) => e.category === category).reduce((sum, e) => sum + e.amountCents, 0),
    }));

    const revenue30 =
        completedBookings.reduce((sum, b) => sum + (b.amountPaidCents ?? 0), 0) + sales.reduce((sum, s) => sum + (s.amountPaidCents ?? 0), 0);
    const expense30 = expenses30.reduce((sum, e) => sum + e.amountCents, 0);

    const barberBreakdown = barbers
        .map((barber) => {
            const bookingRevenue = completedBookings
                .filter((b) => b.barberId === barber.id)
                .reduce((sum, b) => sum + (b.amountPaidCents ?? 0), 0);
            const saleRevenue = sales.filter((s) => s.barberId === barber.id).reduce((sum, s) => sum + (s.amountPaidCents ?? 0), 0);
            const revenueCents = bookingRevenue + saleRevenue;
            return {
                id: barber.id,
                name: barber.name,
                commissionPercent: barber.commissionPercent,
                revenueCents,
                commissionCents: Math.round((revenueCents * barber.commissionPercent) / 100),
            };
        })
        .filter((b) => b.revenueCents > 0)
        .sort((a, b) => b.revenueCents - a.revenueCents);

    const itemTotals = new Map();
    for (const s of sales) {
        const name = itemName(s);
        const entry = itemTotals.get(name) ?? { name, quantity: 0, revenueCents: 0 };
        entry.quantity += s.quantity ?? 1;
        entry.revenueCents += s.amountPaidCents ?? 0;
        itemTotals.set(name, entry);
    }
    const topProducts = [...itemTotals.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5);

    const pendingCents =
        completedBookings
            .filter((b) => b.paymentStatus !== "PAGADO")
            .reduce((sum, b) => sum + ((b.priceChargedCents ?? 0) - (b.amountPaidCents ?? 0)), 0) +
        sales.filter((s) => s.paymentStatus !== "PAGADO").reduce((sum, s) => sum + (netTotalOf(s) - (s.amountPaidCents ?? 0)), 0);

    return {
        daily: days,
        categoryTotals: categoryTotals.sort((a, b) => b.amountCents - a.amountCents),
        revenue30,
        expense30,
        profit30: revenue30 - expense30,
        barberBreakdown,
        topProducts,
        pendingCents,
    };
}
