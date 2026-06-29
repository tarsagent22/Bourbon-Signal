import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://bourbonsignal.com",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://bourbonsignal.com/sightings",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.75,
    },
    {
      url: "https://bourbonsignal.com/bottle-check",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: "https://bourbonsignal.com/pricing",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: "https://bourbonsignal.com/legal/privacy",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.35,
    },
    {
      url: "https://bourbonsignal.com/legal/terms",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.35,
    },
  ];
}
