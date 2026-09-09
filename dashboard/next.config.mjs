// Fija la zona horaria real de la barbería, sin importar en qué servidor corra el proceso.
process.env.TZ = "America/Mexico_City";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sin esto, el celular (que entra por la IP de tu WiFi, no localhost) no puede conectarse
  // al Hot Module Reload del modo desarrollo, y eso rompe todo el JavaScript interactivo
  // de la página: se puede hacer scroll (es nativo del navegador) pero ningún botón responde.
  allowedDevOrigins: ["192.168.100.28"],
  // Evita que el bundler intente empaquetar el motor nativo de Prisma en vez de dejarlo
  // como dependencia de servidor tal cual — necesario para que funcione en las funciones
  // serverless de Vercel.
  serverExternalPackages: ["@prisma/client"],
  // No se agrega Content-Security-Policy: esta app carga fuentes de Google Fonts, usa
  // estilos/scripts inline (Tailwind, Next.js), y el WebView de la APK necesita cargar el
  // sitio completo — una CSP mal calibrada rompería más de lo que protege sin antes medir
  // cada fuente/script real. Estos tres headers sí son seguros de aplicar sin riesgo.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
