import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ronda Ciega — blind stable matching",
    short_name: "Ronda Ciega",
    description: "Say who you want without anyone knowing you said it. Sealed rankings, stable pairings, on Solana devnet.",
    start_url: "/",
    display: "standalone",
    background_color: "#05070d",
    theme_color: "#05070d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
