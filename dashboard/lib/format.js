export const money = (cents) =>
    `$${(cents / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

export const timeAgo = (date) => {
    const diffMs = Date.now() - new Date(date).getTime()
    const minutes = Math.round(diffMs / 60000)
    if (minutes < 1) return 'ahora mismo'
    if (minutes < 60) return `hace ${minutes} min`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `hace ${hours} h`
    const days = Math.round(hours / 24)
    return `hace ${days} d`
}

export const shortDate = (date) =>
    new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

export const shortDateTime = (date) =>
    new Date(date).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Para inputs <input type="datetime-local">: "YYYY-MM-DDTHH:mm" en hora local.
export const toDatetimeLocalValue = (date) => {
    const d = new Date(date)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Para inputs <input type="date">: "YYYY-MM-DD" en hora local.
export const toDateInputValue = (date) => {
    const d = new Date(date)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const TENANT_STATUS_META = {
    ACTIVE: { tone: 'good', label: 'Pagado' },
    PAST_DUE: { tone: 'warn', label: 'Por vencer' },
    PAUSED: { tone: 'bad', label: 'Pendiente' },
}

export const BOOKING_STATUS_META = {
    PENDING: { tone: 'warn', label: 'En espera' },
    COMPLETED: { tone: 'good', label: 'Completado' },
    CANCELLED: { tone: 'bad', label: 'Cancelado' },
}

// Elige texto blanco o casi-negro según qué tanto contraste da el color de marca.
export const contrastText = (hex) => {
    const c = hex?.replace('#', '') ?? 'D9A441'
    const r = parseInt(c.slice(0, 2), 16)
    const g = parseInt(c.slice(2, 4), 16)
    const b = parseInt(c.slice(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.6 ? '#0a0a0a' : '#fafafa'
}
