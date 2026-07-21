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
    const plainTenants = tenants.map((t) => ({
        ...t,
        nextDueDate: t.nextDueDate ? t.nextDueDate.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
    }));

    return (
        <main className="min-h-screen bg-zinc-950">
            <AdminBoard tenants={plainTenants} monthlyRevenueCents={monthlyRevenueCents} adminName={admin.name} />
        </main>
    );
}
