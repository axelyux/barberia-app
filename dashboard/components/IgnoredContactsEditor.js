"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput } from "@/components/FormField";
import { contrastText } from "@/lib/format";
import { createIgnoredContact, deleteIgnoredContact } from "@/app/t/[slug]/bot-actions";

export default function IgnoredContactsEditor({ contacts, slug, brandColor, perms }) {
    const [open, setOpen] = useState(false);
    const [phone, setPhone] = useState("");
    const [label, setLabel] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };

    const submit = () => {
        setError("");
        startTransition(async () => {
            try {
                await createIgnoredContact(slug, { phone, label });
                setOpen(false);
                setPhone("");
                setLabel("");
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
            }
        });
    };

    const remove = (id) => startTransition(() => deleteIgnoredContact(id, slug));

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Contactos que el bot ignora</p>
                {perms.canAdd ? (
                    <button onClick={() => setOpen(true)} style={brandStyle} className="flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-bold">
                        + Agregar
                    </button>
                ) : null}
            </div>
            <p className="mb-2.5 text-xs text-zinc-500">
                Útil si usas tu número personal: agrega aquí a tus contactos guardados (familia, amigos) para que el bot nunca les conteste — solo a tus clientes.
            </p>
            {contacts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                    No has agregado ningún contacto a ignorar.
                </p>
            ) : (
                <div className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 shadow-[var(--shadow-panel)]">
                    {contacts.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-2 border-b border-white/10 py-2.5 text-sm last:border-b-0">
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-zinc-100">{c.label || "Sin nombre"}</p>
                                <p className="font-numeric text-[11.5px] text-zinc-500">{c.phone}</p>
                            </div>
                            {perms.canDelete ? (
                                <button onClick={() => remove(c.id)} disabled={isPending} className="shrink-0 text-xs text-zinc-500 underline underline-offset-2 disabled:opacity-50">
                                    quitar
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            <BottomSheet open={open} onClose={() => setOpen(false)} title="Ignorar contacto">
                <div className="flex flex-col gap-3">
                    <Field label="Número (con código de país)">
                        <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5218331234567" />
                    </Field>
                    <Field label="Nombre (opcional, para reconocerlo después)">
                        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. Mi hermano" />
                    </Field>
                </div>
                {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
                <div className="mt-4 flex flex-col gap-2">
                    <SheetButton variant="brand" style={brandStyle} disabled={isPending} onClick={submit}>
                        Guardar
                    </SheetButton>
                    <SheetButton variant="ghost" onClick={() => setOpen(false)}>
                        Cancelar
                    </SheetButton>
                </div>
            </BottomSheet>
        </div>
    );
}
