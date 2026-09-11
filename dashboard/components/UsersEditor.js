"use client";

import { useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import SheetButton from "@/components/SheetButton";
import { Field, TextInput } from "@/components/FormField";
import { contrastText } from "@/lib/format";
import { createUser, updateUser, deleteUser, deactivateUser, reactivateUser } from "@/app/t/[slug]/security-actions";

const MODULES = [
    { key: "CITAS", label: "Citas" },
    { key: "SERVICIOS", label: "Servicios" },
    { key: "PRODUCTOS", label: "Productos" },
    { key: "FINANZAS", label: "Finanzas" },
    { key: "BOT", label: "Bot" },
    { key: "SEGURIDAD", label: "Seguridad" },
];
const ACTIONS = [
    { key: "canView", label: "Ver" },
    { key: "canAdd", label: "Agregar" },
    { key: "canEdit", label: "Editar" },
    { key: "canDelete", label: "Borrar" },
];

const emptyPermissions = Object.fromEntries(
    MODULES.map((m) => [m.key, { canView: false, canAdd: false, canEdit: false, canDelete: false }])
);

function permissionsFromUser(user) {
    const byModule = Object.fromEntries((user.permissions ?? []).map((p) => [p.module, p]));
    return Object.fromEntries(
        MODULES.map((m) => [
            m.key,
            {
                canView: !!byModule[m.key]?.canView,
                canAdd: !!byModule[m.key]?.canAdd,
                canEdit: !!byModule[m.key]?.canEdit,
                canDelete: !!byModule[m.key]?.canDelete,
            },
        ])
    );
}

function PermissionMatrix({ permissions, setPermissions }) {
    const toggle = (moduleKey, actionKey) =>
        setPermissions((p) => ({ ...p, [moduleKey]: { ...p[moduleKey], [actionKey]: !p[moduleKey][actionKey] } }));

    return (
        <div className="overflow-x-auto rounded-xl border border-white/10 shadow-[var(--shadow-panel)]">
            <table className="w-full border-collapse text-left text-[12.5px]">
                <thead>
                    <tr className="border-b border-white/10 bg-zinc-800/50">
                        <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide text-zinc-500">Módulo</th>
                        {ACTIONS.map((a) => (
                            <th key={a.key} className="border-l border-white/10 px-2 py-2.5 text-center text-[10.5px] font-bold uppercase tracking-wide text-zinc-500">
                                {a.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {MODULES.map((m, i) => (
                        <tr key={m.key} className={`border-b border-white/10 last:border-b-0 ${i % 2 === 1 ? "bg-zinc-800/20" : ""}`}>
                            <td className="px-3 py-2.5 font-semibold text-zinc-200">{m.label}</td>
                            {ACTIONS.map((a) => (
                                <td key={a.key} className="border-l border-white/10 px-2 py-2.5 text-center">
                                    <input
                                        type="checkbox"
                                        checked={permissions[m.key][a.key]}
                                        onChange={() => toggle(m.key, a.key)}
                                        className="h-4 w-4 rounded-sm border-zinc-600 bg-zinc-800"
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function UserForm({ initial, requirePassword, brandStyle, isPending, error, onSave, onDelete, onToggleActive }) {
    const [name, setName] = useState(initial?.name ?? "");
    const [username, setUsername] = useState(initial?.username ?? "");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState(initial?.role ?? "USUARIO");
    const [permissions, setPermissions] = useState(initial?.permissions ?? emptyPermissions);

    return (
        <>
            <div className="flex flex-col gap-3">
                <Field label="Nombre">
                    <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Vale Ramírez" />
                </Field>
                <Field label="Usuario (para iniciar sesión)">
                    <TextInput type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="vale" />
                </Field>
                <Field label={requirePassword ? "Contraseña" : "Nueva contraseña (déjalo vacío para no cambiarla)"}>
                    <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </Field>
                <Field label="Tipo de usuario">
                    <div className="flex gap-2">
                        {["ADMIN", "USUARIO"].map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setRole(r)}
                                aria-pressed={role === r}
                                className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-sm font-semibold transition-colors ${role === r ? "border-zinc-500 bg-zinc-800 text-zinc-50" : "border-white/10 bg-zinc-900 text-zinc-500"
                                    }`}
                            >
                                {r === "ADMIN" ? "Admin" : "Usuario"}
                            </button>
                        ))}
                    </div>
                </Field>
                <Field label="Permisos por módulo">
                    <PermissionMatrix permissions={permissions} setPermissions={setPermissions} />
                </Field>
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
                <SheetButton
                    variant="brand"
                    style={brandStyle}
                    loading={isPending}
                    onClick={() => onSave({ name, username, password: password || undefined, role, permissions })}
                >
                    Guardar
                </SheetButton>
                {onToggleActive ? (
                    <SheetButton variant="ghost" loading={isPending} onClick={onToggleActive}>
                        {initial?.active === false ? "Reactivar cuenta" : "Desactivar cuenta (no podrá iniciar sesión)"}
                    </SheetButton>
                ) : null}
                {onDelete ? (
                    <SheetButton variant="danger" loading={isPending} onClick={onDelete}>
                        Eliminar usuario
                    </SheetButton>
                ) : null}
            </div>
        </>
    );
}

export default function UsersEditor({ users, slug, brandColor, perms }) {
    const [createOpen, setCreateOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    const brandStyle = { background: brandColor, color: contrastText(brandColor) };
    const editing = users.find((u) => u.id === editingId) ?? null;

    const run = (fn, onDone) => {
        setError("");
        startTransition(async () => {
            try {
                await fn();
                onDone?.();
            } catch (err) {
                setError(err?.message ?? "⚠️ Algo salió mal, intenta de nuevo.");
            }
        });
    };

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Usuarios y permisos</p>
                {perms.canAdd ? (
                    <button onClick={() => setCreateOpen(true)} style={brandStyle} className="flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-bold">
                        + Agregar
                    </button>
                ) : null}
            </div>
            {users.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
                    Todavía no agregas usuarios.
                </p>
            ) : (
                <div className="rounded-xl border border-white/10 bg-zinc-900 px-3.5 shadow-[var(--shadow-panel)]">
                    {users.map((u) => (
                        <button
                            key={u.id}
                            onClick={() => {
                                if (!perms.canEdit) return;
                                setError("");
                                setEditingId(u.id);
                            }}
                            className="flex w-full items-center justify-between gap-2 border-b border-white/10 py-3 text-left last:border-b-0 disabled:opacity-60"
                            disabled={!perms.canEdit}
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-zinc-50">
                                    {u.name} {u.active === false ? <span className="text-xs font-normal text-red-400">(inactivo)</span> : null}
                                </p>
                                <p className="truncate text-xs text-zinc-400">@{u.username}</p>
                            </div>
                            <span className="shrink-0 rounded-md border border-zinc-700 px-2 py-0.5 text-[10.5px] font-bold uppercase text-zinc-400">
                                {u.role === "ADMIN" ? "Admin" : "Usuario"}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo usuario">
                {createOpen ? (
                    <UserForm
                        requirePassword
                        brandStyle={brandStyle}
                        isPending={isPending}
                        error={error}
                        onSave={(data) => run(() => createUser(slug, data), () => setCreateOpen(false))}
                    />
                ) : null}
            </BottomSheet>

            <BottomSheet open={!!editing} onClose={() => setEditingId(null)} title={editing?.name}>
                {editing ? (
                    <UserForm
                        key={editing.id}
                        initial={{ name: editing.name, username: editing.username, role: editing.role, active: editing.active, permissions: permissionsFromUser(editing) }}
                        brandStyle={brandStyle}
                        isPending={isPending}
                        error={error}
                        onSave={(data) => run(() => updateUser(editing.id, slug, data))}
                        onToggleActive={
                            perms.canEdit
                                ? () => run(() => (editing.active === false ? reactivateUser(editing.id, slug) : deactivateUser(editing.id, slug)))
                                : undefined
                        }
                        onDelete={perms.canDelete ? () => run(() => deleteUser(editing.id, slug), () => setEditingId(null)) : undefined}
                    />
                ) : null}
            </BottomSheet>
        </div>
    );
}
