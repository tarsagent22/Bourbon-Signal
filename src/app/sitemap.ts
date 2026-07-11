import { MetadataRoute } from "next";

const origin = "https://www.bourbonsignal.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: origin, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/sightings`, changeFrequency: "daily", priority: 0.75 },
    { url: `${origin}/pricing`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${origin}/legal/privacy`, changeFrequency: "monthly", priority: 0.35 },
    { url: `${origin}/legal/terms`, changeFrequency: "monthly", priority: 0.35 },
    { url: `${origin}/legal/refunds`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${origin}/legal/disclaimer`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
