// Log de errores del lado servidor: nunca se manda al cliente (Next.js ya oculta el
// detalle de cualquier error no controlado en producción, pero los puntos sensibles —
// webhook, cron, login, guardar cita — lo hacen explícito aquí para que quede algo útil
// en los logs de Vercel/PM2 sin filtrar tokens ni SQL).
export function logError(scope, err, meta = {}) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ [${scope}]`, message, Object.keys(meta).length ? meta : "");
}
