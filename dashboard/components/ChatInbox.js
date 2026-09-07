"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getConversations, getMessages, sendManualMessage, releaseToBot } from "@/app/t/[slug]/chat-actions";

const POLL_MS = 6000;

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

function formatWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? formatTime(iso) : d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function Bubble({ msg }) {
    const isOut = msg.direction === "OUT";
    return (
        <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
            <div
                className={`relative max-w-[80%] rounded-lg px-3 py-2 shadow ${
                    isOut ? "rounded-tr-none bg-[#005c4b]" : "rounded-tl-none bg-[#202c33]"
                }`}
            >
                {isOut && msg.sentByName ? (
                    <p className="mb-0.5 text-[10.5px] font-bold text-emerald-300/80">{msg.sentByName}</p>
                ) : null}
                <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug text-[#e9edef]">{msg.body}</p>
                <div className="mt-1 text-right text-[10px] text-[#8696a0]">{formatTime(msg.createdAt)}</div>
            </div>
        </div>
    );
}

export default function ChatInbox({ slug, brandColor, perms }) {
    const [conversations, setConversations] = useState([]);
    const [selected, setSelected] = useState(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [error, setError] = useState("");
    const [loadingList, setLoadingList] = useState(true);
    const [isPending, startTransition] = useTransition();
    const bottomRef = useRef(null);

    const loadConversations = async () => {
        try {
            const rows = await getConversations(slug);
            setConversations(rows);
        } catch (err) {
            setError(err?.message ?? "No se pudieron cargar los chats.");
        } finally {
            setLoadingList(false);
        }
    };

    const loadMessages = async (phone) => {
        try {
            const rows = await getMessages(slug, phone);
            setMessages(rows);
        } catch (err) {
            setError(err?.message ?? "No se pudo cargar la conversación.");
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial + polling contra el servidor
        loadConversations();
        const id = setInterval(loadConversations, POLL_MS);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    useEffect(() => {
        if (!selected) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial + polling contra el servidor
        loadMessages(selected);
        const id = setInterval(() => loadMessages(selected), POLL_MS);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "nearest" });
    }, [messages]);

    const send = () => {
        const body = text.trim();
        if (!body || !selected) return;
        setError("");
        startTransition(async () => {
            try {
                await sendManualMessage(slug, selected, body);
                setText("");
                await Promise.all([loadMessages(selected), loadConversations()]);
            } catch (err) {
                setError(err?.message ?? "No se pudo enviar el mensaje.");
            }
        });
    };

    const release = () => {
        if (!selected) return;
        startTransition(async () => {
            try {
                await releaseToBot(slug, selected);
                await loadConversations();
            } catch (err) {
                setError(err?.message ?? "No se pudo devolver al bot.");
            }
        });
    };

    const selectedConvo = conversations.find((c) => c.phone === selected);

    return (
        <div className="rounded-xl border border-white/10 bg-zinc-900 shadow-[var(--shadow-panel)]">
            <div className="border-b border-white/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Bandeja de chats</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                    Habla tú mismo con un cliente cuando quieras — mientras lo haces, el bot no le contesta encima.
                </p>
            </div>

            {error ? <p className="px-3 pt-2 text-sm text-red-400">{error}</p> : null}

            <div className="flex h-[520px] max-h-[70vh]">
                <div className="w-full max-w-[220px] shrink-0 overflow-y-auto border-r border-white/10 sm:max-w-[260px]">
                    {loadingList ? (
                        <p className="p-3 text-xs text-zinc-500">Cargando…</p>
                    ) : conversations.length === 0 ? (
                        <p className="p-3 text-xs text-zinc-500">Aún no hay conversaciones por WhatsApp.</p>
                    ) : (
                        conversations.map((c) => (
                            <button
                                key={c.phone}
                                onClick={() => setSelected(c.phone)}
                                className={`flex w-full flex-col gap-0.5 border-b border-white/5 px-3 py-2.5 text-left transition-colors ${
                                    selected === c.phone ? "bg-white/10" : "hover:bg-white/5"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-[13px] font-semibold text-zinc-100">{c.customerName || c.phone}</span>
                                    {c.humanActive ? <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" title="Atendiendo manualmente" /> : null}
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-[11.5px] text-zinc-500">
                                        {c.lastDirection === "OUT" ? "Tú: " : ""}
                                        {c.lastMessage}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-zinc-600">{formatWhen(c.lastAt)}</span>
                                </div>
                            </button>
                        ))
                    )}
                </div>

                <div className="flex flex-1 flex-col">
                    {!selected ? (
                        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-zinc-500">
                            Elige una conversación para ver los mensajes.
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                                <div>
                                    <p className="text-[13px] font-semibold text-zinc-100">{selectedConvo?.customerName || selected}</p>
                                    <p className="text-[11px] text-zinc-500">{selected}</p>
                                </div>
                                {selectedConvo?.humanActive && perms.canEdit ? (
                                    <button
                                        onClick={release}
                                        disabled={isPending}
                                        className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                                    >
                                        Devolver al bot
                                    </button>
                                ) : null}
                            </div>

                            <div className="flex-1 space-y-2 overflow-y-auto bg-[#0b141a] p-3">
                                {messages.map((m) => (
                                    <Bubble key={m.id} msg={m} />
                                ))}
                                <div ref={bottomRef} />
                            </div>

                            {perms.canEdit ? (
                                <div className="flex items-center gap-2 border-t border-white/10 p-2.5">
                                    <input
                                        value={text}
                                        onChange={(e) => setText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                send();
                                            }
                                        }}
                                        placeholder="Escribe un mensaje…"
                                        className="min-h-11 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100 focus:outline-none"
                                    />
                                    <button
                                        onClick={send}
                                        disabled={isPending || !text.trim()}
                                        style={{ background: brandColor }}
                                        className="flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold text-zinc-950 disabled:opacity-50"
                                    >
                                        Enviar
                                    </button>
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
