"use client";

import { useState, useTransition } from "react";
import { saveFlowMessages } from "@/app/t/[slug]/bot-actions";

const STEPS = [
    { key: "WELCOME", label: "Saludo inicial" },
    { key: "SERVICES_INTRO", label: "Al pedir servicios" },
    { key: "BOOKING_ASK_DAY", label: "Al agendar · pregunta el día" },
    { key: "BOOKING_ASK_TIME", label: "Al agendar · pregunta la hora" },
    { key: "BOOKING_CONFIRMED", label: "Cita confirmada" },
    { key: "CONTACT", label: "Mensaje de contacto" },
];

function Bubble({ value, onChange, disabled }) {
    return (
        <div className="rounded-xl bg-[#0b141a] p-3.5 shadow-[var(--shadow-panel)]">
            <div className="relative ml-0 mr-auto max-w-[92%] rounded-lg rounded-tl-none bg-[#202c33] px-3 py-2 shadow">
                <span className="absolute -left-[7px] top-0 h-0 w-0 border-y-[7px] border-r-[8px] border-y-transparent border-r-[#202c33]" />
                <textarea
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    rows={3}
                    className="w-full resize-none bg-transparent text-[13.5px] leading-snug text-[#e9edef] placeholder:text-zinc-500 focus:outline-none disabled:opacity-70"
                />
                <div className="mt-1 text-right text-[10px] text-[#8696a0]">10:41</div>
            </div>
        </div>
    );
}

export default function FlowEditor({ initialMessages, brandColor, slug, perms }) {
    const [messages, setMessages] = useState(initialMessages);
    const [error, setError] = useState("");
    const [savedAt, setSavedAt] = useState(null);
    const [isPending, startTransition] = useTransition();

    const setText = (key, text) => setMessages((m) => ({ ...m, [key]: text }));

    const save = () => {
        setError("");
        startTransition(async () => {
            try {
                await saveFlowMessages(slug, messages);
                setSavedAt(new Date());
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Mensajes del bot</p>
            <p className="mb-3 text-xs text-zinc-500">
                Así le contesta tu bot a los clientes en cada paso. Edita directo sobre la burbuja.
            </p>

            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs leading-relaxed text-amber-200/90">
                    <b>No enumeres opciones con números.</b> El menú, los servicios y los horarios se envían como
                    botones y listas que el cliente toca — si escribes “responde 1, 2 o 3” lo vas a confundir.
                </p>
            </div>

            <div className="flex flex-col gap-3.5">
                {STEPS.map((step) => (
                    <div key={step.key} className="rounded-xl border border-white/10 bg-zinc-900 p-2.5 shadow-[var(--shadow-panel)]">
                        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">{step.label}</p>
                        <Bubble
                            value={messages[step.key] ?? ""}
                            disabled={!perms.canEdit}
                            onChange={(e) => setText(step.key, e.target.value)}
                        />
                    </div>
                ))}
            </div>

            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            {perms.canEdit ? (
                <>
                    <button
                        onClick={save}
                        disabled={isPending}
                        style={{ background: brandColor }}
                        className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-bold tracking-tight text-zinc-950 disabled:opacity-50"
                    >
                        {isPending ? "Guardando…" : "Guardar mensajes"}
                    </button>
                    {savedAt ? <p className="mt-2 text-center text-[11px] text-emerald-500">Guardado — tu bot ya usa estos mensajes.</p> : null}
                </>
            ) : null}
        </div>
    );
}
