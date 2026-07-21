"use client";

import { useEffect, useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput } from "@/components/FormField";
import { money, shortDateTime, shortDate, toDateInputValue, contrastText } from "@/lib/format";
import { createCustomer, updateCustomer, deleteCustomer, getCustomerHistory } from "@/app/t/[slug]/customer-actions";

const HISTORY_KIND_LABEL = { booking: "Cita", product: "Producto", service: "Servicio" };

function BarberSelect({ barbers, value, onChange, disabled }) {
    if (barbers.length === 0) return null;
    return (
        <Field label="Barbero preferido (opcional)">
            <select
                value={value}
                onChange={onChange}
                disabled={disabled}
                className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none disabled:opacity-50"
            >
                <option value="">Sin preferencia</option>
                {barbers.map((b) => (
                    <option key={b.id} value={b.id}>
                        {b.name}
                    </option>
                ))}
            </select>
        </Field>
    );
}

function CustomerHistory({ customerId, slug }) {
    const [history, setHistory] = useState(null);

    useEffect(() => {
        let cancelled = false;
        getCustomerHistory(customerId, slug).then((data) => {
            if (!cancelled) setHistory(data);
        });
        return () => {
            cancelled = true;
        };
    }, [customerId, slug]);

    if (!history) return <p className="mt-3 text-xs text-zinc-500">Cargando historial…</p>;

    return (
        <div className="mt-4 border-t border-zinc-800 pt-3">
            <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="font-bold uppercase tracking-wide text-zinc-500">Historial</span>
                <span className="text-zinc-400">
                    {history.visits} visitas · {money(history.totalSpentCents)} gastado
                </span>
            </div>
            {history.entries.length === 0 ? (
                <p className="text-sm text-zinc-500">Todavía no tiene citas ni compras registradas.</p>
            ) : (
                <div className="flex flex-col gap-2">
                    {history.entries.map((e) => (
                        <div key={`${e.kind}-${e.id}`} className="flex items-center justify-between text-sm">
                            <div className="min-w-0">
                                <p className="truncate text-zinc-200">
                                    {e.name}{" "}
                                    <span className="text-xs text-zinc-500">
                                        ({HISTORY_KIND_LABEL[e.kind]}
                                        {e.kind === "booking" && e.status !== "COMPLETED" ? ` · ${e.status === "CANCELLED" ? "cancelada" : "pendiente"}` : ""})
                                    </span>
                                </p>
                                <p className="text-[11px] text-zinc-500">{shortDateTime(e.createdAt)}</p>
                            </div>
                            <span className="font-numeric shrink-0 text-zinc-300">{money(e.priceCents)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function CreateCustomerForm({ barbers, brandStyle, isPending, error, onSave, onCancel }) {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [notes, setNotes] = useState("");
    const [email, setEmail] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [preferredBarberId, setPreferredBarberId] = useState("");

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre">
                    <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Carlos Medina" />
                </Field>
                <Field label="Teléfono">
                    <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej. 5512345678" />
                </Field>
                <Field label="Correo (opcional)">
                    <TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ej. carlos@correo.com" />
                </Field>
                <Field label="Cumpleaños (opcional)">
                    <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none"
                    />
                </Field>
                <BarberSelect barbers={barbers} value={preferredBarberId} onChange={(e) => setPreferredBarberId(e.target.value)} />
                <Field label="Notas (opcional)">
                    <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Alérgico a X producto" />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    disabled={isPending}
                    onClick={() => onSave({ name, phone, notes, email, birthDate: birthDate || null, preferredBarberId })}
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

function EditCustomerForm({ customer, barbers, slug, brandStyle, isPending, error, canEdit, canDelete, onSave, onDelete }) {
    const [name, setName] = useState(customer.name);
    const [phone, setPhone] = useState(customer.phone);
    const [notes, setNotes] = useState(customer.notes ?? "");
    const [email, setEmail] = useState(customer.email ?? "");
    const [birthDate, setBirthDate] = useState(customer.birthDate ? toDateInputValue(customer.birthDate) : "");
    const [preferredBarberId, setPreferredBarberId] = useState(customer.preferredBarberId ?? "");

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre">
                    <TextInput disabled={!canEdit} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Teléfono">
                    <TextInput disabled={!canEdit} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field label="Correo (opcional)">
                    <TextInput disabled={!canEdit} value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Cumpleaños (opcional)">
                    <input
                        type="date"
                        disabled={!canEdit}
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                    />
                </Field>
                <BarberSelect barbers={barbers} value={preferredBarberId} onChange={(e) => setPreferredBarberId(e.target.value)} disabled={!canEdit} />
                <Field label="Notas (opcional)">
                    <TextInput disabled={!canEdit} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            {canEdit || canDelete ? (
                <div className="mt-4 flex flex-col gap-2">
                    {canEdit ? (
                        <SheetButton
                            variant="brand"
                            style={brandStyle}
                            disabled={isPending}
                            onClick={() => onSave({ name, phone, notes, email, birthDate: birthDate || null, preferredBarberId })}
                        >
                            Guardar cambios
                        </SheetButton>
                    ) : null}
                    {canDelete ? (
                        <SheetButton variant="danger" disabled={isPending} onClick={onDelete}>
                            Eliminar
                        </SheetButton>
                    ) : null}
                </div>
            ) : null}

            <CustomerHistory customerId={customer.id} slug={slug} />
        </>
    );
}

export default function CustomersEditor({ customers, barbers = [], slug, brandColor, perms }) {
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const editing = customers.find((c) => c.id === editingId) ?? null;
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
                <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Clientes</p>
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

            <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3.5">
                {customers.map((c) => (
                    <button
                        key={c.id}
                        onClick={() => {
                            setError("");
                            setEditingId(c.id);
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-zinc-800 py-3 text-left last:border-b-0"
                    >
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-zinc-50">{c.name}</p>
                            <p className="truncate text-xs text-zinc-500">
                                {c.notes || (c.birthDate ? `🎂 ${shortDate(c.birthDate)}` : "Sin notas")}
                            </p>
                        </div>
                        <span className="font-numeric shrink-0 text-sm text-zinc-400">{c.phone}</span>
                    </button>
                ))}
                {customers.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Todavía no agregas clientes.</p> : null}
            </div>

            {perms.canAdd ? (
                <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Agregar cliente">
                    {createOpen ? (
                        <CreateCustomerForm
                            barbers={barbers}
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setCreateOpen(false)}
                            onSave={(data) => run(() => createCustomer(slug, data), () => setCreateOpen(false))}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}

            <BottomSheet open={!!editing} onClose={() => setEditingId(null)} title={editing?.name}>
                {editing ? (
                    <EditCustomerForm
                        key={editing.id}
                        customer={editing}
                        barbers={barbers}
                        slug={slug}
                        brandStyle={brandStyle}
                        isPending={isPending}
                        error={error}
                        canEdit={perms.canEdit}
                        canDelete={perms.canDelete}
                        onSave={(data) => run(() => updateCustomer(editing.id, slug, data))}
                        onDelete={() => run(() => deleteCustomer(editing.id, slug), () => setEditingId(null))}
                    />
                ) : null}
            </BottomSheet>
        </div>
    );
}
