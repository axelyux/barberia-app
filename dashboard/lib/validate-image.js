const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 500 * 1024;

// El picker del navegador ya sugiere solo imágenes, pero eso no protege nada — un cliente
// modificado puede mandar cualquier string como "logoUrl". Aquí se valida en servidor:
// si es una URL http(s) normal se deja pasar tal cual (no es el caso que nos preocupa),
// pero si es un data URI en base64 (lo que realmente manda el picker de este panel), se
// exige un tipo MIME permitido y un tamaño real por debajo de 500KB.
export function validateLogoUrl(value) {
    const trimmed = value?.trim();
    if (!trimmed) return null;

    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    const match = trimmed.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error("El logo debe ser una imagen válida (PNG, JPG o WEBP).");

    const [, mime, base64] = match;
    if (!ALLOWED_MIME.has(mime.toLowerCase())) {
        throw new Error("Formato de imagen no permitido. Usa PNG, JPG o WEBP.");
    }

    // Tamaño real en bytes a partir del largo del base64 (4 caracteres = 3 bytes, menos
    // el padding "=") — evita decodificar el buffer completo solo para medirlo.
    const padding = (base64.match(/=+$/) || [""])[0].length;
    const byteSize = (base64.length * 3) / 4 - padding;
    if (byteSize > MAX_BYTES) {
        throw new Error("La imagen es demasiado grande (máximo 500KB).");
    }

    return trimmed;
}
