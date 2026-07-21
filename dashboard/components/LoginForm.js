"use client";

import { useActionState } from "react";
import { login } from "@/app/login/actions";
import { Field, TextInput } from "@/components/FormField";

const initialState = { error: null };

export default function LoginForm({ action = login, showTenantField = true }) {
    const [state, formAction, isPending] = useActionState(action, initialState);

    return (
        <form action={formAction} className="flex w-full max-w-xs flex-col gap-3">
            {showTenantField ? (
                <Field label="Barbería (slug de tu URL)">
                    <TextInput name="tenantSlug" type="text" required placeholder="sable-barber-studio" autoComplete="off" />
                </Field>
            ) : null}
            <Field label="Usuario">
                <TextInput name="username" type="text" required placeholder="admin" autoComplete="username" />
            </Field>
            <Field label="Contraseña">
                <TextInput name="password" type="password" required placeholder="••••••••" autoComplete="current-password" />
            </Field>
            {state?.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
            <button
                type="submit"
                disabled={isPending}
                className="mt-1 flex min-h-11 items-center justify-center rounded-md bg-amber-500 text-sm font-bold text-zinc-950 disabled:opacity-50"
            >
                {isPending ? "Entrando…" : "Entrar"}
            </button>
        </form>
    );
}
