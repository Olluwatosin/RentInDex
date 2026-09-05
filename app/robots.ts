import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing useful to a crawler, and /api/admin must never be indexed.
      disallow: ["/api/"],
    },
    sitemap: "https://rentindex.com.ng/sitemap.xml",
  };
}
