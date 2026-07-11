"use client";

export default function BottomSheet({ open, onClose, title, subtitle, children }) {
    return (
        <>
            <div
                onClick={onClose}
                aria-hidden="true"
                className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
                    }`}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-lg border-t border-zinc-800 bg-zinc-900 px-5 pb-8 pt-3 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] ${open ? "translate-y-0" : "translate-y-full"
                    }`}
            >
                <div className="mx-auto mb-4 h-1 w-9 rounded-sm bg-zinc-700" />
                {title ? <h3 className="text-[17px] font-bold text-zinc-50">{title}</h3> : null}
                {subtitle ? <p className="mb-4 mt-0.5 text-sm text-zinc-400">{subtitle}</p> : null}
                {children}
            </div>
        </>
    );
}
