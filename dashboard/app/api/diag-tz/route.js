// TEMPORAL: mide qué zona horaria y qué soporte de Intl tiene realmente la función
// serverless en producción. Se borra en cuanto se confirme el diagnóstico.
import { zonedNow } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

export async function GET() {
    const ahora = new Date();
    const dayStart = new Date("2026-09-12T06:00:00.000Z");
    dayStart.setHours(0, 0, 0, 0);
    const scheduledAt = new Date(dayStart);
    scheduledAt.setHours(12, 0, 0, 0);

    let intlMexico = null;
    let intlError = null;
    try {
        intlMexico = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Mexico_City",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(ahora);
    } catch (err) {
        intlError = String(err);
    }

    return Response.json({
        tzDelProceso: Intl.DateTimeFormat().resolvedOptions().timeZone,
        processEnvTZ: process.env.TZ ?? null,
        ahoraUTC: ahora.toISOString(),
        horaMexicoSegunIntl: intlMexico,
        intlError,
        zonedNow: zonedNow().toISOString(),
        scheduledAtDeLas12: scheduledAt.toISOString(),
        permitiriaAgendarALas12: scheduledAt >= zonedNow(),
    });
}
