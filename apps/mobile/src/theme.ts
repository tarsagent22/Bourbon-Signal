export const colors = {
  background: "#0B0A09",
  surface: "#171411",
  surfaceRaised: "#211C17",
  border: "#3A3027",
  text: "#F3ECE2",
  muted: "#B9AA98",
  accent: "#D69A4A",
  accentPressed: "#B97A2D",
  danger: "#E07A6A",
  success: "#7EAD83",
};

// Shared native type scale. Fraunces identifies pages and bottles; system text keeps controls clear.
export const fonts = { heading: "Fraunces_700Bold", bottle: "Fraunces_700Bold" } as const;
export const typeScale = { micro: 11, caption: 12, small: 13, body: 14, input: 16, subheading: 18, section: 20, title: 32 } as const;
export const surfaces = { feedCard: "rgba(14, 12, 10, 0.86)" } as const;
