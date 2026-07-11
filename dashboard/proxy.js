import { NextResponse } from "next/server";

// Chequeo rápido (solo existencia de la cookie) antes de renderizar.
// La verificación real de la firma y los permisos vive en lib/auth.js (getSessionUser / requirePermission),
// que corre en cada página y cada server action — este proxy es solo la primera barrera de UX.
export function proxy(request) {
    const hasSession = request.cookies.has("barber_session");
    if (!hasSession) {
        const loginUrl = new URL("/login", request.url);
        return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
}

export const config = {
    matcher: ["/t/:path*"],
};
