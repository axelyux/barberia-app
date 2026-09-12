"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

// Confirmación visual reutilizable en toda la app ("Guardado", "Eliminado", etc., con un
// ícono en vez de emoji) — antes, guardar o borrar algo en varias pantallas (Ventas,
// Citas...) no daba ninguna señal de que sí funcionó; el usuario tenía que adivinar. Una
// sola cola de toasts en la raíz de la app, nada de estado repetido en cada formulario.
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const idRef = useRef(0);

    const showToast = useCallback((message, tone = "good") => {
        const id = ++idRef.current;
        setToasts((t) => [...t, { id, message, tone }]);
        setTimeout(() => {
            setToasts((t) => t.filter((x) => x.id !== id));
        }, 2200);
    }, []);

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        role="status"
                        className={`animate-toast-in flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13.5px] font-semibold shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl ${
                            t.tone === "bad"
                                ? "border-red-800/50 bg-red-950/90 text-red-200"
                                : "border-emerald-800/50 bg-emerald-950/90 text-emerald-200"
                        }`}
                    >
                        {t.tone === "bad" ? (
                            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-red-400" fill="none">
                                <path
                                    d="M10 6.5v4.5M10 14h.01"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-emerald-400" fill="none">
                                <path
                                    className="toast-check"
                                    d="M4 10.5l3.5 3.5L16 5"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        )}
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// Fuera de un ToastProvider (no debería pasar, pero por si acaso) no truena, solo no hace nada.
export function useToast() {
    const ctx = useContext(ToastContext);
    return ctx ?? (() => {});
}
