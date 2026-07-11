// Interpretación de texto libre del cliente por reglas simples (regex), no por IA.

const stripAccents = (s) =>
    s
        .toLowerCase()
        .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')

// "3", "3pm", "3:30", "3:30 pm", "15:30", "a las 3 de la tarde" → { hour, minute } en 24h, o null si no se entendió.
export function parseTimeText(text) {
    if (!text) return null
    const clean = stripAccents(text).replace('a las', '').trim()
    const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.?|p\.m\.?|de la tarde|de la noche|de la manana|manana)?/)
    if (!match) return null

    let hour = parseInt(match[1], 10)
    const minute = match[2] ? parseInt(match[2], 10) : 0
    const meridiem = match[3] ?? ''
    if (hour > 23 || minute > 59) return null

    const isPM = /pm|p\.m|tarde|noche/.test(meridiem)
    const isAM = /am|a\.m|manana/.test(meridiem)

    if (isPM && hour < 12) hour += 12
    else if (isAM && hour === 12) hour = 0
    else if (!isPM && !isAM && hour >= 1 && hour <= 7) hour += 12 // sin indicar am/pm, asumimos tarde (horario típico de barbería)

    return { hour, minute }
}

// "hoy", "mañana", o el número de un menú 1=hoy / 2=mañana → 0 o 1 (días a sumar), o null si no se entendió.
export function parseDayChoice(text) {
    if (!text) return null
    const clean = stripAccents(text).trim()
    if (clean === '1' || clean.includes('hoy')) return 0
    if (clean === '2' || clean.includes('manana')) return 1
    return null
}

// ¿El texto menciona alguna palabra significativa del nombre? ("combo" coincide con "Combo (Corte + Barba)").
const nameMentioned = (text, name) => {
    const words = stripAccents(text).split(/\W+/).filter(Boolean)
    const nameWords = stripAccents(name).split(/\W+/).filter((w) => w.length > 2)
    return nameWords.some((w) => words.includes(w))
}

// Busca si el texto menciona el nombre de algún servicio o producto activo (para responder precios).
export function findCatalogMatch(text, services, products) {
    const service = services.find((s) => nameMentioned(text, s.name))
    if (service) return { type: 'servicio', name: service.name, priceCents: service.priceCents }
    const product = products.find((p) => nameMentioned(text, p.name))
    if (product) return { type: 'producto', name: product.name, priceCents: product.priceCents }
    return null
}

// Elige un servicio de una lista por número de menú ("2") o por coincidencia de alguna palabra del nombre.
export function matchServiceChoice(text, services) {
    if (!text) return null
    const clean = stripAccents(text).trim()
    const asNumber = parseInt(clean, 10)
    if (!Number.isNaN(asNumber) && services[asNumber - 1]) return services[asNumber - 1]

    return services.find((s) => nameMentioned(text, s.name)) ?? null
}
