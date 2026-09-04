import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";

// Disparado por Vercel Cron (ver vercel.json) — un Route Handler serverless, no un
// proceso persistente, así que sí es compatible con Vercel a diferencia de un cron
// tradicional de sistema operativo.
//
// Única responsabilidad: ACTIVE -> PAST_DUE cuando ya pasó la fecha de vencimiento más
// el periodo de gracia. Nunca toca tenants PAUSED ni los pasa a PAUSED — esa transición
// sigue siendo una decisión manual del super-admin desde /admin.
export async function GET(request) {
    const auth = request.headers.get("authorization");
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    try {
        const graceDays = Math.max(0, Number(process.env.BILLING_GRACE_DAYS) || 3);
        const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

        const result = await prisma.tenant.updateMany({
            where: { status: "ACTIVE", nextDueDate: { lt: cutoff } },
            data: { status: "PAST_DUE" },
        });

        return NextResponse.json({ ok: true, updated: result.count, graceDays });
    } catch (err) {
        logError("cron.tenant-billing", err);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}
