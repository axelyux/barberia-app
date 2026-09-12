const escapeCell = (val) => {
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows, columns) {
    const header = columns.map((c) => escapeCell(c.label)).join(",");
    const lines = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(","));
    return [header, ...lines].join("\n");
}

// Nota: aquí vivía downloadCSV(), que generaba el archivo con un <a download> y una URL de
// blob. Eso funciona en un navegador de escritorio, pero en la app instalada (WebView de
// Android/iOS) la descarga se bloquea o se ignora en silencio: el botón "Exportar CSV" no
// guardaba nada en ningún lado. Se quitó el botón hasta resolver la descarga de forma que
// sí funcione dentro de la app (hoja de compartir del sistema, o una ruta del servidor que
// devuelva el archivo con Content-Disposition). Las funciones exportSalesCSV /
// exportExpensesCSV del servidor se conservan porque ya arman bien el contenido.
