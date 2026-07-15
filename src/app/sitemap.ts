import { MetadataRoute } from "next";
import { radarEntries, radarPath, releaseRadarUpdatedAt, stateGuides } from "@/lib/release-radar";

const origin = "https://www.bourbonsignal.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const radarUpdated = releaseRadarUpdatedAt;
  const radarIndexes: MetadataRoute.Sitemap = [
    { url: `${origin}/release-radar`, lastModified: radarUpdated, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/release-radar/briefings`, lastModified: radarUpdated, changeFrequency: "weekly", priority: 0.7 },
    { url: `${origin}/release-radar/states`, lastModified: radarUpdated, changeFrequency: "monthly", priority: 0.65 },
    { url: `${origin}/release-radar/bottles`, lastModified: radarUpdated, changeFrequency: "weekly", priority: 0.7 },
  ];
  const radarDetails: MetadataRoute.Sitemap = radarEntries.map((entry) => ({
    url: `${origin}${radarPath(entry)}`,
    lastModified: entry.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));
  const radarStates: MetadataRoute.Sitemap = stateGuides.map((guide) => ({
    url: `${origin}/release-radar/states/${guide.slug}`,
    lastModified: guide.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    { url: origin, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/sightings`, changeFrequency: "daily", priority: 0.75 },
    { url: `${origin}/pricing`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${origin}/retailers`, changeFrequency: "monthly", priority: 0.55 },
    ...radarIndexes,
    ...radarDetails,
    ...radarStates,
    { url: `${origin}/legal/privacy`, changeFrequency: "monthly", priority: 0.35 },
    { url: `${origin}/legal/terms`, changeFrequency: "monthly", priority: 0.35 },
    { url: `${origin}/legal/refunds`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${origin}/legal/disclaimer`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
