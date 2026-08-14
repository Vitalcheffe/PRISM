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
  title: "PRISM — Non-Linear Macroeconomic Simulator",
  description: "A non-linear macroeconomic simulator with a 3,008-weight neural network, 10,000 autonomous agents, and causal relationships extracted from real World Bank reports.",
  keywords: ["economics", "simulation", "neural network", "macroeconomics", "multi-agent", "causal inference", "World Bank"],
  authors: [{ name: "VitalCheffe" }],
  openGraph: {
    title: "PRISM — Non-Linear Macroeconomic Simulator",
    description: "3,008-weight neural network, 10,000 agents, 8 factions, real World Bank data.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PRISM",
    description: "Non-linear macroeconomic simulator",
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
