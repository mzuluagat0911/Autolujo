import type { Metadata } from "next";
import { PT_Serif, Montserrat } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";

// Marca / títulos — serif clásica (como el wordmark del logo)
const brandSerif = PT_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-brand-serif",
  display: "swap",
});

// UI / etiquetas — sans geométrica (como el tagline "Siempre seguro")
const brandSans = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-brand-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoLujo — Plataforma",
  description: "Plataforma de gestión con IA — Inversiones Auto Lujo Panamá",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${brandSerif.variable} ${brandSans.variable}`}>
      <body className="min-h-screen antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
