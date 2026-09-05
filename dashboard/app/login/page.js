import Image from "next/image";
import LoginForm from "@/components/LoginForm";

const REASON_MESSAGES = {
    suspended: { tone: "bad", text: "Esta barbería fue desactivada. Contacta a tu administrador." },
    expired: { tone: "warn", text: "Tu sesión ya no es válida. Inicia sesión de nuevo." },
};

export default async function LoginPage({ searchParams }) {
    const { reason } = await searchParams;
    const notice = REASON_MESSAGES[reason];

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
            {notice ? (
                <p
                    className={`w-full max-w-xs rounded-lg border px-3.5 py-2.5 text-sm font-semibold ${
                        notice.tone === "bad" ? "border-red-800/40 bg-red-500/10 text-red-300" : "border-orange-800/40 bg-orange-500/10 text-orange-300"
                    }`}
                >
                    {notice.text}
                </p>
            ) : null}
            <LoginForm />
        </main>
    );
}
