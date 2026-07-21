"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput, NumberInput } from "@/components/FormField";
import { money, contrastText } from "@/lib/format";
import { createProduct, updateProduct, deleteProduct, adjustProductStock } from "@/app/t/[slug]/catalog-actions";

const emptyForm = { name: "", price: "", stock: "0", lowStockThreshold: "3" };

function CreateProductForm({ brandStyle, isPending, error, onSave, onCancel }) {
    const [form, setForm] = useState(emptyForm);

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre">
                    <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej. Cera moldeadora" />
                </Field>
                <Field label="Precio (MXN)">
                    <NumberInput value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} min="0" />
                </Field>
                <Field label="Stock inicial (piezas)">
                    <NumberInput value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} min="0" />
                </Field>
                <Field label="Aviso de stock bajo (piezas)">
                    <NumberInput value={form.lowStockThreshold} onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} min="0" />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    disabled={isPending}
                    onClick={() =>
                        onSave({
                            name: form.name,
                            priceCents: Math.round(parseFloat(form.price || "0") * 100),
                            stock: parseFloat(form.stock || "0"),
                            lowStockThreshold: parseFloat(form.lowStockThreshold || "3"),
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

function EditProductForm({ product, brandStyle, isPending, error, canEdit, canDelete, onSave, onDelete }) {
    const [name, setName] = useState(product.name);
    const [price, setPrice] = useState(String(product.priceCents / 100));
    const [stock, setStock] = useState(String(product.stock));
    const [threshold, setThreshold] = useState(String(product.lowStockThreshold));
    const [active, setActive] = useState(product.active);

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre">
                    <TextInput disabled={!canEdit} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Precio (MXN)">
                    <NumberInput disabled={!canEdit} value={price} onChange={(e) => setPrice(e.target.value)} min="0" />
                </Field>
                <Field label="Stock (piezas)">
                    <NumberInput disabled={!canEdit} value={stock} onChange={(e) => setStock(e.target.value)} min="0" />
                </Field>
                <Field label="Aviso de stock bajo (piezas)">
                    <NumberInput disabled={!canEdit} value={threshold} onChange={(e) => setThreshold(e.target.value)} min="0" />
                </Field>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
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
                            disabled={isPending}
                            onClick={() =>
                                onSave({
                                    name,
                                    priceCents: Math.round(parseFloat(price || "0") * 100),
                                    stock: parseFloat(stock || "0"),
                                    lowStockThreshold: parseFloat(threshold || "3"),
                                    active,
                                })
                            }
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
        </>
    );
}

const PAGE_SIZE = 5;

export default function ProductsInventory({ products, slug, brandColor, perms }) {
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const [page, setPage] = useState(0);
    const editing = products.find((p) => p.id === editingId) ?? null;
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };

    const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages - 1);
    const pageItems = products.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

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

    const bump = (productId, delta) => run(() => adjustProductStock(productId, slug, delta));

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Inventario</p>
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
            {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}

            <div className="grid grid-cols-2 gap-2.5">
                {pageItems.map((p) => {
                    const lowStock = p.stock <= p.lowStockThreshold;
                    return (
                        <div key={p.id} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                            <button
                                onClick={() => {
                                    setError("");
                                    setEditingId(p.id);
                                }}
                                className="block w-full text-left"
                            >
                                <p className={`truncate text-sm font-bold ${p.active ? "text-zinc-50" : "text-zinc-500 line-through"}`}>{p.name}</p>
                                {lowStock ? (
                                    <span className="mt-0.5 inline-block rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                                        stock bajo
                                    </span>
                                ) : null}
                                <p className="mt-0.5 text-xs text-zinc-400">{money(p.priceCents)}</p>
                            </button>
                            <div className="mt-2 flex items-center justify-between">
                                {perms.canEdit ? (
                                    <button
                                        onClick={() => bump(p.id, -1)}
                                        disabled={isPending || p.stock <= 0}
                                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 disabled:opacity-30"
                                    >
                                        −
                                    </button>
                                ) : (
                                    <span />
                                )}
                                <span className={`font-numeric text-sm font-bold ${lowStock ? "text-red-400" : "text-zinc-100"}`}>{p.stock}</span>
                                {perms.canEdit ? (
                                    <button
                                        onClick={() => bump(p.id, 1)}
                                        disabled={isPending}
                                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 disabled:opacity-30"
                                    >
                                        +
                                    </button>
                                ) : (
                                    <span />
                                )}
                            </div>
                        </div>
                    );
                })}
                {products.length === 0 ? (
                    <p className="col-span-2 rounded-md border border-zinc-800 bg-zinc-900 py-6 text-center text-sm text-zinc-500">
                        Todavía no agregas productos.
                    </p>
                ) : null}
            </div>

            {products.length > PAGE_SIZE ? (
                <div className="mt-2.5 flex items-center justify-center gap-3">
                    <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 disabled:opacity-30"
                    >
                        ‹
                    </button>
                    <span className="text-[12px] font-semibold text-zinc-500">
                        Página {currentPage + 1} de {totalPages}
                    </span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage >= totalPages - 1}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 disabled:opacity-30"
                    >
                        ›
                    </button>
                </div>
            ) : null}

            {perms.canAdd ? (
                <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Agregar producto">
                    {createOpen ? (
                        <CreateProductForm
                            brandStyle={brandStyle}
                            isPending={isPending}
                            error={error}
                            onCancel={() => setCreateOpen(false)}
                            onSave={(data) => run(() => createProduct(slug, data), () => setCreateOpen(false))}
                        />
                    ) : null}
                </BottomSheet>
            ) : null}

            <BottomSheet open={!!editing} onClose={() => setEditingId(null)} title={editing?.name}>
                {editing ? (
                    <EditProductForm
                        key={editing.id}
                        product={editing}
                        brandStyle={brandStyle}
                        isPending={isPending}
                        error={error}
                        canEdit={perms.canEdit}
                        canDelete={perms.canDelete}
                        onSave={(data) => run(() => updateProduct(editing.id, slug, data))}
                        onDelete={() => run(() => deleteProduct(editing.id, slug), () => setEditingId(null))}
                    />
                ) : null}
            </BottomSheet>
        </div>
    );
}
