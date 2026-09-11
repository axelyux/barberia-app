import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import { ToastProvider } from "@/components/Toast";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "MiBarber — Panel",
  description: "Panel de administración para barberías gestionadas por chatbot",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // En esta versión de Next.js este campo genera "mobile-web-app-capable" (no el
    // clásico "apple-mobile-web-app-capable" de versiones anteriores) — se agrega el
    // clásico a mano en "other" de abajo para que iOS lo reconozca en cualquier versión.
    capable: true,
    title: "MiBarber",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`h-full antialiased ${sans.variable} ${mono.variable}`}>
      <body className="min-h-full">
        <RegisterServiceWorker />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
