const ACCENTS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }

export const slugify = (text) =>
    text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[áéíóúüñ]/g, (ch) => ACCENTS[ch] ?? ch)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
