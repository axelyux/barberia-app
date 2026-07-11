"use client";

import { logout } from "@/app/login/actions";

export default function LogoutButton() {
    return (
        <button
            onClick={() => logout()}
            className="flex h-8 items-center rounded-md border border-zinc-800 px-2.5 text-[11.5px] font-semibold text-zinc-400"
        >
            Salir
        </button>
    );
}
