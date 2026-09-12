"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { login, getTenantBrand } from "@/app/login/actions";
import { Field, TextInput } from "@/components/FormField";
import { contrastText } from "@/lib/format";
import { getBillingNotice } from "@/lib/billing";
import { useGlobalPending } from "@/components/GlobalLoading";

const initialState = { error: null };
const DEFAULT_BRAND = "#D9A441";

export default function LoginForm({ action = login, showTenantField = true }) {
    const [state, formAction, isPending] = useActionState(action, initialState);
    useGlobalPending(isPending);
    const [tenantPreview, setTenantPreview] = useState(null);
    const debounceRef = useRef(null);

    // Mientras el usuario escribe la barbería, buscamos su color de marca ya configurado
    // (BrandingEditor) para que el botón de "Entrar" se vea con SU color, y de paso el
    // mismo aviso de vencimiento que vería ya adentro del panel — así el dueño lo nota
    // desde el login, no hasta después de entrar. Solo aplica al login de barberías, el
    // de super-admin no tiene tenant.
    const onTenantSlugChange = (e) => {
        if (!showTenantField) return;
        const value = e.target.value.trim();
        clearTimeout(debounceRef.current);
        if (!value) {
            setTenantPreview(null);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            const tenant = await getTenantBrand(value);
            setTenantPreview(tenant ?? null);
        }, 350);
    };

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    const activeBrand = tenantPreview?.brandColor ?? DEFAULT_BRAND;
    const buttonStyle = { background: activeBrand, color: contrastText(activeBrand) };
    const billingNotice = tenantPreview ? getBillingNotice(tenantPreview) : null;

    return (
        <div className="flex w-full max-w-xs flex-col gap-3">
            {billingNotice ? (
                <p
                    className={`rounded-lg border px-3.5 py-2.5 text-sm font-semibold ${
                        billingNotice.tone === "bad" ? "border-red-800/40 bg-red-500/10 text-red-300" : "border-orange-800/40 bg-orange-500/10 text-orange-300"
                    }`}
                >
                    {billingNotice.text}
                </p>
            ) : null}
            <form
                action={formAction}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-6 shadow-[var(--shadow-panel)] backdrop-blur-xl backdrop-saturate-150"
            >
                {showTenantField ? (
                    <Field label="Barbería">
                        <TextInput name="tenantSlug" type="text" required autoComplete="off" onChange={onTenantSlugChange} />
                    </Field>
                ) : null}
                <Field label="Usuario">
                    <TextInput name="username" type="text" required autoComplete="username" />
                </Field>
                <Field label="Contraseña">
                    <TextInput name="password" type="password" required autoComplete="current-password" />
                </Field>
                {state?.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
                <button
                    type="submit"
                    disabled={isPending}
                    style={buttonStyle}
                    className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-bold shadow-[0_1px_0_rgba(255,255,255,0.2)_inset] transition-[filter] hover:brightness-95 active:brightness-90 disabled:opacity-50"
                >
                    {isPending ? (
                        <svg viewBox="0 0 24 24" className="btn-spinner h-4 w-4 shrink-0" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                    ) : null}
                    {isPending ? "Entrando…" : "Entrar"}
                </button>
            </form>
        </div>
    );
}
