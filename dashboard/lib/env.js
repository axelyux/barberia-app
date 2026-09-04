// Validación centralizada de configuración. Se importa desde lib/auth.js (y desde
// cualquier otro punto que necesite un secreto) para que, si falta una variable de
// entorno crítica, el proceso truene de inmediato en vez de arrancar con un valor
// de repuesto inseguro escrito en el código fuente.
const required = ["DATABASE_URL", "SESSION_SECRET"];

for (const key of required) {
    if (!process.env[key]) {
        throw new Error(
            `Falta la variable de entorno obligatoria "${key}". Revisa tu ".env" (local) o la configuración de Environment Variables del proyecto en Vercel.`
        );
    }
}

export const SESSION_SECRET = process.env.SESSION_SECRET;
