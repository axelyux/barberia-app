// Estado real de conexión del bot de WhatsApp: "conectado" significa que esta barbería
// ya tiene metaPhoneNumberId + metaAccessToken configurados en Tenant (ver
// dashboard/app/t/[slug]/page.js) — no es un adorno fijo, refleja la columna real.
export default function BotStatus({ connected, compact = false }) {
    if (compact) {
        return (
            <span className="flex items-center gap-1.5" title={connected ? "Bot de WhatsApp: Conectado" : "Bot de WhatsApp: Sin configurar"}>
                <span className="relative flex h-2 w-2">
                    {connected ? (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    ) : null}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-600"}`} />
                </span>
            </span>
        );
    }

    return (
        <div
            className={`flex items-center gap-2.5 rounded-xl border p-3 shadow-[var(--shadow-panel)] ${
                connected ? "border-emerald-800/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900"
            }`}
        >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
                {connected ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /> : null}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-600"}`} />
            </span>
            <p className={`text-[13px] font-semibold ${connected ? "text-emerald-300" : "text-zinc-500"}`}>
                Bot de WhatsApp: {connected ? "Conectado" : "Sin configurar"}
            </p>
        </div>
    );
}
