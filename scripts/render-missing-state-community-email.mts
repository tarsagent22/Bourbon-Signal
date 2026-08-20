import { writeFile } from "node:fs/promises";
import { render } from "@react-email/render";
const loaded = await import("../src/components/emails/MissingStateCommunityEmail.tsx");
const module = { ...loaded, ...((loaded as { default?: object }).default || {}) } as typeof loaded;
const { MissingStateCommunityEmail } = module;
const html = await render(MissingStateCommunityEmail({
  firstName: "Alex",
  setupUrl: "https://www.bourbonsignal.com/welcome?legacy=1&source=preview",
  unsubscribeUrl: "https://www.bourbonsignal.com/unsubscribe",
}));
await writeFile(process.argv[2] || "missing-state-community-preview.html", html, "utf8");
