import Link from "next/link";

export default function Home() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 px-6 text-center">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Barber SaaS</p>
                <h1 className="mt-2 text-2xl font-bold text-zinc-50">¿A qué panel quieres entrar?</h1>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-3">
                <Link
                    href="/admin"
                    className="flex min-h-11 items-center justify-center rounded-md bg-amber-500 text-sm font-bold text-zinc-950"
                >
                    Panel Admin
                </Link>
                <Link
                    href="/t/sable-barber-studio"
                    className="flex min-h-11 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-sm font-bold text-zinc-100"
                >
                    Panel Barbería · Sable Barber Studio
                </Link>
            </div>
        </main>
    );
}
