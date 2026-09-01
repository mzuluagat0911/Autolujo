import type { Metadata } from "next";
import { PT_Serif, Inter, Montserrat } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";

// Landing — serif del wordmark
const brandSerif = PT_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-brand-serif",
  display: "swap",
});

// Landing — sans de marca (tagline / UI pública)
const brandUi = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

// Dashboard — Inter
const brandSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    <html lang="es" className={`${brandSerif.variable} ${brandUi.variable} ${brandSans.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
