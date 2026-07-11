// Fija la zona horaria real de la barbería, sin importar en qué servidor corra el proceso.
process.env.TZ = "America/Mexico_City";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
