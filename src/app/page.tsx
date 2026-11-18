import Home from "./LegacyHome";
import { readPublicMarketingFeed } from "@/lib/public-marketing-feed";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { drops, unavailable } = await readPublicMarketingFeed();
  return <Home appFunnel drops={drops} unavailable={unavailable} />;
}
