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

export const PAYMENT_STATUS_META = {
    PAGADO: { label: "Pagado", tone: "good" },
    PARCIAL: { label: "Pagado parcial", tone: "warn" },
    NO_PAGADO: { label: "No pagado", tone: "bad" },
};
