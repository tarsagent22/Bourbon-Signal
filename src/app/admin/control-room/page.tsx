import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { getCompanyControlRoomSnapshot } from "@/lib/company-control-room-server";
import { companyMemberPrimaryEmail, isCompanyControlRoomOwnerEmail } from "@/lib/company-control-room";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(cents: number | null, currency = "usd") {
  if (cents === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function count(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(value);
}

function dateTime(value: string | null) {
  if (!value) return "No timestamp";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "No timestamp" : parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusTone(status: string) {
  if (["healthy", "monitoring", "ok", "stripe", "resend"].includes(status)) return "good";
  if (["degraded", "stale_useful", "dry_run"].includes(status)) return "warn";
  return "bad";
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string | number; detail: string; accent?: boolean }) {
  return (
    <article className={`cr-metric ${accent ? "accent" : ""}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

export default async function CompanyControlRoomPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/admin/control-room");
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!isCompanyControlRoomOwnerEmail(companyMemberPrimaryEmail(user))) notFound();

  const snapshot = await getCompanyControlRoomSnapshot();
  const { memberships, founder, revenue, audience, growth, lifecycle, demand, experiments, retailer, engine, alerts, release } = snapshot;
  const deliveryCounts = alerts.counts as Record<string, number>;

  return (
    <main className="cr-shell">
      <style>{controlRoomCss}</style>
      <div className="cr-frame">
        <header className="cr-header">
          <div>
            <p className="cr-kicker">Private owner view</p>
            <h1>Company Control Room</h1>
            <p className="cr-subtitle">Members, revenue, conversion readiness, and operating health in one place.</p>
          </div>
          <div className="cr-checked">
            <span className={`cr-status ${statusTone(engine.status)}`}>{engine.status.replaceAll("_", " ")}</span>
            <p>Checked {dateTime(snapshot.checkedAt)}</p>
          </div>
        </header>

        <nav className="cr-jump" aria-label="Control room sections">
          <a href="#members">Members</a>
          <a href="#revenue">Revenue</a>
          <a href="#campaign">Campaign</a>
          <a href="#growth">Growth funnel</a>
          <a href="#demand">Demand</a>
          <a href="#experiments">Experiments</a>
          <a href="#retailers">Retailers</a>
          <a href="#engine">Engine</a>
          <a href="#alerts">Alerts</a>
        </nav>

        <section id="members" className="cr-section">
          <div className="cr-heading">
            <div><p>Company</p><h2>Membership base</h2></div>
            <span>{memberships.counts.paid} paid · {memberships.counts.free} free</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="Total accounts" value={memberships.counts.total} detail={`${memberships.counts.retailer} retailer account`} />
            <Metric label="Paid members" value={memberships.counts.paid} detail={`${memberships.counts.standard} Standard · ${memberships.counts.barrel} Barrel`} accent />
            <Metric label="Founder members" value={memberships.counts.founder} detail={`${founder.remaining} of ${founder.limit} spots remain`} />
            <Metric label="Past due" value={memberships.counts.pastDue} detail="Membership metadata requiring attention" />
          </div>
        </section>

        <section id="demand" className="cr-section">
          <div className="cr-heading">
            <div><p>Investment signal</p><h2>Demand-weighted investment</h2></div>
            <span>Minimum cohort {demand.privacy.minCohortSize}</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="Eligible members" value={demand.eligibleMembers} detail={`${demand.contributingMembers} contributed approved preferences`} />
            <Metric label="Bottle cohorts" value={demand.bottles.length} detail={`${demand.suppressed.bottleCohorts} small cohorts suppressed`} accent />
            <Metric label="State cohorts" value={demand.geographies.length} detail={`${demand.suppressed.geographyCohorts} small cohorts suppressed`} />
            <Metric label="Top demand weight" value={demand.bottles[0]?.weightedDemand ?? demand.geographies[0]?.weightedDemand ?? 0} detail="Canonical bottle or active-state aggregate" />
          </div>
          <dl className="cr-run-counts">
            {demand.bottles.slice(0, 2).map((item) => (
              <div key={item.canonicalBottleId}><dt>{item.canonicalBottleName}</dt><dd>{item.weightedDemand}</dd></div>
            ))}
            {demand.geographies.slice(0, 2).map((item) => (
              <div key={item.state}><dt>{item.state} demand</dt><dd>{item.weightedDemand}</dd></div>
            ))}
          </dl>
          <p className="cr-note">Catalog-resolved bottles and active state codes only. Member identifiers, raw searches, and event histories are excluded from this aggregate.</p>
        </section>

        <section id="experiments" className="cr-section">
          <div className="cr-heading">
            <div><p>Measured product changes</p><h2>Controlled experiments</h2></div>
            <span className={`cr-status ${experiments.killSwitchEnabled ? "bad" : "good"}`}>{experiments.killSwitchEnabled ? "Kill switch on" : "Guardrails ready"}</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="Active" value={experiments.activeExperiment ? 1 : 0} detail={experiments.activeExperiment || "No experiment active"} accent />
            <Metric label="Registry" value={experiments.registryCount} detail="One-active maximum enforced" />
            <Metric label="Reported tests" value={experiments.aggregate.experiments.length} detail="Aggregate production telemetry only" />
            <Metric label="Privacy floor" value={experiments.aggregate.privacy.minCohortSize} detail="Smaller variant cohorts suppressed" />
          </div>
          {experiments.activeDefinition ? (
            <dl className="cr-experiment-contract">
              <div><dt>Baseline</dt><dd>{experiments.activeDefinition.baseline}</dd></div>
              <div><dt>Hypothesis</dt><dd>{experiments.activeDefinition.hypothesis}</dd></div>
              <div><dt>Primary metric</dt><dd>{experiments.activeDefinition.primaryMetric} · minimum {experiments.activeDefinition.minSampleSizePerVariant} per variant</dd></div>
              <div><dt>Stop rule</dt><dd>{experiments.activeDefinition.stopRule}</dd></div>
              <div><dt>Rollback rule</dt><dd>{experiments.activeDefinition.rollbackRule}</dd></div>
            </dl>
          ) : null}
          {experiments.aggregate.experiments.map((experiment) => (
            <dl className="cr-run-counts" key={experiment.experiment}>
              {experiment.variants.map((variant) => (
                <div key={variant.variant}>
                  <dt>{variant.variant.replaceAll("_", " ")}</dt>
                  <dd>{variant.suppressed ? "Suppressed" : `${variant.metrics?.[experiment.primaryMetric] ?? 0} / ${variant.exposures}`}</dd>
                </div>
              ))}
            </dl>
          ))}
          <p className="cr-note">Unique authenticated members only; owners and retailer accounts are excluded. Assignment is stable and deterministic, and no identifiers, timestamps, or raw browsing history enter this aggregate.</p>
        </section>

        <section id="revenue" className="cr-section">
          <div className="cr-heading">
            <div><p>Commercial</p><h2>Revenue pulse</h2></div>
            <span className={`cr-status ${statusTone(revenue.source)}`}>{revenue.source === "stripe" ? "Live Stripe" : "Stripe unavailable"}</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="Monthly recurring" value={money(revenue.monthlyRecurringCents, revenue.currency)} detail="Active Stripe subscriptions" accent />
            <Metric label="Collected · 30 days" value={money(revenue.collectedLast30DaysCents, revenue.currency)} detail="Successful charges less refunds" />
            <Metric label="Collected · all time" value={money(revenue.grossCollectedCents, revenue.currency)} detail={`${money(revenue.refundedCents, revenue.currency)} refunded`} />
            <Metric label="Subscriptions" value={count(revenue.activeSubscriptions)} detail={`${count(revenue.pastDueSubscriptions)} currently past due`} />
          </div>
          {revenue.source !== "stripe" ? (
            <p className="cr-note">Stripe could not be queried. Membership-derived recurring estimate: {money(memberships.estimatedMonthlyRecurringCents)} monthly.</p>
          ) : null}
        </section>

        <section id="campaign" className="cr-section">
          <div className="cr-heading">
            <div><p>Conversion</p><h2>Free-member campaign readiness</h2></div>
            <span className={`cr-status ${statusTone(audience.source)}`}>{audience.source === "resend" ? "Audience connected" : "Audience unavailable"}</span>
          </div>
          <div className="cr-campaign-grid">
            <div className="cr-campaign-number">
              <span>Reachable free members</span>
              <strong>{count(audience.reachableFreeMembers)}</strong>
              <p>Active Resend contacts intersected with eligible free Clerk accounts.</p>
            </div>
            <dl>
              <div><dt>Eligible free members</dt><dd>{audience.eligibleFreeMembers}</dd></div>
              <div><dt>Active audience contacts</dt><dd>{count(audience.activeContacts)}</dd></div>
              <div><dt>Paid members excluded</dt><dd>{memberships.counts.paid}</dd></div>
              <div><dt>Owners and retailers excluded</dt><dd>{memberships.counts.retailer + memberships.counts.owner}</dd></div>
            </dl>
          </div>
          <p className="cr-note">This view reports counts only. Customer email addresses are never rendered into the dashboard.</p>
        </section>

        <section id="growth" className="cr-section">
          <div className="cr-heading">
            <div><p>Activation</p><h2>Growth funnel</h2></div>
            <span>days7 · days30 cohorts</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="Accounts · 7 days" value={growth.days7.accounts} detail={`${growth.days7.freeValueReached} reached free value`} />
            <Metric label="Checkout starts · 7 days" value={growth.days7.checkoutStarted} detail={`${growth.days7.membershipActivated} memberships activated`} accent />
            <Metric label="Paid setup · 30 days" value={growth.days30.paidActivationCompleted} detail={`${growth.days30.firstAlertCreated} received a first signal`} />
            <Metric label="Unknown source · 30 days" value={growth.days30.unknownAttribution} detail={`${growth.days30.accounts} account cohort`} />
          </div>
          <dl className="cr-run-counts">
            <div><dt>Free · no first value</dt><dd>{lifecycle.freeNoValue}</dd></div>
            <div><dt>Checkout · not activated</dt><dd>{lifecycle.checkoutNotActivated}</dd></div>
            <div><dt>Paid · setup incomplete</dt><dd>{lifecycle.paidSetupIncomplete}</dd></div>
            <div><dt>Ready · no first alert</dt><dd>{lifecycle.activatedNoFirstAlert}</dd></div>
          </dl>
          <p className="cr-note">First-touch sources and milestone timestamps are private, bounded metadata. No customer identities are rendered here.</p>
        </section>

        <section id="retailers" className="cr-section">
          <div className="cr-heading">
            <div><p>Supply network</p><h2>Retailer participation</h2></div>
            <span className={`cr-status ${statusTone(retailer.source)}`}>{retailer.source === "database" ? "Database connected" : "Unavailable"}</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="Applications" value={count(retailer.applications)} detail={`${count(retailer.pendingApplications)} pending review`} />
            <Metric label="Verified stores" value={count(retailer.verifiedStores)} detail="Verified primary retailer locations" />
            <Metric label="Stores live now" value={count(retailer.storesWithLiveSignals)} detail="Unique verified retailers with a live signal" accent />
            <Metric label="Live signals" value={count(retailer.liveSignals)} detail={retailer.partial ? "Partial application window" : "Current active submissions"} />
          </div>
        </section>

        <section id="engine" className="cr-section">
          <div className="cr-heading">
            <div><p>Data plane</p><h2>Coverage and freshness</h2></div>
            <span className={`cr-status ${statusTone(engine.status)}`}>{engine.status.replaceAll("_", " ")} · {engine.ageMinutes ?? "—"} min</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="Current signals" value={count(engine.signals)} detail={`${count(engine.alertCandidates)} alert candidates`} accent />
            <Metric label="Store records" value={count(engine.stores)} detail="Source-backed locations" />
            <Metric label="Covered states" value={engine.activeStates} detail={`${engine.inventoryStates} with live inventory`} />
            <Metric label="State exceptions" value={engine.failedStates + engine.degradedStates + engine.staleStates} detail={`${engine.failedStates} failed · ${engine.degradedStates} degraded · ${engine.staleStates} stale`} />
          </div>
          <div className="cr-line"><span>Engine generated</span><strong>{dateTime(engine.generatedAt)}</strong></div>
        </section>

        <section id="alerts" className="cr-section">
          <div className="cr-heading">
            <div><p>Delivery</p><h2>Member alert system</h2></div>
            <span className={`cr-status ${statusTone(alerts.status)}`}>{alerts.status.replaceAll("_", " ")}</span>
          </div>
          <div className="cr-delivery">
            <div><span>On-site</span><strong>{alerts.onSiteEnabled ? "Enabled" : "Off"}</strong></div>
            <div><span>Email</span><strong>{alerts.emailEnabled ? "Enabled" : "Off"}</strong></div>
            <div><span>SMS</span><strong>{alerts.smsEnabled ? "Enabled" : "Off"}</strong></div>
            <div><span>Last run</span><strong>{alerts.ageMinutes ?? "—"} min ago</strong></div>
          </div>
          <dl className="cr-run-counts">
            <div><dt>Users matched</dt><dd>{count(deliveryCounts.usersMatched ?? 0)}</dd></div>
            <div><dt>On-site created</dt><dd>{count(deliveryCounts.onSiteAlertsCreated ?? 0)}</dd></div>
            <div><dt>Emails sent</dt><dd>{count(deliveryCounts.emailsSent ?? 0)}</dd></div>
            <div><dt>SMS sent</dt><dd>{count(deliveryCounts.smsSent ?? 0)}</dd></div>
          </dl>
          <div className="cr-line"><span>Alert monitor completed</span><strong>{dateTime(alerts.lastRunAt)}</strong></div>
        </section>

        <section className="cr-section cr-links">
          <div className="cr-heading"><div><p>Operator tools</p><h2>Detailed workspaces</h2></div></div>
          <div>
            <Link href="/admin/operations">Engine operations <span>→</span></Link>
            <Link href="/admin/retailers">Retailer review <span>→</span></Link>
            <Link href="/admin/sightings">Sighting review <span>→</span></Link>
            <Link href="/admin/bottle-queue">Bottle queue <span>→</span></Link>
          </div>
        </section>

        <footer className="cr-footer">
          <span>Deployment {release.deploymentId || "unknown"}</span>
          <Link href="/">Return to Bourbon Signal</Link>
        </footer>
      </div>
    </main>
  );
}

const controlRoomCss = `
.cr-shell{min-height:100vh;background:radial-gradient(circle at 78% 0%,rgba(196,148,58,.12),transparent 28%),#0d0a07;color:#f5edd6;padding:36px 18px 64px;font-family:var(--font-dm-sans)}
.cr-frame{width:min(1180px,100%);margin:0 auto}.cr-header{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;padding:30px 0 26px;border-bottom:1px solid rgba(245,237,214,.12)}
.cr-kicker,.cr-heading p{margin:0;color:#c4943a;font:900 10px/1 var(--font-jetbrains);letter-spacing:.18em;text-transform:uppercase}.cr-header h1{margin:10px 0 0;font:700 clamp(38px,6vw,66px)/.94 var(--font-playfair);letter-spacing:-.045em}.cr-subtitle{max-width:680px;margin:16px 0 0;color:rgba(245,237,214,.58);font-size:14px;line-height:1.55}
.cr-checked{text-align:right}.cr-checked p{margin:10px 0 0;color:rgba(245,237,214,.45);font:11px/1.3 var(--font-jetbrains)}.cr-status{display:inline-flex;border:1px solid;border-radius:999px;padding:7px 10px;font:900 9px/1 var(--font-jetbrains);letter-spacing:.12em;text-transform:uppercase}.cr-status.good{border-color:rgba(115,201,135,.34);background:rgba(56,130,74,.13);color:#aee7ba}.cr-status.warn{border-color:rgba(220,166,55,.38);background:rgba(196,148,58,.12);color:#efd38f}.cr-status.bad{border-color:rgba(222,94,73,.36);background:rgba(154,50,35,.14);color:#f4aa9f}
.cr-jump{position:sticky;top:0;z-index:5;display:flex;gap:7px;overflow:auto;padding:14px 0;background:linear-gradient(180deg,#0d0a07 72%,transparent)}.cr-jump a{border:1px solid rgba(245,237,214,.1);padding:8px 11px;color:rgba(245,237,214,.64);font:800 10px/1 var(--font-jetbrains);letter-spacing:.08em;text-decoration:none;text-transform:uppercase;white-space:nowrap}.cr-jump a:hover,.cr-jump a:focus-visible{outline:none;border-color:rgba(196,148,58,.55);color:#f5edd6}
.cr-section{scroll-margin-top:62px;margin-top:22px;border:1px solid rgba(245,237,214,.1);background:linear-gradient(145deg,rgba(255,255,255,.042),rgba(255,255,255,.018));padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.17)}.cr-heading{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:20px}.cr-heading h2{margin:7px 0 0;font:700 clamp(24px,3vw,34px)/1 var(--font-playfair);letter-spacing:-.025em}.cr-heading>span{color:rgba(245,237,214,.5);font:11px/1.3 var(--font-jetbrains)}
.cr-metrics{display:grid;gap:1px;border:1px solid rgba(245,237,214,.08);background:rgba(245,237,214,.08)}.cr-metrics.four{grid-template-columns:repeat(4,minmax(0,1fr))}.cr-metric{min-height:158px;padding:19px;background:#15100c}.cr-metric.accent{background:linear-gradient(145deg,rgba(196,148,58,.18),#15100c 64%)}.cr-metric p{margin:0;color:rgba(245,237,214,.46);font:900 9px/1 var(--font-jetbrains);letter-spacing:.12em;text-transform:uppercase}.cr-metric strong{display:block;margin-top:20px;color:#f5edd6;font:700 clamp(28px,4vw,43px)/.95 var(--font-playfair);letter-spacing:-.035em;overflow-wrap:anywhere}.cr-metric span{display:block;margin-top:15px;color:rgba(245,237,214,.5);font-size:12px;line-height:1.45}
.cr-note{margin:15px 0 0;color:rgba(245,237,214,.45);font-size:12px;line-height:1.5}.cr-campaign-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:1px;border:1px solid rgba(245,237,214,.08);background:rgba(245,237,214,.08)}.cr-campaign-number{padding:25px;background:linear-gradient(145deg,rgba(196,148,58,.2),#15100c 65%)}.cr-campaign-number span{color:#d9b768;font:900 10px/1 var(--font-jetbrains);letter-spacing:.12em;text-transform:uppercase}.cr-campaign-number strong{display:block;margin:18px 0 10px;font:700 58px/.9 var(--font-playfair)}.cr-campaign-number p{margin:0;color:rgba(245,237,214,.5);font-size:12px;line-height:1.5}.cr-campaign-grid dl{margin:0;background:#15100c;padding:16px 22px}.cr-campaign-grid dl div,.cr-run-counts div{display:flex;justify-content:space-between;gap:18px;padding:12px 0;border-bottom:1px solid rgba(245,237,214,.08)}.cr-campaign-grid dl div:last-child,.cr-run-counts div:last-child{border:0}.cr-campaign-grid dt,.cr-run-counts dt{color:rgba(245,237,214,.52);font-size:12px}.cr-campaign-grid dd,.cr-run-counts dd{margin:0;font:800 13px/1 var(--font-jetbrains)}
.cr-experiment-contract{display:grid;gap:0;margin:16px 0 0;border:1px solid rgba(245,237,214,.08);background:#15100c;padding:5px 18px}.cr-experiment-contract div{display:grid;grid-template-columns:140px 1fr;gap:18px;padding:12px 0;border-bottom:1px solid rgba(245,237,214,.08)}.cr-experiment-contract div:last-child{border:0}.cr-experiment-contract dt{color:#d9b768;font:900 9px/1.4 var(--font-jetbrains);letter-spacing:.1em;text-transform:uppercase}.cr-experiment-contract dd{margin:0;color:rgba(245,237,214,.68);font-size:12px;line-height:1.5}
.cr-line{display:flex;justify-content:space-between;gap:20px;margin-top:15px;border-top:1px solid rgba(245,237,214,.08);padding-top:15px;color:rgba(245,237,214,.46);font-size:11px}.cr-line strong{color:rgba(245,237,214,.7);font-family:var(--font-jetbrains);font-weight:500}.cr-delivery{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.cr-delivery div{border-left:2px solid rgba(196,148,58,.55);background:#15100c;padding:15px}.cr-delivery span{display:block;color:rgba(245,237,214,.45);font:900 9px/1 var(--font-jetbrains);letter-spacing:.1em;text-transform:uppercase}.cr-delivery strong{display:block;margin-top:9px;font:700 20px/1 var(--font-playfair)}.cr-run-counts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0 0}.cr-run-counts div{display:block;background:rgba(255,255,255,.018);padding:13px}.cr-run-counts dd{margin-top:7px;font-size:18px}
.cr-links>div:last-child{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.cr-links a{display:flex;justify-content:space-between;gap:15px;border:1px solid rgba(245,237,214,.09);padding:16px;color:#f5edd6;text-decoration:none;font-size:13px}.cr-links a span{color:#c4943a}.cr-links a:hover,.cr-links a:focus-visible{outline:none;border-color:rgba(196,148,58,.55);background:rgba(196,148,58,.07)}.cr-footer{display:flex;justify-content:space-between;gap:20px;padding:20px 2px;color:rgba(245,237,214,.34);font:10px/1.4 var(--font-jetbrains)}.cr-footer a{color:rgba(245,237,214,.52)}
@media(max-width:850px){.cr-metrics.four{grid-template-columns:repeat(2,minmax(0,1fr))}.cr-delivery,.cr-run-counts,.cr-links>div:last-child{grid-template-columns:repeat(2,1fr)}}
@media(max-width:600px){.cr-shell{padding:18px 12px 45px}.cr-header{align-items:flex-start;display:grid}.cr-checked{text-align:left}.cr-section{padding:17px}.cr-heading{align-items:flex-start;display:grid}.cr-metrics.four,.cr-campaign-grid,.cr-delivery,.cr-run-counts,.cr-links>div:last-child{grid-template-columns:1fr}.cr-experiment-contract div{grid-template-columns:1fr;gap:5px}.cr-metric{min-height:135px}.cr-line{display:grid}.cr-jump{margin-inline:-12px;padding-inline:12px}}
@media(prefers-reduced-motion:reduce){.cr-jump{scroll-behavior:auto}}
`;
