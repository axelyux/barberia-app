export const ALL_PAYMENT_METHODS = [
    "EFECTIVO",
    "TARJETA_DEBITO",
    "TARJETA_CREDITO",
    "TRANSFERENCIA",
    "DEPOSITO",
    "PAYPAL",
    "MERCADO_PAGO",
    "CODI",
    "VALES_DESPENSA",
    "OTRO",
];

export const PAYMENT_METHOD_LABELS = {
    EFECTIVO: "Efectivo",
    TARJETA_DEBITO: "Tarjeta de débito",
    TARJETA_CREDITO: "Tarjeta de crédito",
    TRANSFERENCIA: "Transferencia (SPEI)",
    DEPOSITO: "Depósito bancario",
    PAYPAL: "PayPal",
    MERCADO_PAGO: "Mercado Pago",
    CODI: "CoDi",
    VALES_DESPENSA: "Vales de despensa",
    OTRO: "Otro",
};

// Qué opciones mostrar en un <select> de método de pago: solo las que la barbería tiene
// activas (ver TenantPaymentMethod), pero SIEMPRE incluyendo el valor ya elegido (aunque
// alguien lo haya desactivado después) — así nunca se le esconde a un registro viejo el
// método con el que en verdad se cobró.
export function visiblePaymentMethods(activeMethods, currentValue) {
    return Object.entries(PAYMENT_METHOD_LABELS).filter(([key]) => activeMethods.includes(key) || key === currentValue);
}

export const PAYMENT_STATUS_META = {
    PAGADO: { label: "Pagado", tone: "good" },
    PARCIAL: { label: "Pagado parcial", tone: "warn" },
    NO_PAGADO: { label: "No pagado", tone: "bad" },
};
