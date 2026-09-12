"use client";
import { friendlyError } from "@/lib/errors";

import { useState, useTransition } from "react";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { setPaymentMethodActive } from "@/app/t/[slug]/payment-actions";
import { useToast } from "@/components/Toast";

export default function PaymentMethodsEditor({ initialStatus, slug, perms }) {
    const [status, setStatus] = useState(initialStatus);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const showToast = useToast();

    const toggle = (method, active) => {
        // Efectivo nunca se puede apagar — ni se manda la petición, para que no dependa
        // solo de la validación del servidor.
        if (method === "EFECTIVO" && !active) return;

        setError("");
        setStatus((prev) => prev.map((s) => (s.method === method ? { ...s, active } : s)));
        startTransition(async () => {
            try {
                await setPaymentMethodActive(slug, { method, active });
                showToast(active ? "Método activado" : "Método desactivado");
            } catch (err) {
                setStatus((prev) => prev.map((s) => (s.method === method ? { ...s, active: !active } : s)));
                setError(friendlyError(err));
            }
        });
    };

    return (
        <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Métodos de pago</p>
            <div className="rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-[var(--shadow-panel)]">
                <p className="mb-3 text-xs text-zinc-500">
                    Desactiva los que no aceptes — dejan de aparecer al cobrar. Efectivo siempre se queda activo.
                </p>
                <div className="flex flex-col divide-y divide-white/10">
                    {status.map((s) => {
                        const isCash = s.method === "EFECTIVO";
                        return (
                            <div key={s.method} className="flex items-center justify-between py-2.5">
                                <span className={`text-[13.5px] ${s.active ? "text-zinc-100" : "text-zinc-500"}`}>
                                    {PAYMENT_METHOD_LABELS[s.method]}
                                    {isCash ? <span className="ml-1.5 text-[10px] font-bold uppercase text-zinc-600">fijo</span> : null}
                                </span>
                                <button
                                    role="switch"
                                    aria-checked={s.active}
                                    disabled={!perms.canEdit || isCash || isPending}
                                    onClick={() => toggle(s.method, !s.active)}
                                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${
                                        s.active ? "bg-emerald-600" : "bg-zinc-700"
                                    } ${isCash ? "opacity-50" : ""}`}
                                >
                                    <span
                                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                                            s.active ? "translate-x-[22px]" : "translate-x-0.5"
                                        }`}
                                    />
                                </button>
                            </div>
                        );
                    })}
                </div>
                {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            </div>
        </div>
    );
}
