import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.bourbonsignal.com",
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://www.bourbonsignal.com/sightings",
      changeFrequency: "daily",
      priority: 0.75,
    },
    {
      url: "https://www.bourbonsignal.com/pricing",
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: "https://www.bourbonsignal.com/legal/privacy",
      changeFrequency: "monthly",
      priority: 0.35,
    },
    {
      url: "https://www.bourbonsignal.com/legal/terms",
      changeFrequency: "monthly",
      priority: 0.35,
    },
    {
      url: "https://www.bourbonsignal.com/legal/refunds",
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: "https://www.bourbonsignal.com/legal/disclaimer",
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
