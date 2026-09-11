"use client";

const VARIANTS = {
    primary: "bg-amber-500 text-zinc-950 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset] hover:bg-amber-400 active:bg-amber-500",
    brand: "shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]",
    good: "border border-emerald-800/60 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15",
    ghost: "border border-zinc-700/80 bg-zinc-800/50 text-zinc-100 hover:bg-zinc-800 active:bg-zinc-800/80",
    danger: "border border-red-800/60 bg-red-500/10 text-red-400 hover:bg-red-500/15",
};

// "loading" (aparte de "disabled") agrega el circulito girando — se usa para distinguir
// "deshabilitado porque no tienes permiso" de "deshabilitado porque se está procesando",
// que antes se veían exactamente igual y no había forma de saber si tu clic sí hizo algo.
export default function SheetButton({ variant = "ghost", children, className = "", style, loading = false, disabled, ...props }) {
    return (
        <button
            style={style}
            disabled={disabled || loading}
            className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-bold tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
            {...props}
        >
            {loading ? (
                <svg viewBox="0 0 24 24" className="btn-spinner h-4 w-4 shrink-0" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
            ) : null}
            {children}
        </button>
    );
}
