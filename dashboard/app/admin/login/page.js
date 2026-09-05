import Image from "next/image";
import LoginForm from "@/components/LoginForm";
import { loginAdmin } from "@/app/admin/login/actions";

export default function AdminLoginPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 px-6 text-center">
            <div className="flex flex-col items-center gap-3">
                <Image src="/logo-mibarber.png" alt="MiBarber" width={64} height={64} priority className="rounded-2xl shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]" />
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-400">MiBarber</p>
                    <h1 className="mt-2 text-2xl font-bold text-zinc-50">Panel Admin</h1>
                    <p className="mt-1 text-sm text-zinc-500">Acceso exclusivo del dueño de la plataforma</p>
                </div>
            </div>
            <LoginForm action={loginAdmin} showTenantField={false} />
        </main>
    );
}
