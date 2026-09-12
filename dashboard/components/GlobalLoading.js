"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

const LoadingContext = createContext(null);

// Overlay centrado y visible de "Cargando…" mientras CUALQUIER acción está en proceso en
// cualquier parte de la pantalla (guardar, borrar, exportar, lo que sea) — antes cada
// pantalla solo atenuaba su propio botón, algo fácil de no notar. Un contador compartido
// en vez de un booleano: si dos cosas cargan a la vez, el overlay no desaparece hasta que
// ambas terminen.
export function GlobalLoadingProvider({ children }) {
    const [count, setCount] = useState(0);

    return (
        <LoadingContext.Provider value={setCount}>
            {children}
            {count > 0 ? (
                <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
                    <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-4 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                        <svg viewBox="0 0 24 24" className="btn-spinner h-5 w-5 shrink-0 text-zinc-300" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        <span className="text-sm font-semibold text-zinc-200">Cargando…</span>
                    </div>
                </div>
            ) : null}
        </LoadingContext.Provider>
    );
}

// Se llama con el "isPending" que ya devuelve useTransition en cada pantalla — no duplica
// estado, solo avisa al overlay global cuándo empieza y cuándo termina.
export function useGlobalPending(isPending) {
    const setCount = useContext(LoadingContext);
    const wasPending = useRef(false);

    useEffect(() => {
        if (!setCount) return;
        if (isPending && !wasPending.current) {
            wasPending.current = true;
            setCount((c) => c + 1);
        } else if (!isPending && wasPending.current) {
            wasPending.current = false;
            setCount((c) => Math.max(0, c - 1));
        }
    }, [isPending, setCount]);

    // Si el componente se desmonta a medio "cargando" (ej. se cerró la hoja justo cuando
    // la acción terminaba), esto evita que el contador se quede atorado en 1 para siempre.
    useEffect(() => {
        return () => {
            if (wasPending.current && setCount) {
                setCount((c) => Math.max(0, c - 1));
                wasPending.current = false;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
