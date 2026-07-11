"use client";

import { useState, useTransition } from "react";
import { money, timeAgo } from "@/lib/format";
import { registerProductSale } from "@/app/t/[slug]/catalog-actions";

export default function ProductSalesLog({ products, sales, slug, perms }) {
    const [error, setError] = useState("");
    const [sellingId, setSellingId] = useState(null);
    const [isPending, startTransition] = useTransition();
    const activeProducts = products.filter((p) => p.active);

    const sell = (productId) => {
        setError("");
        setSellingId(productId);
        startTransition(async () => {
            try {
                await registerProductSale(slug, productId);
            } catch (err) {
                setError(err?.message ?? "No se pudo registrar la venta.");
            } finally {
                setSellingId(null);
            }
        });
    };

    return (
        <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-zinc-500">Ventas de productos</p>

            {perms.canAdd && activeProducts.length > 0 ? (
                <div className="-mx-4 mb-2.5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {activeProducts.map((p) => (
                        <button
                            key={p.id}
                            disabled={isPending && sellingId === p.id}
                            onClick={() => sell(p.id)}
                            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3.5 text-sm font-semibold text-zinc-300 disabled:opacity-50"
                        >
                            + Vender {p.name}
                        </button>
                    ))}
                </div>
            ) : null}
            {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}

            <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3.5">
                {sales.map((s) => (
                    <div key={s.id} className="flex items-center justify-between border-b border-zinc-800 py-2.5 text-sm last:border-b-0">
                        <div>
                            <p className="font-semibold text-zinc-100">{s.productName}</p>
                            <p className="text-[11.5px] text-zinc-500">{timeAgo(s.createdAt)}</p>
                        </div>
                        <span className="font-numeric font-bold text-emerald-400">+{money(s.priceCents)}</span>
                    </div>
                ))}
                {sales.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Sin ventas registradas todavía.</p> : null}
            </div>
        </div>
    );
}
