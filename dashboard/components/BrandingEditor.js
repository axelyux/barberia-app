"use client";

import { useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput, ColorPicker, ImagePicker } from "@/components/FormField";
import { contrastText } from "@/lib/format";
import { updateBranding } from "@/app/t/[slug]/catalog-actions";

export default function BrandingEditor({ tenant, perms }) {
    const [form, setForm] = useState({ name: tenant.name, logoUrl: tenant.logoUrl ?? "", brandColor: tenant.brandColor });
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();

    const save = () => {
        setError("");
        setSaved(false);
        startTransition(async () => {
            try {
                await updateBranding(tenant.slug, form);
                setSaved(true);
            } catch (err) {
                setError(err?.message ?? "⚠️ Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Tu marca</p>
            <div className="rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-[var(--shadow-panel)]">
                <div className="mb-4 flex items-center gap-3">
                    <Avatar name={form.name || tenant.name} logoUrl={form.logoUrl} color={form.brandColor} size={48} square />
                    <p className="text-xs text-zinc-400">Así se ve tu ícono en el panel de administración.</p>
                </div>

                <div className="flex flex-col gap-3">
                    <Field label="Nombre de tu barbería">
                        <TextInput disabled={!perms.canEdit} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                    </Field>
                    <Field label="Logo (opcional)">
                        <ImagePicker value={form.logoUrl} onChange={(v) => setForm((f) => ({ ...f, logoUrl: v }))} />
                    </Field>
                    <Field label="Color de tu marca">
                        <ColorPicker value={form.brandColor} onChange={(v) => setForm((f) => ({ ...f, brandColor: v }))} />
                    </Field>
                </div>

                {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
                {saved && !isPending ? <p className="mt-3 text-sm text-emerald-400">Guardado.</p> : null}

                {perms.canEdit ? (
                    <div className="mt-4">
                        <SheetButton
                            variant="brand"
                            style={{ background: form.brandColor, color: contrastText(form.brandColor) }}
                            loading={isPending}
                            onClick={save}
                        >
                            Guardar marca
                        </SheetButton>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
