// No todo lo que llega a un catch() es un mensaje pensado para que lo lea alguien — a
// veces es un error interno de React/Next (ej. "Minified React error #441...") que se
// cuela cuando algo falla de forma inesperada al recargar datos justo después de guardar.
// Esta función es el único lugar que decide qué error sí se le muestra al usuario tal
// cual (los que nosotros mismos lanzamos, siempre cortos y en español) y cuáles se
// reemplazan por un mensaje genérico, para que nunca vea texto técnico sin sentido.
export function friendlyError(err, fallback = "Algo salió mal, intenta de nuevo.") {
    const message = err?.message;
    if (!message || typeof message !== "string") return fallback;

    // Pasa justo después de publicar una actualización: el teléfono ya tenía la página
    // vieja abierta, con IDs de Server Action de la versión anterior, que dejan de existir
    // en el servidor nuevo. No es un error de datos — se arregla solo recargando la
    // página, así que lo hacemos automáticamente en vez de dejar al usuario atorado con un
    // formulario que nunca va a funcionar hasta que él mismo piense en recargar.
    if (/failed to find server action|was not found on the server/i.test(message)) {
        if (typeof window !== "undefined") {
            setTimeout(() => window.location.reload(), 1200);
        }
        return "Se actualizó la aplicación. Recargando…";
    }

    if (/minified react error|react\.dev\/errors|digest property|hydration/i.test(message)) return fallback;
    return message;
}
