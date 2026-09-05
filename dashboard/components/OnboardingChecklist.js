"use client";

import { useEffect, useState } from "react";

export default function OnboardingChecklist({ tenantSlug, brandColor, steps }) {
    const storageKey = `onboarding-dismissed-${tenantSlug}`;
    const [dismissed, setDismissed] = useState(true);

    // Lee localStorage solo en el cliente (evita desajuste de hidratación SSR/cliente).
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador
        setDismissed(localStorage.getItem(storageKey) === "1");
    }, [storageKey]);

    const pending = steps.filter((s) => !s.done);
    if (dismissed || pending.length === 0) return null;

    const dismiss = () => {
        localStorage.setItem(storageKey, "1");
        setDismissed(true);
    };

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-[var(--shadow-panel)]">
            <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Primeros pasos</p>
                <button onClick={dismiss} className="text-xs text-zinc-600 underline">
                    ocultar
                </button>
            </div>
            <div className="flex flex-col gap-2.5">
                {steps.map((step) => (
                    <div key={step.label} className="flex items-center gap-2.5 text-sm">
                        <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
                            style={
                                step.done
                                    ? { background: brandColor, borderColor: brandColor, color: "#0a0a0a" }
                                    : { borderColor: "#3f3f46", color: "#71717a" }
                            }
                        >
                            {step.done ? "✓" : ""}
                        </span>
                        <span className={step.done ? "text-zinc-500 line-through" : "text-zinc-200"}>{step.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
