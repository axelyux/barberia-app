"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { login, getTenantBrand } from "@/app/login/actions";
import { Field, TextInput } from "@/components/FormField";
import { contrastText } from "@/lib/format";

const initialState = { error: null };
const DEFAULT_BRAND = "#D9A441";

export default function LoginForm({ action = login, showTenantField = true }) {
    const [state, formAction, isPending] = useActionState(action, initialState);
    const [brandColor, setBrandColor] = useState(null);
    const debounceRef = useRef(null);

    // Mientras el usuario escribe la barbería, buscamos su color de marca ya configurado
    // (BrandingEditor) para que el botón de "Entrar" se vea con SU color, no un ámbar
    // genérico — solo aplica al login de barberías, el de super-admin no tiene tenant.
    const onTenantSlugChange = (e) => {
        if (!showTenantField) return;
        const value = e.target.value.trim();
        clearTimeout(debounceRef.current);
        if (!value) {
            setBrandColor(null);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            const tenant = await getTenantBrand(value);
            setBrandColor(tenant?.brandColor ?? null);
        }, 350);
    };

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    const activeBrand = brandColor ?? DEFAULT_BRAND;
    const buttonStyle = { background: activeBrand, color: contrastText(activeBrand) };

    return (
        <form
            action={formAction}
            className="flex w-full max-w-xs flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-6 shadow-[var(--shadow-panel)] backdrop-blur-xl backdrop-saturate-150"
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
                className="mt-1 flex min-h-11 items-center justify-center rounded-lg text-sm font-bold shadow-[0_1px_0_rgba(255,255,255,0.2)_inset] transition-[filter] hover:brightness-95 active:brightness-90 disabled:opacity-50"
            >
                {isPending ? "Entrando…" : "Entrar"}
            </button>
        </form>
    );
}
