import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Système Dynamique — Simulateur Macroéconomique",
  description: "Simulateur macroéconomique haute-fidélité. Données réelles Banque Mondiale, modèle neuronal à retard, réactions en chaîne. Testez la résilience de politiques publiques.",
  keywords: ["simulateur", "macroéconomie", "simulation", "politique publique", "effet papillon", "Maroc", "Banque Mondiale"],
  authors: [{ name: "Projet Système Dynamique" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Système Dynamique — Simulateur Macroéconomique",
    description: "Simulateur macroéconomique : données réelles, modèle neuronal à retard, réactions en chaîne.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Système Dynamique",
    description: "Simulateur macroéconomique haute-fidélité",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
