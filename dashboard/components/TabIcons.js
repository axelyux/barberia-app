const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export function IconToday(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
            <path d="M8 3v4M16 3v4M3.5 10h17" />
            <path d="M8 14l2.2 2.2L16 11" />
        </svg>
    );
}

export function IconCatalog(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <path d="M20 12.5 12.5 20a1.5 1.5 0 0 1-2 0l-6.5-6.5a1.5 1.5 0 0 1 0-2L11.5 4H19a1 1 0 0 1 1 1v7.5Z" />
            <circle cx="15" cy="8.5" r="1.4" />
        </svg>
    );
}

export function IconBot(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <rect x="3.5" y="5.5" width="17" height="12" rx="4" />
            <path d="M8.5 21 8.5 17.5M9 10.2v1.8M15 10.2v1.8" />
        </svg>
    );
}

export function IconBrand(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <path d="M12 3c-4.5 0-8.5 3.6-8.5 8.5S8 20 12 20c1.4 0 1.8-1 1.1-1.9-.6-.8-.2-2 .9-2.1h1.8c2.6 0 3.7-3.3 1.7-5C15.8 9.2 14 9.7 12 9.7c-2.9 0-3.8-2.4-1.6-4.2C11.1 4.8 11.9 3 12 3Z" />
            <circle cx="7.3" cy="11" r="1" fill="currentColor" />
            <circle cx="9.5" cy="7" r="1" fill="currentColor" />
        </svg>
    );
}

export function IconFinance(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <path d="M4 19V10M9.5 19V5M15 19v-7M20 19V8" />
            <path d="M3.5 19h17" />
        </svg>
    );
}

export function IconSales(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <path d="M4 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.1a2 2 0 0 0 2-1.6L20 8H7" />
            <circle cx="9.5" cy="19.5" r="1.3" fill="currentColor" />
            <circle cx="16.5" cy="19.5" r="1.3" fill="currentColor" />
        </svg>
    );
}

export function IconExpense(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <path d="M6 3.5h12v17l-2.5-1.6L13 20l-2.5-1.6L8 20l-2-1.5V3.5Z" />
            <path d="M9 8.5h6M9 12h6" />
        </svg>
    );
}

export function IconInventory(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <path d="M3.5 8 12 3.5 20.5 8 12 12.5 3.5 8Z" />
            <path d="M3.5 8v8L12 20.5 20.5 16V8M12 12.5v8" />
        </svg>
    );
}

export function IconPurchases(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <path d="M4.5 7.5h15l-1.3 9.4a2 2 0 0 1-2 1.6H7.8a2 2 0 0 1-2-1.6L4.5 7.5Z" />
            <path d="M8 7.5V6a4 4 0 0 1 8 0v1.5M12 11v5M9.5 13.5 12 16l2.5-2.5" />
        </svg>
    );
}

export function IconWorkers(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <circle cx="12" cy="8" r="3.3" />
            <path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" />
        </svg>
    );
}

export function IconCustomers(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20c0-3.3 2.7-5.7 6-5.7s6 2.4 6 5.7" />
            <path d="M15.5 5.3a3 3 0 0 1 0 5.8M19 20c0-2.6-1.6-4.7-3.8-5.5" />
        </svg>
    );
}

export function IconMore(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} strokeWidth="0" fill="currentColor" {...props}>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
        </svg>
    );
}

export function IconSettings(props) {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
            <circle cx="12" cy="12" r="2.8" />
            <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3" />
        </svg>
    );
}
