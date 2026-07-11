import { MetadataRoute } from "next";
import { radarEntries, radarPath, stateGuides } from "@/lib/release-radar";

const origin = "https://www.bourbonsignal.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const radarPages: MetadataRoute.Sitemap = [
    {
      url: `${origin}/release-radar`,
      lastModified: new Date("2026-07-10"),
      changeFrequency: "daily",
      priority: 0.95,
    },
    ...radarEntries.map((entry) => ({
      url: `${origin}${radarPath(entry)}`,
      lastModified: new Date(entry.updatedAt),
      changeFrequency: "weekly" as const,
      priority: entry.featured ? 0.88 : 0.78,
    })),
    ...stateGuides.map((guide) => ({
      url: `${origin}/release-radar/states/${guide.slug}`,
      lastModified: new Date(guide.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.84,
    })),
  ];

  return [
    { url: origin, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/sightings`, changeFrequency: "daily", priority: 0.75 },
    { url: `${origin}/pricing`, changeFrequency: "weekly", priority: 0.85 },
    ...radarPages,
    { url: `${origin}/legal/privacy`, changeFrequency: "monthly", priority: 0.35 },
    { url: `${origin}/legal/terms`, changeFrequency: "monthly", priority: 0.35 },
    { url: `${origin}/legal/refunds`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${origin}/legal/disclaimer`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
