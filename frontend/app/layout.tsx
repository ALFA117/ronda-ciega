import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ronda Ciega",
  description:
    "Matching estable ciego en Solana. Dices a quién quieres sin que nadie sepa que lo dijiste.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-5xl px-5 pb-32 sm:px-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
