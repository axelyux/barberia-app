"use client";

import { useEffect, useRef } from "react";

// Atajos de teclado globales para usuarios avanzados (power user) — ej. F2 para nueva
// cita, F4 para caja. Se ignoran mientras el foco está en un campo de texto/select para
// no interferir con capturas normales, y cuando el usuario mantiene Ctrl/Alt/Meta (esas
// combinaciones ya las usa el navegador o el sistema).
//
// Uso: useHotkeys({ F2: () => abrirNuevaCita(), F4: () => abrirCaja() })
// El mapa se guarda en un ref para no tener que re-suscribir el listener en cada
// render (los handlers normalmente son funciones nuevas en cada render del componente).
export function useHotkeys(map) {
    const mapRef = useRef(map);
    useEffect(() => {
        mapRef.current = map;
    });

    useEffect(() => {
        function onKeyDown(e) {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;

            const handler = mapRef.current[e.key];
            if (handler) {
                e.preventDefault();
                handler();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}
