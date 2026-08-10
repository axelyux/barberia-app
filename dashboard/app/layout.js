import "./globals.css";

export const metadata = {
  title: "MiBarber — Panel",
  description: "Panel de administración para barberías gestionadas por chatbot",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
