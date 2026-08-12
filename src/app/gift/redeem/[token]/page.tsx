import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import RedemptionClient from "./RedemptionClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // no-store prevents token-bearing landings from entering a shared cache.

export default async function GiftRedemptionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const redirect_url = `/gift/redeem/${encodeURIComponent(token)}`;
  return <><Navigation /><main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "130px 20px 70px", background: "radial-gradient(circle at 50% 0,rgba(196,148,58,.18),transparent 36%),var(--color-bg-primary)", color: "var(--color-text-primary)" }}><RedemptionClient token={token} redirectUrl={redirect_url} /></main><Footer /></>;
}
