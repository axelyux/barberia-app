// No todo lo que llega a un catch() es un mensaje pensado para que lo lea alguien — a
// veces es un error interno de React/Next (ej. "Minified React error #441...") que se
// cuela cuando algo falla de forma inesperada al recargar datos justo después de guardar.
// Esta función es el único lugar que decide qué error sí se le muestra al usuario tal
// cual (los que nosotros mismos lanzamos, siempre cortos y en español) y cuáles se
// reemplazan por un mensaje genérico, para que nunca vea texto técnico sin sentido.
export function friendlyError(err, fallback = "Algo salió mal, intenta de nuevo.") {
    const message = err?.message;
    if (!message || typeof message !== "string") return fallback;
    if (/minified react error|react\.dev\/errors|digest property|hydration/i.test(message)) return fallback;
    return message;
}
