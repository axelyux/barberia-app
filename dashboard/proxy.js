import { NextResponse } from "next/server";

// Chequeo rápido (solo existencia de la cookie) antes de renderizar.
// La verificación real de la firma y los permisos vive en lib/auth.js (getSessionUser / requirePermission),
// que corre en cada página y cada server action — este proxy es solo la primera barrera de UX.
export function proxy(request) {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith("/admin")) {
        if (pathname === "/admin/login") return NextResponse.next();
        if (!request.cookies.has("barber_admin_session")) {
            return NextResponse.redirect(new URL("/admin/login", request.url));
        }
        return NextResponse.next();
    }

    if (!request.cookies.has("barber_session")) {
        return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: ["/t/:path*", "/admin/:path*"],
};
