import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-playfair", // keep same CSS var name so all existing code works
  display: "swap",
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
});

export const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans", // keep same CSS var name so all existing code works
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "600", "700"],
});
