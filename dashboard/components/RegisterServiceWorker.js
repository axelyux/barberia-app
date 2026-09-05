"use client";

import { useEffect } from "react";

// Registra public/sw.js (ver ese archivo) para que, en visitas futuras, el navegador
// pueda mostrar public/offline.html en vez de su página de error nativa cuando no hay
// internet. No hace nada visible — si el navegador no soporta service workers (algunos
// WebViews viejos) simplemente no se registra, sin romper nada.
export default function RegisterServiceWorker() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    }, []);

    return null;
}
