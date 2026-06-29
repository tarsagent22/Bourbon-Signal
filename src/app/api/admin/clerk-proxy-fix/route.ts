import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ClerkDomain = {
  id?: string;
  name?: string;
  frontend_api_url?: string;
  proxy_url?: string | null;
  cname_targets?: unknown;
};

function authorized(req: NextRequest) {
  const expected = process.env.CLERK_DOMAIN_FIX_SECRET?.trim();
  const provided = req.headers.get("x-fix-secret")?.trim();
  return Boolean(expected && provided && expected === provided);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) return NextResponse.json({ error: "Missing Clerk secret" }, { status: 503 });

  const proxyUrl = "https://www.bourbonsignal.com/__clerk";
  const headers = { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" };

  const listRes = await fetch("https://api.clerk.com/v1/domains", { headers, cache: "no-store" });
  const listText = await listRes.text();
  if (!listRes.ok) return NextResponse.json({ error: "Clerk domain list failed", status: listRes.status, body: listText.slice(0, 600) }, { status: 502 });

  const parsed = JSON.parse(listText) as ClerkDomain[] | { data?: ClerkDomain[] };
  const domains = Array.isArray(parsed) ? parsed : parsed.data || [];
  const domain = domains.find((item) => {
    const haystack = `${item.name || ""} ${item.frontend_api_url || ""}`;
    return haystack.includes("bourbonsignal.com") || haystack.includes("clerk.bourbonsignal.com");
  });

  if (!domain?.id) return NextResponse.json({ error: "Bourbon Signal Clerk domain not found", domains: domains.map(({ id, name, frontend_api_url, proxy_url, cname_targets }) => ({ id, name, frontend_api_url, proxy_url, cname_targets })) }, { status: 404 });

  const patchRes = await fetch(`https://api.clerk.com/v1/domains/${domain.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ proxy_url: proxyUrl }),
  });
  const patchText = await patchRes.text();
  if (!patchRes.ok) return NextResponse.json({ error: "Clerk proxy patch failed", status: patchRes.status, body: patchText.slice(0, 600), domain: { id: domain.id, name: domain.name, frontend_api_url: domain.frontend_api_url, proxy_url: domain.proxy_url } }, { status: 502 });

  const updated = JSON.parse(patchText) as ClerkDomain;
  return NextResponse.json({ ok: true, proxyUrl, domain: { id: updated.id, name: updated.name, frontend_api_url: updated.frontend_api_url, proxy_url: updated.proxy_url } });
}
