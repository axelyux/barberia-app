import LoginForm from "@/components/LoginForm";
import { loginAdmin } from "@/app/admin/login/actions";

export default function AdminLoginPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 px-6 text-center">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">MiBarber</p>
                <h1 className="mt-2 text-2xl font-bold text-zinc-50">Panel Admin</h1>
                <p className="mt-1 text-sm text-zinc-500">Acceso exclusivo del dueño de la plataforma</p>
            </div>
            <LoginForm action={loginAdmin} showTenantField={false} />
        </main>
    );
}
