import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto Lujo · Cartera",
  description: "Motor de cartera con IA — Inversiones Auto Lujo Panamá",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
