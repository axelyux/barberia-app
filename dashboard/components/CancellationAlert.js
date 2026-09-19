"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRecentCancellations } from "@/app/t/[slug]/actions";
import { shortDateTime } from "@/lib/format";

// Aviso de que un cliente canceló su cita desde WhatsApp.
//
// No usa notificaciones push a propósito: están apagadas mientras no haya Firebase
// configurado (ver PushNotificationSetup.js), y prenderlas sin eso truena la app de
// Android. Esto funciona hoy, sin recompilar el APK.
//
// El barbero está cortando, no viendo la pantalla, así que el panel se pregunta solo cada
// minuto si hubo cancelaciones nuevas. Es una consulta chica (máximo 20 filas de las
// últimas 24 h) y no bloquea nada de lo que esté haciendo.
const POLL_MS = 60 * 1000;

// Qué cancelaciones ya vio ESTE aparato. Va en el navegador, no en la base: si el dueño
// revisa en su celular, el tablet del mostrador debe seguir mostrando el aviso.
const storageKey = (slug) => `mibarber:cancel-seen:${slug}`;

const leerVistoEn = (slug) => {
    try {
        return localStorage.getItem(storageKey(slug));
    } catch {
        return null; // modo privado, o almacenamiento bloqueado
    }
};

const guardarVistoEn = (slug, iso) => {
    try {
        localStorage.setItem(storageKey(slug), iso);
    } catch {
        // Si no se puede guardar, el aviso reaparecerá: molesto, pero nunca oculta una
        // cancelación real.
    }
};

export default function CancellationAlert({ slug, brandColor, onVerAgenda }) {
    const [cancelaciones, setCancelaciones] = useState([]);
    const [abierto, setAbierto] = useState(false);
    const pidiendo = useRef(false);

    const revisar = useCallback(async () => {
        if (pidiendo.current || document.hidden) return;
        pidiendo.current = true;
        try {
            const filas = await getRecentCancellations(slug, leerVistoEn(slug));
            setCancelaciones(filas);
        } catch {
            // Sin internet o sesión vencida: se reintenta en el siguiente ciclo, sin
            // molestar al usuario con un error por algo que corre en segundo plano.
        } finally {
            pidiendo.current = false;
        }
    }, [slug]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial + sondeo contra el servidor
        revisar();
        const id = setInterval(revisar, POLL_MS);
        // Al volver a la app (estaba cortando, deja el celular, lo retoma) se revisa de
        // inmediato en vez de esperar al siguiente minuto.
        const alVolver = () => {
            if (!document.hidden) revisar();
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            clearInterval(id);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [revisar]);

    const marcarVistas = () => {
        guardarVistoEn(slug, new Date().toISOString());
        setCancelaciones([]);
        setAbierto(false);
    };

    if (cancelaciones.length === 0) return null;

    return (
        <>
            <button
                onClick={() => setAbierto(true)}
                className="flex w-full items-center gap-3 rounded-xl border border-red-800/40 bg-red-500/10 p-3 text-left"
            >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white">
                    {cancelaciones.length}
                </span>
                <span className="min-w-0">
                    <span className="block text-sm font-bold text-red-300">
                        {cancelaciones.length === 1 ? "Un cliente canceló su cita" : `${cancelaciones.length} clientes cancelaron su cita`}
                    </span>
                    <span className="block text-[12px] text-red-200/80">Toca para ver cuáles horarios quedaron libres</span>
                </span>
            </button>

            {abierto ? (
                <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3" onClick={() => setAbierto(false)}>
                    <div
                        className="w-full max-w-[430px] rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-[var(--shadow-panel)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Citas canceladas por el cliente</p>
                        <div className="mt-2 flex flex-col divide-y divide-white/10">
                            {cancelaciones.map((c) => (
                                <div key={c.id} className="py-2.5">
                                    <p className="text-sm font-semibold text-zinc-100">{c.customerName || "Cliente"}</p>
                                    <p className="text-[12px] text-zinc-400">
                                        Tenía cita el {shortDateTime(c.scheduledAt)}
                                        {c.serviceName ? ` · ${c.serviceName}` : ""}
                                    </p>
                                    <p className="text-[11px] text-zinc-500">Canceló el {shortDateTime(c.cancelledAt)}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                            <button
                                onClick={() => {
                                    marcarVistas();
                                    onVerAgenda?.();
                                }}
                                style={{ background: brandColor }}
                                className="flex min-h-11 items-center justify-center rounded-lg text-sm font-bold text-zinc-950"
                            >
                                Ver la agenda
                            </button>
                            <button
                                onClick={marcarVistas}
                                className="flex min-h-11 items-center justify-center rounded-lg border border-white/10 text-sm font-semibold text-zinc-300"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
