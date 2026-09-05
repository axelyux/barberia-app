"use client";

// Red de seguridad para un error en el layout raíz mismo (muy poco común) — a diferencia
// de error.js, este reemplaza TODO <html>/<body>, así que no puede depender de las
// fuentes/CSS que normalmente carga app/layout.js.
export default function GlobalError({ reset }) {
    return (
        <html lang="es">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 16,
                    padding: 24,
                    textAlign: "center",
                    background: "#0a0a0a",
                    color: "#f4f4f5",
                    fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
            >
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>MiBarber tuvo un problema</h1>
                    <p style={{ marginTop: 8, maxWidth: 320, fontSize: 14, color: "#a1a1aa" }}>
                        Algo falló al cargar la aplicación. Intenta de nuevo en un momento.
                    </p>
                </div>
                <button
                    onClick={() => reset()}
                    style={{
                        marginTop: 4,
                        minHeight: 44,
                        padding: "0 24px",
                        border: "none",
                        borderRadius: 10,
                        background: "#d9a441",
                        color: "#0a0a0a",
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    Reintentar
                </button>
            </body>
        </html>
    );
}
