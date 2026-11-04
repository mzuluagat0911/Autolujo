import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PT_Serif, Inter, Montserrat } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";
import { sesionEquipo } from "@/lib/equipo/sesion";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const haySesion = jar.getAll().some((c) => c.name.includes("-auth-token"));
  const equipo = haySesion ? await sesionEquipo() : null;
  return (
    <html lang="es" className={`${brandSerif.variable} ${brandUi.variable} ${brandSans.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Shell equipo={equipo}>{children}</Shell>
      </body>
    </html>
  );
}
