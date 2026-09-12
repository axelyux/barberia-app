// Los mensajes de los errores que se LANZAN dentro de un Server Action no llegan al
// navegador: en producción, Next.js los reemplaza por uno genérico para no filtrar detalles
// del servidor (ver create-error-handler.js dentro de next/dist — "The specific message is
// omitted in production builds"). El detalle solo queda en los logs de Vercel.
//
// Por eso, un error que el USUARIO puede corregir —"esa hora está fuera del horario",
// "no hay stock suficiente"— no se lanza: se DEVUELVE como valor, y así el texto sí llega
// tal cual a la pantalla. Los errores inesperados (un bug, la base caída) se siguen
// lanzando: ahí el mensaje genérico es lo correcto y el detalle va a los logs.
//
// Uso en el servidor:   return problem("Esa hora ya está ocupada.");
// Uso en el cliente:    const p = problemMessage(await accion()); if (p) { setError(p); return; }

export function problem(message) {
    return { __problem: message };
}

export function problemMessage(result) {
    return result && typeof result === "object" && typeof result.__problem === "string" ? result.__problem : null;
}
