"use client";
import { friendlyError } from "@/lib/errors";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { money, contrastText } from "@/lib/format";

const emptyForm = { name: "", price: "", extra: "", extra2: "", active: true };

function itemToForm(item, extraKey, extra2Key) {
    return {
        name: item.name,
        price: String(item.priceCents / 100),
        extra: String(item[extraKey]),
        extra2: extra2Key ? String(item[extra2Key]) : "",
        active: item.active,
    };
}

function CreateItemForm({ title, extra, extra2, brandStyle, isPending, error, onSave, onCancel }) {
    const [form, setForm] = useState(emptyForm);

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre">
                    <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={`Ej. ${title}`} />
                </Field>
                <Field label="Precio (MXN)">
                    <NumberInput value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} min="0" />
                </Field>
                <Field label={extra.label}>
                    <NumberInput value={form.extra} onChange={(e) => setForm((f) => ({ ...f, extra: e.target.value }))} min="0" />
                </Field>
                {extra2 ? (
                    <Field label={extra2.label}>
                        <NumberInput value={form.extra2} onChange={(e) => setForm((f) => ({ ...f, extra2: e.target.value }))} min="0" />
                    </Field>
                ) : null}
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    loading={isPending}
                    onClick={() =>
                        onSave({
                            name: form.name,
                            priceCents: Math.round(parseFloat(form.price || "0") * 100),
                            [extra.key]: parseFloat(form.extra || "0"),
                            ...(extra2 ? { [extra2.key]: parseFloat(form.extra2 || "0") } : {}),
                        })
                    }
                >
                    Guardar
                </SheetButton>
                <SheetButton variant="ghost" onClick={onCancel}>
                    Cancelar
                </SheetButton>
            </div>
        </>
    );
}

function EditItemForm({ item, extra, extra2, brandStyle, isPending, error, canEdit, canDelete, onSave, onDelete }) {
    const [form, setForm] = useState(() => itemToForm(item, extra.key, extra2?.key));

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre">
                    <TextInput disabled={!canEdit} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Precio (MXN)">
                    <NumberInput disabled={!canEdit} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} min="0" />
                </Field>
                <Field label={extra.label}>
                    <NumberInput disabled={!canEdit} value={form.extra} onChange={(e) => setForm((f) => ({ ...f, extra: e.target.value }))} min="0" />
                </Field>
                {extra2 ? (
                    <Field label={extra2.label}>
                        <NumberInput disabled={!canEdit} value={form.extra2} onChange={(e) => setForm((f) => ({ ...f, extra2: e.target.value }))} min="0" />
                    </Field>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={form.active}
                        onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                        className="h-4 w-4 rounded-sm border-zinc-600 bg-zinc-800"
                    />
                    Visible para los clientes
                </label>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            {canEdit || canDelete ? (
                <div className="mt-4 flex flex-col gap-2">
                    {canEdit ? (
                        <SheetButton
                            variant="brand"
                            style={brandStyle}
                            loading={isPending}
                            onClick={() =>
                                onSave({
                                    name: form.name,
                                    priceCents: Math.round(parseFloat(form.price || "0") * 100),
                                    [extra.key]: parseFloat(form.extra || "0"),
                                    ...(extra2 ? { [extra2.key]: parseFloat(form.extra2 || "0") } : {}),
                                    active: form.active,
                                })
                            }
                        >
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

export default function CatalogList({ title, emptyLabel, items, slug, brandColor, extra, extra2, lowStockCheck, perms, onCreate, onUpdate, onDelete }) {
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();

    const editing = items.find((i) => i.id === editingId) ?? null;
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };

    const run = (fn, onDone) => {
        setError("");
        startTransition(async () => {
            try {
                await fn();
                onDone?.();
            } catch (err) {
                setError(friendlyError(err));
            }
        });
    };

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{title}</p>
                {perms.canAdd ? (
                    <button
                        onClick={() => {
                            setError("");
                            setCreateOpen(true);
                        }}
                        style={brandStyle}
                        className="flex h-8 items-center gap-1 rounded-md px-3 text-xs font-bold"
                    >
                        + Agregar
                    </button>
                ) : null}
            </div>

            {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                    {emptyLabel}
                </div>
            ) : (
                <div className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 shadow-[var(--shadow-panel)]">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => {
                                setError("");
                                setEditingId(item.id);
                            }}
                            className="flex w-full items-center justify-between gap-2 border-b border-white/10 py-3 text-left last:border-b-0"
                        >
                            <div className="min-w-0">
                                <p className={`truncate text-sm font-bold ${item.active ? "text-zinc-50" : "text-zinc-500 line-through"}`}>
                                    {item.name}
                                    {lowStockCheck?.(item) ? (
                                        <span className="ml-1.5 rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                                            stock bajo
                                        </span>
                                    ) : null}
                                </p>
                                <p className="text-xs text-zinc-400">
                                    {item[extra.key]} {extra.suffix}
                                    {!item.active ? " · inactivo" : ""}
                                </p>
                            </div>
                            <span className="font-numeric shrink-0 font-bold text-zinc-100">{money(item.priceCents)}</span>
                        </button>
                    ))}
                </div>
            )}

            {perms.canAdd ? (
                <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title={`Agregar ${title.toLowerCase()}`}>
                    {createOpen ? (
                        <CreateItemForm
                            title={title.toLowerCase()}
                            extra={extra}
                            extra2={extra2}
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setCreateOpen(false)}
                            onSave={(data) => run(() => onCreate(slug, data), () => setCreateOpen(false))}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}

            <BottomSheet open={!!editing} onClose={() => setEditingId(null)} title={editing?.name}>
                {editing ? (
                    <EditItemForm
                        key={editing.id}
                        item={editing}
                        extra={extra}
                        extra2={extra2}
                        brandStyle={brandStyle}
                        isPending={isPending}
                        error={error}
                        canEdit={perms.canEdit}
                        canDelete={perms.canDelete}
                        onSave={(data) => run(() => onUpdate(editing.id, slug, data))}
                        onDelete={() => run(() => onDelete(editing.id, slug), () => setEditingId(null))}
                    />
                ) : null}
            </BottomSheet>
        </div>
    );
}
