const TONE_CLASSES = {
    good: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/15',
    warn: 'bg-orange-500/10 text-orange-400 ring-1 ring-inset ring-orange-500/15',
    bad: 'bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/15',
}

const DOT_CLASSES = {
    good: 'bg-emerald-400',
    warn: 'bg-orange-400',
    bad: 'bg-red-400',
}

export default function Badge({ tone = 'good', children }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold tracking-tight ${TONE_CLASSES[tone]}`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} />
            {children}
        </span>
    )
}
