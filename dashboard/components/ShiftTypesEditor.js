"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput } from "@/components/FormField";
import { contrastText } from "@/lib/format";
import { createShiftType, updateShiftType, deleteShiftType } from "@/app/t/[slug]/shift-actions";

function CreateForm({ brandStyle, isPending, error, onSave, onCancel }) {
    const [name, setName] = useState("");
    return (
        <>
            <Field label="Nombre del turno">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tarde" />
            </Field>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton variant="brand" style={brandStyle} loading={isPending} onClick={() => onSave({ name })}>
                    Guardar
                </SheetButton>
                <SheetButton variant="ghost" onClick={onCancel}>
                    Cancelar
                </SheetButton>
            </div>
        </>
    );
}

function EditForm({ shiftType, brandStyle, isPending, error, canEdit, canDelete, onSave, onDelete }) {
    const [name, setName] = useState(shiftType.name);
    const [active, setActive] = useState(shiftType.active);
    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre del turno">
                    <TextInput disabled={!canEdit} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                        className="h-4 w-4 rounded-sm border-zinc-600 bg-zinc-800"
                    />
                    Disponible para elegir al abrir caja
                </label>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            {canEdit || canDelete ? (
                <div className="mt-4 flex flex-col gap-2">
                    {canEdit ? (
                        <SheetButton variant="brand" style={brandStyle} loading={isPending} onClick={() => onSave({ name, active })}>
                            Guardar cambios
                        </SheetButton>
                    ) : null}
                    {canDelete ? (
                        <SheetButton variant="danger" loading={isPending} onClick={onDelete}>
                            Eliminar
                        </SheetButton>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}

export default function ShiftTypesEditor({ shiftTypes, slug, brandColor, perms }) {
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const editing = shiftTypes.find((t) => t.id === editingId) ?? null;
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };

    const run = (fn, onDone) => {
        setError("");
        startTransition(async () => {
            try {
                await fn();
                onDone?.();
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Tipos de turno</p>
                {perms.canAdd ? (
                    <button
                        onClick={() => {
                            setError("");
                            setCreateOpen(true);
                        }}
                        style={brandStyle}
                        className="flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-bold"
                    >
                        + Agregar
                    </button>
                ) : null}
            </div>

            {shiftTypes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                    Sin turnos configurados (ej. Mañana, Tarde, Día completo).
                </p>
            ) : (
                <div className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 shadow-[var(--shadow-panel)]">
                    {shiftTypes.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => {
                                setError("");
                                setEditingId(t.id);
                            }}
                            className="flex w-full items-center justify-between gap-2 border-b border-white/10 py-3 text-left last:border-b-0"
                        >
                            <p className={`text-sm font-bold ${t.active ? "text-zinc-50" : "text-zinc-500 line-through"}`}>{t.name}</p>
                        </button>
                    ))}
                </div>
            )}

            {perms.canAdd ? (
                <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Agregar turno">
                    {createOpen ? (
                        <CreateForm
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setCreateOpen(false)}
                            onSave={(data) => run(() => createShiftType(slug, data), () => setCreateOpen(false))}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}

            <BottomSheet open={!!editing} onClose={() => setEditingId(null)} title={editing?.name}>
                {editing ? (
                    <EditForm
                        key={editing.id}
                        shiftType={editing}
                        brandStyle={brandStyle}
                        isPending={isPending}
                        error={error}
                        canEdit={perms.canEdit}
                        canDelete={perms.canDelete}
                        onSave={(data) => run(() => updateShiftType(editing.id, slug, data))}
                        onDelete={() => run(() => deleteShiftType(editing.id, slug), () => setEditingId(null))}
                    />
                ) : null}
            </BottomSheet>
        </div>
    );
}
