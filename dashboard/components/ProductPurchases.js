"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, NumberInput } from "@/components/FormField";
import { money, shortDate, contrastText } from "@/lib/format";
import { createProductPurchase } from "@/app/t/[slug]/catalog-actions";

export default function ProductPurchases({ products, purchases, slug, brandColor, perms }) {
    const [open, setOpen] = useState(false);
    const [productId, setProductId] = useState(products[0]?.id ?? "");
    const [quantity, setQuantity] = useState("1");
    const [cost, setCost] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };

    const submit = () => {
        setError("");
        startTransition(async () => {
            try {
                await createProductPurchase(slug, {
                    productId,
                    quantity: parseFloat(quantity || "1"),
                    costCents: Math.round(parseFloat(cost || "0") * 100),
                });
                setOpen(false);
                setQuantity("1");
                setCost("");
            } catch (err) {
                setError(err?.message ?? "Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Compras a proveedor (stock)</p>
                {perms.canAdd ? (
                    <button onClick={() => setOpen(true)} style={brandStyle} className="flex h-8 items-center gap-1 rounded-md px-3 text-xs font-bold">
                        + Registrar compra
                    </button>
                ) : null}
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3.5">
                {purchases.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 border-b border-zinc-800 py-2.5 text-sm last:border-b-0">
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-zinc-100">
                                {p.product?.name ?? "Producto"} · {p.quantity} pzas
                            </p>
                            <p className="text-[11.5px] text-zinc-500">{shortDate(p.createdAt)}</p>
                        </div>
                        <span className="font-numeric shrink-0 font-bold text-emerald-400">+{money(p.costCents)}</span>
                    </div>
                ))}
                {purchases.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Sin compras registradas.</p> : null}
            </div>

            <BottomSheet open={open} onClose={() => setOpen(false)} title="Registrar compra">
                <div className="flex flex-col gap-3">
                    <Field label="Producto">
                        <select
                            value={productId}
                            onChange={(e) => setProductId(e.target.value)}
                            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 focus:border-amber-500 focus:outline-none"
                        >
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} (stock: {p.stock})
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Cantidad">
                        <NumberInput value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1" />
                    </Field>
                    <Field label="Costo total (MXN)">
                        <NumberInput value={cost} onChange={(e) => setCost(e.target.value)} min="0" />
                    </Field>
                </div>
                {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
                <div className="mt-4 flex flex-col gap-2">
                    <SheetButton variant="brand" style={brandStyle} disabled={isPending || !productId} onClick={submit}>
                        Guardar compra
                    </SheetButton>
                    <SheetButton variant="ghost" onClick={() => setOpen(false)}>
                        Cancelar
                    </SheetButton>
                </div>
            </BottomSheet>
        </div>
    );
}
