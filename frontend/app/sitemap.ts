import type { MetadataRoute } from "next";

// Round pages are addressed by on-chain accounts and come and go with each
// round, so only the two permanent pages are listed.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://ronda-ciega.vercel.app";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/proof`, changeFrequency: "monthly", priority: 0.7 },
  ];
}
