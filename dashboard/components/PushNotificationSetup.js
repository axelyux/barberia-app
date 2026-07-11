"use client";

import { useEffect } from "react";
import { registerPushToken } from "@/app/push-actions";

// Solo hace algo cuando corre DENTRO de la app de Capacitor (en el navegador normal no pasa nada).
export default function PushNotificationSetup() {
    useEffect(() => {
        let cleanup = () => {};

        (async () => {
            let Capacitor, PushNotifications;
            try {
                ({ Capacitor } = await import("@capacitor/core"));
                ({ PushNotifications } = await import("@capacitor/push-notifications"));
            } catch {
                return; // paquetes no disponibles (ej. corriendo en un navegador normal sin Capacitor)
            }
            if (!Capacitor.isNativePlatform()) return;

            const permission = await PushNotifications.requestPermissions();
            if (permission.receive !== "granted") return;
            await PushNotifications.register();

            const onRegistration = PushNotifications.addListener("registration", (token) => {
                registerPushToken(token.value, Capacitor.getPlatform());
            });
            const onError = PushNotifications.addListener("registrationError", (err) => {
                console.error("Error registrando notificaciones push:", err);
            });

            cleanup = () => {
                onRegistration.remove();
                onError.remove();
            };
        })();

        return () => cleanup();
    }, []);

    return null;
}
