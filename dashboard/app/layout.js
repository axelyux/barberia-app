import "./globals.css";

export const metadata = {
  title: "Barber SaaS — Panel",
  description: "Panel de administración para barberías gestionadas por chatbot",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
