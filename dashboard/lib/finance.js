const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};

export const EXPENSE_CATEGORY_META = {
    RENTA: { label: "Renta", color: "#3987e5" },
    INSUMOS: { label: "Insumos", color: "#199e70" },
    SERVICIOS: { label: "Servicios", color: "#c98500" },
    NOMINA: { label: "Nómina", color: "#008300" },
    OTRO: { label: "Otro", color: "#9085e9" },
};

// Arma la serie diaria (7 días) de ingresos vs gastos, y el desglose de gastos por categoría (30 días).
export function buildFinanceData({ completedBookings, productSales, expenses30 }) {
    const today0 = startOfDay(new Date());
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today0.getTime() - i * DAY_MS);
        days.push({ date, key: date.toDateString(), label: date.toLocaleDateString("es-MX", { weekday: "short" }), revenueCents: 0, expenseCents: 0 });
    }
    const dayByKey = Object.fromEntries(days.map((d) => [d.key, d]));

    for (const b of completedBookings) {
        const key = new Date(b.scheduledAt ?? b.createdAt).toDateString();
        if (dayByKey[key]) dayByKey[key].revenueCents += b.priceChargedCents ?? 0;
    }
    for (const s of productSales) {
        const key = new Date(s.createdAt).toDateString();
        if (dayByKey[key]) dayByKey[key].revenueCents += s.priceCents;
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
        completedBookings.reduce((sum, b) => sum + (b.priceChargedCents ?? 0), 0) +
        productSales.reduce((sum, s) => sum + s.priceCents, 0);
    const expense30 = expenses30.reduce((sum, e) => sum + e.amountCents, 0);

    return {
        daily: days,
        categoryTotals: categoryTotals.sort((a, b) => b.amountCents - a.amountCents),
        revenue30,
        expense30,
        profit30: revenue30 - expense30,
    };
}
