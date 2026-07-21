import { redirect } from "next/navigation";
import { getSessionUser, getSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
    const admin = await getSuperAdmin();
    if (admin) redirect("/admin");

    const staff = await getSessionUser();
    if (staff) redirect(`/t/${staff.tenant.slug}`);

    redirect("/login");
}
