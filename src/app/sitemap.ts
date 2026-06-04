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
      url: "https://bourbonsignal.com/events",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];
}
