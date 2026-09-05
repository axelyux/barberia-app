import Image from "next/image";
import Link from "next/link";

// Se muestra para cualquier URL que no exista, o cuando una página llama a notFound()
// (ej. /t/[slug]/page.js cuando el slug no corresponde a ninguna barbería real).
export default function NotFound() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
            <Image src="/logo-mibarber.png" alt="MiBarber" width={64} height={64} className="rounded-2xl shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]" />
            <div>
                <p className="font-numeric text-sm font-bold text-zinc-600">404</p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-50">No encontramos esta página</h1>
                <p className="mt-1.5 max-w-xs text-sm text-zinc-500">
                    Revisa que la dirección esté bien escrita, o vuelve al inicio.
                </p>
            </div>
            <Link
                href="/"
                className="mt-1 flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-6 text-sm font-bold text-zinc-950 shadow-[0_1px_0_rgba(255,255,255,0.2)_inset] transition-[filter] hover:brightness-95"
            >
                Ir al inicio
            </Link>
        </main>
    );
}
