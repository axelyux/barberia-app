"use client";

import { useEffect, useState } from "react";

const TIME_ZONE = "America/Mexico_City";

export default function LiveClock() {
    // null hasta montar en el cliente a propósito: el servidor y el navegador nunca van a
    // coincidir en la hora exacta, así que evitamos renderizar una hora del servidor que
    // luego "salte" al valor real del cliente (mismatch de hidratación).
    const [now, setNow] = useState(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba: es intencional.
        setNow(new Date());
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    if (!now) return null;

    const time = now.toLocaleTimeString("es-MX", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    const date = now.toLocaleDateString("es-MX", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
    const dateCap = date.charAt(0).toUpperCase() + date.slice(1);

    return (
        <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Hora del sistema</p>
            <div className="rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-[var(--shadow-panel)]">
                <p className="font-numeric text-[28px] font-bold tracking-tight text-zinc-50">{time}</p>
                <p className="mt-1 text-xs text-zinc-500">{dateCap} · Ciudad de México (America/Mexico_City)</p>
            </div>
        </div>
    );
}
