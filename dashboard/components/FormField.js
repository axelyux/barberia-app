"use client";

const inputClass =
    "min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3.5 text-[15px] text-zinc-50 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

export function Field({ label, children }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-400">{label}</span>
            {children}
        </label>
    );
}

export function TextInput(props) {
    return <input {...props} className={inputClass} />;
}

export function NumberInput(props) {
    return <input type="number" inputMode="decimal" {...props} className={inputClass} />;
}

export function ImagePicker({ value, onChange }) {
    const pick = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => onChange(reader.result);
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex items-center gap-3">
            {value ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={value} alt="" className="h-11 w-11 shrink-0 rounded-md border border-zinc-700 object-cover" />
            ) : (
                <div className="h-11 w-11 shrink-0 rounded-md border border-dashed border-zinc-700" />
            )}
            <label className={`${inputClass} flex flex-1 cursor-pointer items-center justify-center text-center`}>
                {value ? "Cambiar imagen" : "Elegir de tu dispositivo"}
                <input type="file" accept="image/*" onChange={pick} className="hidden" />
            </label>
            {value ? (
                <button type="button" onClick={() => onChange("")} className="shrink-0 text-xs text-zinc-500 underline">
                    Quitar
                </button>
            ) : null}
        </div>
    );
}

const SWATCHES = ["#D9A441", "#3B82F6", "#10B981", "#B91C1C", "#6366F1", "#EC4899", "#64748B"];

export function ColorPicker({ value, onChange }) {
    return (
        <div className="flex items-center gap-2">
            <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-zinc-700 bg-zinc-800/60 p-1"
                aria-label="Elegir color de marca"
            />
            <div className="flex flex-wrap gap-1.5">
                {SWATCHES.map((sw) => (
                    <button
                        key={sw}
                        type="button"
                        onClick={() => onChange(sw)}
                        aria-label={`Usar color ${sw}`}
                        style={{ background: sw }}
                        className={`h-7 w-7 rounded-sm border-2 transition-transform ${value?.toLowerCase() === sw.toLowerCase() ? "scale-110 border-zinc-50" : "border-transparent"
                            }`}
                    />
                ))}
            </div>
        </div>
    );
}
