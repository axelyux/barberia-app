"use client";
import { useGlobalPending } from "@/components/GlobalLoading";
import { friendlyError } from "@/lib/errors";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { money, contrastText } from "@/lib/format";
import { createBarber, updateBarber, deleteBarber } from "@/app/t/[slug]/barber-actions";

const PAYMENT_TYPE_LABELS = { COMISION: "Comisión", SUELDO: "Sueldo fijo", MIXTO: "Sueldo + comisión" };

function PaymentTypeSelect({ value, onChange, disabled }) {
    return (
        <select
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25 disabled:opacity-50"
        >
            {Object.entries(PAYMENT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                    {label}
                </option>
            ))}
        </select>
    );
}

function PaymentFields({ paymentType, commission, salary, onCommission, onSalary, disabled }) {
    return (
        <>
            {paymentType !== "SUELDO" ? (
                <Field label="Comisión (%)">
                    <NumberInput disabled={disabled} value={commission} onChange={(e) => onCommission(e.target.value)} min="0" max="100" />
                </Field>
            ) : null}
            {paymentType !== "COMISION" ? (
                <Field label="Sueldo fijo (MXN, quincenal)">
                    <NumberInput disabled={disabled} value={salary} onChange={(e) => onSalary(e.target.value)} min="0" />
                </Field>
            ) : null}
        </>
    );
}

function CreateBarberForm({ brandStyle, isPending, error, onSave, onCancel }) {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [specialty, setSpecialty] = useState("");
    const [paymentType, setPaymentType] = useState("COMISION");
    const [commission, setCommission] = useState("40");
    const [salary, setSalary] = useState("0");

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre">
                    <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Luis" />
                </Field>
                <Field label="Teléfono (opcional)">
                    <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej. 5512345678" />
                </Field>
                <Field label="Especialidad (opcional)">
                    <TextInput value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ej. Fades, diseño de barba" />
                </Field>
                <Field label="Tipo de pago">
                    <PaymentTypeSelect value={paymentType} onChange={(e) => setPaymentType(e.target.value)} />
                </Field>
                <PaymentFields paymentType={paymentType} commission={commission} salary={salary} onCommission={setCommission} onSalary={setSalary} />
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    loading={isPending}
                    onClick={() =>
                        onSave({ name, phone, specialty, paymentType, commissionPercent: commission, salaryCents: Math.round(parseFloat(salary || "0") * 100) })
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

function EditBarberForm({ barber, brandStyle, isPending, error, canEdit, canDelete, onSave, onDelete }) {
    const [name, setName] = useState(barber.name);
    const [phone, setPhone] = useState(barber.phone ?? "");
    const [specialty, setSpecialty] = useState(barber.specialty ?? "");
    const [paymentType, setPaymentType] = useState(barber.paymentType ?? "COMISION");
    const [commission, setCommission] = useState(String(barber.commissionPercent));
    const [salary, setSalary] = useState(String((barber.salaryCents ?? 0) / 100));
    const [active, setActive] = useState(barber.active);

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre">
                    <TextInput disabled={!canEdit} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Teléfono (opcional)">
                    <TextInput disabled={!canEdit} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field label="Especialidad (opcional)">
                    <TextInput disabled={!canEdit} value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
                </Field>
                <Field label="Tipo de pago">
                    <PaymentTypeSelect value={paymentType} onChange={(e) => setPaymentType(e.target.value)} disabled={!canEdit} />
                </Field>
                <PaymentFields
                    paymentType={paymentType}
                    commission={commission}
                    salary={salary}
                    onCommission={setCommission}
                    onSalary={setSalary}
                    disabled={!canEdit}
                />
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                        className="h-4 w-4 rounded-sm border-zinc-600 bg-zinc-800"
                    />
                    Activo (aparece para asignar en citas y ventas)
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
                                    name,
                                    phone,
                                    specialty,
                                    paymentType,
                                    commissionPercent: commission,
                                    salaryCents: Math.round(parseFloat(salary || "0") * 100),
                                    active,
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

export default function BarbersEditor({ barbers, slug, brandColor, perms }) {
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    useGlobalPending(isPending);
    const editing = barbers.find((b) => b.id === editingId) ?? null;
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
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Barberos</p>
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

            {barbers.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                    Todavía no agregas barberos.
                </p>
            ) : (
                <div className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 shadow-[var(--shadow-panel)]">
                    {barbers.map((b) => (
                        <button
                            key={b.id}
                            onClick={() => {
                                setError("");
                                setEditingId(b.id);
                            }}
                            className="flex w-full items-center justify-between gap-2 border-b border-white/10 py-3 text-left last:border-b-0"
                        >
                            <div className="min-w-0">
                                <p className={`truncate text-sm font-bold ${b.active ? "text-zinc-50" : "text-zinc-500 line-through"}`}>{b.name}</p>
                                <p className="truncate text-xs text-zinc-500">
                                    {b.specialty || "Sin especialidad"}
                                    {b.phone ? ` · ${b.phone}` : ""}
                                </p>
                            </div>
                            <span className="font-numeric shrink-0 text-right text-xs font-bold text-zinc-300">
                                {PAYMENT_TYPE_LABELS[b.paymentType ?? "COMISION"]}
                                <br />
                                {b.paymentType === "SUELDO" ? money(b.salaryCents ?? 0) : `${b.commissionPercent}%`}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {perms.canAdd ? (
                <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Agregar barbero">
                    {createOpen ? (
                        <CreateBarberForm
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setCreateOpen(false)}
                            onSave={(data) => run(() => createBarber(slug, data), () => setCreateOpen(false))}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}

            <BottomSheet open={!!editing} onClose={() => setEditingId(null)} title={editing?.name}>
                {editing ? (
                    <EditBarberForm
                        key={editing.id}
                        barber={editing}
                        brandStyle={brandStyle}
                        isPending={isPending}
                        error={error}
                        canEdit={perms.canEdit}
                        canDelete={perms.canDelete}
                        onSave={(data) => run(() => updateBarber(editing.id, slug, data))}
                        onDelete={() => run(() => deleteBarber(editing.id, slug), () => setEditingId(null))}
                    />
                ) : null}
            </BottomSheet>
        </div>
    );
}
