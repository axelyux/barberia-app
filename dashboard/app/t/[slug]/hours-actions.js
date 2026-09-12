"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireTenantSession } from "@/lib/auth";
import { TIME_ZONES } from "@/lib/scheduling";
import { problem } from "@/lib/action-result";

// days: [{ weekday, isClosed, openMin, closeMin }, ...] (7 entradas, una por día)
// minNoticeMin: minutos de anticipación mínima para aceptar una cita por WhatsApp.
// timeZone: zona horaria de la barbería; de ella dependen los horarios y a qué día
// pertenece cada venta, así que se valida contra la lista conocida.
export async function updateBusinessHours(slug, days, minNoticeMin, timeZone) {
    const { tenantId } = await requireTenantSession(slug, "SEGURIDAD", "edit");
    if (timeZone && !TIME_ZONES.some((z) => z.value === timeZone)) {
        return problem("Esa zona horaria no es válida.");
    }

    for (const d of days) {
        await prisma.businessHour.upsert({
            where: { tenantId_weekday: { tenantId, weekday: d.weekday } },
            update: { isClosed: !!d.isClosed, openMin: d.openMin, closeMin: d.closeMin },
            create: { tenantId, weekday: d.weekday, isClosed: !!d.isClosed, openMin: d.openMin, closeMin: d.closeMin },
        });
    }

    if (minNoticeMin !== undefined || timeZone) {
        await prisma.tenant.update({
            where: { id: tenantId },
            data: {
                ...(minNoticeMin !== undefined ? { bookingMinNoticeMin: Math.max(0, Math.min(1440, Math.round(minNoticeMin) || 0)) } : {}),
                ...(timeZone ? { timeZone } : {}),
            },
        });
    }
    revalidatePath(`/t/${slug}`);
}
