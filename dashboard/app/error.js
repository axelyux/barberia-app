"use client";

import { useEffect } from "react";
import Image from "next/image";

// Red de seguridad para cualquier error inesperado dentro de una página (no una falla de
// red — esa la cubre public/offline.html — sino un bug real del lado del servidor o del
// cliente). No se muestra el detalle técnico del error al usuario, solo se registra en
// la consola del servidor para no filtrar nada sensible.
export default function ErrorBoundary({ error, reset }) {
    useEffect(() => {
        console.error("❌ [error-boundary]", error);
    }, [error]);

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
            <Image src="/logo-mibarber.png" alt="MiBarber" width={64} height={64} className="rounded-2xl shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]" />
            <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-50">Algo salió mal</h1>
                <p className="mt-1.5 max-w-xs text-sm text-zinc-500">
                    Tuvimos un problema mostrando esta pantalla. Intenta de nuevo — si sigue pasando, contacta a soporte.
                </p>
            </div>
            <button
                onClick={() => reset()}
                className="mt-1 flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-6 text-sm font-bold text-zinc-950 shadow-[0_1px_0_rgba(255,255,255,0.2)_inset] transition-[filter] hover:brightness-95"
            >
                Reintentar
            </button>
        </main>
    );
}
