import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendText } from "@/lib/whatsapp-graph";
import { formatTime12h } from "@/lib/scheduling";
import { logError } from "@/lib/log";

// Recordatorio de cita ~1h antes, por WhatsApp. Reemplaza el setInterval de 5 min que
// tenía whatsapp-meta-bot.js (VPS) — aquí lo dispara un cron externo o Vercel Cron
// pegándole a esta URL cada 5 min (ver dashboard/README.md: el plan Hobby de Vercel
// puede limitar la frecuencia de sus propios crons a 1 vez al día).
export async function GET(request) {
    const auth = request.headers.get("authorization");
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const now = new Date();
    const from = new Date(now.getTime() + 55 * 60 * 1000);
    const to = new Date(now.getTime() + 65 * 60 * 1000);

    const bookings = await prisma.booking.findMany({
        where: { status: "PENDING", reminderSentAt: null, scheduledAt: { gte: from, lte: to } },
        include: { service: true, tenant: true },
    });

    let sent = 0;
    for (const booking of bookings) {
        if (!booking.tenant.metaPhoneNumberId || !booking.tenant.metaAccessToken) continue;
        try {
            const when = formatTime12h(new Date(booking.scheduledAt));
            const serviceLine = booking.service ? ` (${booking.service.name})` : "";
            await sendText(booking.tenant, booking.customerPhone, `⏰ Recordatorio: tienes una cita hoy a las ${when}${serviceLine}. ¡Te esperamos!`);
            await prisma.booking.update({ where: { id: booking.id }, data: { reminderSentAt: new Date() } });
            sent += 1;
        } catch (err) {
            logError("cron.whatsapp-reminders", err, { bookingId: booking.id });
        }
    }

    return NextResponse.json({ ok: true, checked: bookings.length, sent });
}
