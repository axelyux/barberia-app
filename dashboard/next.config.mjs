// Fija la zona horaria real de la barbería, sin importar en qué servidor corra el proceso.
process.env.TZ = "America/Mexico_City";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sin esto, el celular (que entra por la IP de tu WiFi, no localhost) no puede conectarse
  // al Hot Module Reload del modo desarrollo, y eso rompe todo el JavaScript interactivo
  // de la página: se puede hacer scroll (es nativo del navegador) pero ningún botón responde.
  allowedDevOrigins: ["192.168.100.28"],
};

export default nextConfig;
