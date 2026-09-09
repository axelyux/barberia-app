// Textos con los que arranca el bot de una barbería nueva, ya con su nombre puesto.
// Se crean al dar de alta la barbería para que nadie empiece con mensajes genéricos;
// después el dueño los edita desde la pestaña "Bot" de su panel.
//
// Ojo: el menú principal se manda como BOTONES de WhatsApp, así que la bienvenida
// NO debe enumerar opciones ("1. Agendar...") ni pedir que respondan con un número.
export function defaultFlowMessages(tenantName) {
    const nombre = tenantName?.trim() || "nuestra barbería";
    return [
        { key: "WELCOME", text: `👋 ¡Hola! Bienvenido a *${nombre}*.\n\n¿En qué podemos ayudarte hoy?` },
        { key: "SERVICES_INTRO", text: "💈 *Nuestros servicios:*" },
        { key: "BOOKING_ASK_DAY", text: "📅 Vamos a agendar tu cita. ¿Qué día te gustaría venir?" },
        { key: "BOOKING_ASK_TIME", text: "🕒 Perfecto. ¿A qué hora te gustaría tu cita?" },
        { key: "BOOKING_CONFIRMED", text: `Te esperamos en ${nombre}. ¡Gracias por tu preferencia!` },
        { key: "CONTACT", text: "Si necesitas atención personalizada, escríbenos por aquí y con gusto te ayudamos." },
        {
            key: "CLOSED",
            text: "🕒 En este momento estamos cerrados. En cuanto abramos con gusto te atendemos — ¡gracias por tu paciencia!",
        },
        {
            key: "FALLBACK",
            text: "No entendí ese mensaje 🤔 Escribe *agendar* para reservar tu cita, *servicios* para ver precios, o *hablar con alguien* si quieres que te atienda una persona.",
        },
    ];
}
