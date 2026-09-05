const initials = (name) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("");

export default function Avatar({ name, logoUrl, color, size = 40, square = false }) {
    const dimension = `${size}px`;
    const shape = square ? "rounded-md" : "rounded-full";
    if (logoUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={logoUrl}
                alt={name}
                width={size}
                height={size}
                style={{ width: dimension, height: dimension }}
                className={`shrink-0 border border-zinc-800 object-cover shadow-sm ${shape}`}
            />
        );
    }
    return (
        <div
            style={{ width: dimension, height: dimension, background: `${color}26`, color, border: `1px solid ${color}40` }}
            className={`flex shrink-0 items-center justify-center text-sm font-bold tracking-tight ${shape}`}
        >
            {initials(name) || "?"}
        </div>
    );
}
