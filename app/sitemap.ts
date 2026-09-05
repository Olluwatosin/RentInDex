import type { MetadataRoute } from "next";

// Organic search is the only distribution channel that works before there is an
// audience, and it cannot index what it cannot find. Only pages that stand on
// their own are listed — a sitemap full of thin pages reads as a content farm.
const BASE = "https://rentindex.com.ng";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/rights`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/calculator`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/submit`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
