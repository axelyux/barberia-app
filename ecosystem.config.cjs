// Configuración de PM2 para el VPS (Oracle Cloud) — SOLO el bot de WhatsApp corre aquí.
// El panel/dashboard se despliega aparte en Vercel; ver dashboard/README.md.
//
// Dos tipos de proceso:
//   1. "webhook-router": UNO solo para toda la plataforma. Es la única URL pública que
//      se configura en Meta; reenvía cada webhook a la barbería correcta según
//      metaPhoneNumberId → metaPort (ver webhook-router.js).
//   2. "bot-<slug>": uno por cada barbería con WhatsApp Cloud API ya vinculado
//      (metaPhoneNumberId/metaAccessToken/metaPort configurados en su fila de Tenant).
//      Para dar de alta una barbería nueva, agrega otra entrada aquí con su propio
//      METATENANT_SLUG — no hace falta tocar las demás.
//
// app.js (Baileys, API no oficial) queda fuera de esta lista a propósito: es el bot
// legado, se conserva en el repo como respaldo pero no se lanza en producción.
module.exports = {
    apps: [
        {
            name: 'webhook-router',
            script: 'webhook-router.js',
            cwd: __dirname,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,
        },
        {
            name: 'bot-sable-barber-studio',
            script: 'whatsapp-meta-bot.js',
            cwd: __dirname,
            env: {
                METATENANT_SLUG: 'sable-barber-studio',
            },
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,
        },
        // Para agregar la siguiente barbería:
        // {
        //     name: 'bot-<slug-de-la-barberia>',
        //     script: 'whatsapp-meta-bot.js',
        //     cwd: __dirname,
        //     env: { METATENANT_SLUG: '<slug-de-la-barberia>' },
        //     autorestart: true,
        //     max_restarts: 10,
        //     restart_delay: 3000,
        // },
    ],
}
