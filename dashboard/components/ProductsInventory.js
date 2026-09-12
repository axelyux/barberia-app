"use client";
import { friendlyError } from "@/lib/errors";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, NumberInput, TextInput } from "@/components/FormField";
import { contrastText } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { registerManualMovement, getInventoryMovements } from "@/app/t/[slug]/inventory-actions";

const TYPE_META = {
    ENTRADA: { label: "Entrada", sign: "+", color: "text-emerald-400" },
    SALIDA: { label: "Salida", sign: "−", color: "text-red-400" },
};

function formatWhen(iso) {
    const d = new Date(iso);
    return d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function MovementForm({ products, brandStyle, isPending, error, onSave, onCancel }) {
    const [productId, setProductId] = useState(products[0]?.id ?? "");
    const [type, setType] = useState("ENTRADA");
    const [quantity, setQuantity] = useState("1");
    const [reason, setReason] = useState("");

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Producto">
                    <select
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                        className="min-h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-800/50 px-3.5 text-[15px] text-zinc-50 shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] transition-colors focus:border-amber-500/70 focus:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                    >
                        {products.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} (stock actual: {p.stock})
                            </option>
                        ))}
                    </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setType("ENTRADA")}
                        className={`flex h-11 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
                            type === "ENTRADA" ? "border-emerald-700/60 bg-emerald-500/10 text-emerald-400" : "border-zinc-700/80 text-zinc-400"
                        }`}
                    >
                        + Entrada
                    </button>
                    <button
                        onClick={() => setType("SALIDA")}
                        className={`flex h-11 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
                            type === "SALIDA" ? "border-red-700/60 bg-red-500/10 text-red-400" : "border-zinc-700/80 text-zinc-400"
                        }`}
                    >
                        − Salida
                    </button>
                </div>
                <Field label="Cantidad">
                    <NumberInput
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
                        min="1"
                        step="1"
                        inputMode="numeric"
                    />
                </Field>
                <Field label="Motivo (opcional)">
                    <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Conteo físico, producto dañado" />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    loading={isPending}
                    disabled={!productId}
                    onClick={() => onSave({ productId, type, quantity: parseInt(quantity || "1", 10), reason })}
                >
                    Registrar movimiento
                </SheetButton>
                <SheetButton variant="ghost" onClick={onCancel}>
                    Cancelar
                </SheetButton>
            </div>
        </>
    );
}

export default function ProductsInventory({ products, initialMovements, slug, brandColor, perms }) {
    const [movements, setMovements] = useState(initialMovements);
    const [visibleCount, setVisibleCount] = useState(20);
    const [createOpen, setCreateOpen] = useState(false);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };
    const showToast = useToast();

    const run = (fn, onDone) => {
        setError("");
        startTransition(async () => {
            try {
                await fn();
                setMovements(await getInventoryMovements(slug));
                setVisibleCount(20);
                onDone?.();
                showToast("Movimiento registrado");
            } catch (err) {
                setError(friendlyError(err));
            }
        });
    };

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Inventario</p>
                {perms.canEdit && products.length > 0 ? (
                    <button
                        onClick={() => {
                            setError("");
                            setCreateOpen(true);
                        }}
                        style={brandStyle}
                        className="flex h-8 items-center gap-1 rounded-md px-3 text-xs font-bold"
                    >
                        + Movimiento
                    </button>
                ) : null}
            </div>

            {/* Stock actual de cada producto — de un vistazo, sin entrar a cada uno */}
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {products.map((p) => {
                    const lowStock = p.stock <= p.lowStockThreshold;
                    return (
                        <div key={p.id} className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2">
                            <p className={`truncate text-xs font-semibold ${p.active ? "text-zinc-300" : "text-zinc-600 line-through"}`}>{p.name}</p>
                            <p className={`font-numeric text-base font-bold ${lowStock ? "text-red-400" : "text-zinc-100"}`}>
                                {p.stock} <span className="text-[10px] font-normal text-zinc-500">pza.</span>
                            </p>
                        </div>
                    );
                })}
                {products.length === 0 ? (
                    <div className="col-span-2 rounded-lg border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500 sm:col-span-3">
                        Todavía no agregas productos (pestaña &quot;Servicios y productos&quot;).
                    </div>
                ) : null}
            </div>

            {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}

            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Historial de movimientos</p>
            <div className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 shadow-[var(--shadow-panel)]">
                {movements.slice(0, visibleCount).map((m) => {
                    const meta = TYPE_META[m.type];
                    return (
                        <div key={m.id} className="flex items-center justify-between gap-2 border-b border-white/10 py-2.5 text-sm last:border-b-0">
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-zinc-100">{m.productName}</p>
                                <p className="truncate text-[11.5px] text-zinc-500">
                                    {formatWhen(m.createdAt)}
                                    {m.reason ? ` · ${m.reason}` : ""}
                                    {m.createdByName ? ` · ${m.createdByName}` : ""}
                                </p>
                            </div>
                            <span className={`font-numeric shrink-0 font-bold ${meta.color}`}>
                                {meta.sign}
                                {m.quantity}
                            </span>
                        </div>
                    );
                })}
                {movements.length === 0 ? (
                    <div className="my-3 rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                        Todavía no hay movimientos de inventario.
                    </div>
                ) : null}
            </div>
            {movements.length > visibleCount ? (
                <button
                    onClick={() => setVisibleCount((n) => n + 20)}
                    className="mt-2.5 flex min-h-11 w-full items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-sm font-semibold text-zinc-300 hover:bg-zinc-800/60"
                >
                    Cargar más ({movements.length - visibleCount} restantes)
                </button>
            ) : null}

            {perms.canEdit ? (
                <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Registrar movimiento">
                    {createOpen ? (
                        <MovementForm
                            products={products}
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setCreateOpen(false)}
                            onSave={(data) => run(() => registerManualMovement(slug, data), () => setCreateOpen(false))}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}
        </div>
    );
}
