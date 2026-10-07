import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BadgeCollection } from "../../src/rewards/BadgeCollection";
import { SignalCard } from "../../src/components/SignalCard";
import type { Signal, AchievementSummary } from "../../src/api/types";
import { communityLeaderBadge } from "../../../../shared/community-leader-badges";

const now = new Date();
const base: Signal = {
  contractVersion: "bourbon-signal/signal@1", id: "demo-1", kind: "availability",
  source: { type: "member", label: "Member #128", actor: { kind: "member", number: 128, label: "Member #128", displayName: "Alex", badges: ["Top Contributor · 2026", "Most Active · Oct 2026", "Spotter · Gold"] } },
  bottle: { name: "Small Batch Kentucky Bourbon", rarity: "allocated" },
  location: { scope: "exact_store", store: { name: "Oak Street Spirits", city: "Louisville", state: "KY" } },
  timing: { displayAt: new Date(now.getTime()-600000).toISOString() },
  evidence: { summary: "A few bottles on the shelf this afternoon. Happy hunting!", photo: true, photoUrl: "https://synthetic.public.blob.vercel-storage.com/demo.svg", helpfulCount: 12, corroborationCount: 0, retailerReported: false, sourceBacked: false },
  strength: "more_activity", availability: { status: "reported", price: 59.99, quantity: 3, quantityLabel: "3 bottles" },
  alertEligibility: { inventory: false, watch: true }, actions: ["helpful", "report"],
};
const posts: Signal[] = [base, {
  ...base, id: "demo-2", source: { ...base.source, actor: { kind: "founder", number: 42, label: "Founder #42", badges: ["Helpful Neighbor · Silver", "Local Scout · Gold"] } },
  bottle: { name: "Bottled in Bond Bourbon", rarity: "limited" }, timing: { displayAt: new Date(now.getTime()-3600000).toISOString() },
  evidence: { ...base.evidence, photo: false, photoUrl: undefined, helpfulCount: 4, summary: "Fresh delivery today. Plenty available at the counter." }, availability: { status: "reported", price: 39.99 },
}, { ...base, id: "demo-3", source: { ...base.source, actor: { ...base.source.actor!, displayName: "A collector with a particularly long chosen display name", badges: [] } }, evidence: { ...base.evidence, summary: "This deliberately long note demonstrates that a member’s caption stays at two lines in the feed even when they write several sentences about everything they found on a trip. Open the post to keep reading." } }];
const badgeIds = ["most_active_month_2026_10", "top_contributor_month_2026_10", "most_active_year_2026", "top_contributor_year_2026"];
const summary: AchievementSummary = {
  points: 0, currentWeeklyStreak: 0, longestWeeklyStreak: 0, eligibleSightings: 0, helpfulSightings: 0, photoSightings: 0,
  badges: badgeIds.map(id => ({ id, label: communityLeaderBadge(id)!.label, earnedAt: "2027-01-08T12:00:00Z", pointsAwarded: 0 })),
  badgeProgress: badgeIds.map(id => ({ id, label: communityLeaderBadge(id)!.label, category: "Leaders", unit: "awards", description: communityLeaderBadge(id)!.description, rules: communityLeaderBadge(id)!.rules, current: 1, target: 1, earned: true, pointsAwarded: 0 })),
  featuredBadgeIds: ["top_contributor_year_2026", "most_active_month_2026_10"],
};
function App() {
  const [tab, setTab] = useState("feed");
  const [notice, setNotice] = useState("");
  const [badges, setBadges] = useState(summary);
  return <main>
    <header><div className="brand">BOURBON SIGNAL</div><h1>Community</h1><p className="demo">Design preview · sample posts and awards</p><nav><button className={tab==="feed"?"selected":""} onClick={()=>setTab("feed")}>Feed</button><button className={tab==="badges"?"selected":""} onClick={()=>setTab("badges")}>Badges</button></nav></header>
    <section className="feed">{tab==="feed" ? posts.map(post=><div data-card={post.id} key={post.id}><SignalCard signal={post} onPress={()=>setNotice(`Opened ${post.bottle.name} — demo details`)} /></div>) : <BadgeCollection summary={badges} saving={false} onFeature={async ids=>setBadges({...badges,featuredBadgeIds:ids})} />}</section>
    {notice?<button className="notice" onClick={()=>setNotice("")}>{notice} · Close</button>:null}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
