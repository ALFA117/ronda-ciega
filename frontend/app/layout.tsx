import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { en } from "@/lib/i18n/en";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { CommandPalette } from "@/components/CommandPalette";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/**
 * The headline face, and the only place a serif appears.
 *
 * Inter set the headlines too, which is correct and says nothing: it is the
 * face on every dashboard shipped this decade, so a page wearing it reads as
 * competent and anonymous. A product that moves other people's money can
 * afford one deliberate choice, and a serif at display size is the cheapest
 * one there is — it costs nothing in legibility because it is never used
 * below 26px, and it carries the whole difference between "a tool" and "a
 * desk somebody runs".
 *
 * Body text stays Inter and numbers stay JetBrains Mono. A serif in a table
 * of amounts would be a costume.
 */
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * What a link to this page says about itself, in a chat client, a search
 * result or a card.
 *
 * English, and taken from the dictionary rather than written again here. It
 * was a Spanish sentence of its own, which meant the two things a judge sees
 * before clicking — this line and the share image — were in a language the
 * page they land on does not open in. Reading `en` also keeps the promise on
 * the card identical to the promise under the headline.
 */
const DESCRIPTION = `${en.hero.lede} ${en.hero.headline} ${en.hero.subline}`;

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
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
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
          <CommandPalette />
        </Providers>
      </body>
    </html>
  );
}
