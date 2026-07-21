const escapeCell = (val) => {
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows, columns) {
    const header = columns.map((c) => escapeCell(c.label)).join(",");
    const lines = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(","));
    return [header, ...lines].join("\n");
}

// Solo se llama desde el navegador (dentro de un onClick), nunca durante el render en servidor.
export function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
