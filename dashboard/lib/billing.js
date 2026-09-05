// Aviso de vencimiento de plan, compartido entre el panel de la barbería (TenantBoard)
// y la pantalla de login (para que el dueño lo vea incluso antes de entrar). Escala de
// urgencia: nada si falta más de una semana o ya se pagó, amarillo ("ligero") entre 3 y
// 7 días, rojo ("urgente") con 2 días o menos o si ya está vencido (PAST_DUE).
export function getBillingNotice({ status, nextDueDate }) {
    if (status === "PAUSED") return null; // ese caso ya se maneja aparte (cuenta desactivada)

    if (status === "PAST_DUE") {
        return { tone: "bad", text: "El plan con MiBarber está vencido. Regulariza el pago para evitar que se pause el servicio." };
    }

    if (status !== "ACTIVE" || !nextDueDate) return null;

    const daysLeft = Math.ceil((new Date(nextDueDate) - new Date()) / (24 * 60 * 60 * 1000));
    if (daysLeft > 7) return null;

    const dayWord = (n) => `${n} día${n === 1 ? "" : "s"}`;
    if (daysLeft <= 2) {
        return {
            tone: "bad",
            text: daysLeft <= 0 ? "El plan con MiBarber vence hoy." : `¡Urgente! El plan con MiBarber vence en ${dayWord(daysLeft)}.`,
        };
    }
    return { tone: "warn", text: `El plan con MiBarber vence en ${dayWord(daysLeft)}.` };
}
