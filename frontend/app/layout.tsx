import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { THEME_SCRIPT } from "@/lib/theme";
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

const DESCRIPTION =
  "Matching estable ciego en Solana. Las listas de preferencias viven solo dentro de un Private Ephemeral Rollup y no se publican nunca.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ronda-ciega.vercel.app"),
  title: { default: "Ronda Ciega", template: "%s · Ronda Ciega" },
  description: DESCRIPTION,
  openGraph: {
    title: "Ronda Ciega",
    description: DESCRIPTION,
    url: "https://ronda-ciega.vercel.app",
    siteName: "Ronda Ciega",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Ronda Ciega", description: DESCRIPTION },
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
      <head>
        {/* Stamps the theme on <html> before first paint. Anything later and a
            light-mode user sees a dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="grain min-h-dvh font-sans">
        <Providers>
          <a href="#main" className="skip-link">
            Ir al contenido
          </a>
          <Nav />
          <main
            id="main"
            className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-8"
          >
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
