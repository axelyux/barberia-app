import Image from "next/image";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 px-6 text-center">
            <div className="flex flex-col items-center gap-3">
                <div className="relative">
                    <div className="absolute inset-0 -z-10 rounded-full bg-amber-500/20 blur-2xl" />
                    <Image src="/logo-mibarber.png" alt="MiBarber" width={72} height={72} priority className="rounded-2xl shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]" />
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-400">MiBarber</p>
                    <h1 className="mt-2 text-2xl font-bold text-zinc-50">Inicia sesión</h1>
                    <p className="mt-1 text-sm text-zinc-500">Panel de tu barbería</p>
                </div>
            </div>
            <LoginForm />
        </main>
    );
}
