// Configuración de PM2 para el servidor (Oracle Cloud).
// Cada barbería corre como un proceso independiente, identificado por TENANT_SLUG.
// Por ahora solo hay un tenant real: sable-barber-studio.
// Para agregar otra barbería, se agrega otra entrada aquí con su propio slug y puerto.
module.exports = {
    apps: [
        {
            name: 'bot-sable-barber-studio',
            script: 'app.js',
            cwd: __dirname,
            env: {
                TENANT_SLUG: 'sable-barber-studio',
                PORT: 3008,
            },
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,
        },
    ],
}
