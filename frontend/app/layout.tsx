import type { Metadata } from "next";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ronda Ciega",
  description:
    "Matching estable ciego en Solana. Dices a quién quieres sin que nadie sepa que lo dijiste.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-5xl px-6 pb-24">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
