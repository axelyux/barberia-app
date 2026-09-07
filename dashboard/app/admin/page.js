import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSuperAdmin } from "@/lib/auth";
import AdminBoard from "@/components/AdminBoard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
    const admin = await getSuperAdmin();
    if (!admin) redirect("/admin/login");

    const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "asc" } });

    const monthlyRevenueCents = tenants
        .filter((t) => t.status === "ACTIVE")
        .reduce((sum, t) => sum + t.planPriceCents, 0);

    // Los Server Components no pueden pasar objetos Date a un Client Component sin serializar.
    // metaAccessToken es un secreto (permite mandar WhatsApp a nombre de la barbería) — nunca
    // se manda al navegador, solo un booleano de "ya tiene uno guardado o no".
    const plainTenants = tenants.map(({ metaAccessToken, ...t }) => ({
        ...t,
        nextDueDate: t.nextDueDate ? t.nextDueDate.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        hasMetaToken: !!metaAccessToken,
    }));

    return (
        <main className="min-h-screen bg-zinc-950">
            <AdminBoard tenants={plainTenants} monthlyRevenueCents={monthlyRevenueCents} adminName={admin.name} />
        </main>
    );
}
