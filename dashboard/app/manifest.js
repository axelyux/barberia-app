// Convención de Next.js: esto se sirve solo en /manifest.webmanifest y es lo que usa
// el navegador al "Agregar a pantalla de inicio" (PWA) — separado del ícono nativo del
// APK (ese vive en android/app/src/main/res/mipmap-*, generado del mismo logo).
export default function manifest() {
    return {
        name: "MiBarber — Panel",
        short_name: "MiBarber",
        description: "Panel de administración para barberías gestionadas por chatbot",
        start_url: "/",
        display: "standalone",
        background_color: "#0a0a0a",
        theme_color: "#0a0a0a",
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
