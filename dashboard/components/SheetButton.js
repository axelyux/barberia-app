"use client";

const VARIANTS = {
    primary: "bg-amber-500 text-zinc-950 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset] hover:bg-amber-400 active:bg-amber-500",
    brand: "shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]",
    good: "border border-emerald-800/60 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15",
    ghost: "border border-zinc-700/80 bg-zinc-800/50 text-zinc-100 hover:bg-zinc-800 active:bg-zinc-800/80",
    danger: "border border-red-800/60 bg-red-500/10 text-red-400 hover:bg-red-500/15",
};

export default function SheetButton({ variant = "ghost", children, className = "", style, ...props }) {
    return (
        <button
            style={style}
            className={`min-h-11 w-full rounded-lg text-sm font-bold tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
