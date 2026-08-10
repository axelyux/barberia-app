import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 px-6 text-center">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">MiBarber</p>
                <h1 className="mt-2 text-2xl font-bold text-zinc-50">Inicia sesión</h1>
                <p className="mt-1 text-sm text-zinc-500">Panel de tu barbería</p>
            </div>
            <LoginForm />
        </main>
    );
}
