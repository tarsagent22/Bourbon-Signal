import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getCompanyControlRoomSnapshot, invalidateCompanyControlRoomSnapshot } from "@/lib/company-control-room-server";
import { companyMemberPrimaryEmail, isCompanyControlRoomOwnerEmail } from "@/lib/company-control-room";
import { formatControlRoomDateTime } from "@/lib/control-room-time";
import { FOUNDER_SHIPPING_CARRIERS, normalizeFounderFulfillment } from "@/lib/founder-shipping";
import { sendFounderShipmentNotification } from "@/lib/founder-shipping-notification";
import { FounderShippingNotificationInFlightError, listFounderShippingForOwner, updateFounderShippingFulfillment } from "@/lib/founder-shipping-repository";
import { getReferralRepository } from "@/lib/referral-repository";
import { isRetailerAdminEmail } from "@/lib/retailer-admin";
import { getCoverageRequestRepository } from "@/lib/coverage-request-repository";
import type { CoverageRequestStatus } from "@/lib/coverage-request";
import { getRetailerRepository, type RetailerApplicationRecord } from "@/lib/retailer-repository";
import RetailerAdministration from "@/components/admin/RetailerAdministration";
import AdminBottleQueueClient from "../bottle-queue/AdminBottleQueueClient";
import AdminSightingsClient from "../sightings/AdminSightingsClient";
import SignalPointsAdminBoard from "@/components/admin/SignalPointsAdminBoard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COVERAGE_REQUEST_STATUS_OPTIONS: ReadonlyArray<{ value: CoverageRequestStatus; label: string; description: string }> = [
  { value: "requested", label: "Requested", description: "Needs review or another coverage pass" },
  { value: "on_radar", label: "On radar", description: "Accepted and being monitored" },
  { value: "improved", label: "Improved", description: "Coverage has meaningfully improved" },
  { value: "closed", label: "Closed", description: "No active follow-up" },
];

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

function fulfillmentText(value: FormDataEntryValue | null, limit: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

async function listRetailerAdministration() {
  const repository = getRetailerRepository();
  const retailers: RetailerApplicationRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await repository.listApplications(100, offset);
    retailers.push(...page);
    if (page.length < 100) break;
  }
  const submissions = await repository.listSubmissions();
  return { retailers, submissions };
}

async function updateCoverageRequestStatus(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/admin/control-room");
  const client = await clerkClient();
  const owner = await client.users.getUser(userId);
  const ownerEmail = companyMemberPrimaryEmail(owner);
  if (!isCompanyControlRoomOwnerEmail(ownerEmail)) notFound();

  const requestId = fulfillmentText(formData.get("requestId"), 80);
  const requestedStatus = fulfillmentText(formData.get("status"), 20);
  const status = COVERAGE_REQUEST_STATUS_OPTIONS.find((option) => option.value === requestedStatus)?.value;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    redirect("/admin/control-room?coverageError=That%20coverage%20request%20ID%20is%20invalid.#coverage-demand");
  }
  if (!status) redirect("/admin/control-room?coverageError=Choose%20a%20valid%20request%20status.#coverage-demand");

  let result;
  try {
    result = await getCoverageRequestRepository().updateStatusForOwner(requestId, status, ownerEmail);
  } catch (error) {
    console.error("Coverage request status update failed", { requestId, status, error });
    redirect("/admin/control-room?coverageError=The%20request%20state%20could%20not%20be%20saved.%20Please%20try%20again.#coverage-demand");
  }
  if (!result) redirect("/admin/control-room?coverageError=That%20request%20could%20not%20be%20moved%20to%20the%20selected%20state.%20Refresh%20and%20try%20again.#coverage-demand");
  invalidateCompanyControlRoomSnapshot();
  revalidatePath("/admin/control-room");
  redirect(`/admin/control-room?coverageUpdated=${encodeURIComponent(result.requestId)}&coverageStatus=${encodeURIComponent(result.status)}&coverageChanged=${result.changed ? "yes" : "no"}#coverage-demand`);
}

async function updateFounderGlassFulfillment(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/admin/control-room");
  const client = await clerkClient();
  const owner = await client.users.getUser(userId);
  const ownerEmail = companyMemberPrimaryEmail(owner);
  if (!isCompanyControlRoomOwnerEmail(ownerEmail)) notFound();

  const shippingUserId = fulfillmentText(formData.get("userId"), 200);
  const fulfillment = normalizeFounderFulfillment(Object.fromEntries(formData.entries()));
  if (!shippingUserId) redirect("/admin/control-room#founder-glasses");
  if (!fulfillment.ok) redirect(`/admin/control-room?fulfillmentError=${encodeURIComponent(fulfillment.error)}#founder-glasses`);
  let record;
  try {
    record = await updateFounderShippingFulfillment({
      userId: shippingUserId,
      ...fulfillment.value,
      updatedBy: ownerEmail,
    });
  } catch (error) {
    if (error instanceof FounderShippingNotificationInFlightError) {
      redirect(`/admin/control-room?fulfillmentError=${encodeURIComponent(error.message)}#founder-glasses`);
    }
    throw error;
  }
  if (record && record.status !== "submitted") {
    const referralStatus = record.status === "confirmed" ? "address_confirmed" : record.status;
    await getReferralRepository().updateGlassFulfillment(record.userId, referralStatus);
  }
  if (record?.status === "shipped" && record.founderNumber && !record.shipmentNotificationSentAt) {
    try {
      const member = await client.users.getUser(record.userId);
      const recipientEmail = companyMemberPrimaryEmail(member);
      if (!recipientEmail) throw new Error("The member's current primary Clerk email is unavailable.");
      await sendFounderShipmentNotification(record, recipientEmail);
    } catch (error) {
      console.error("Founder shipment notification failed", error);
      redirect("/admin/control-room?fulfillmentError=Shipment%20saved%2C%20but%20the%20email%20is%20still%20pending.%20Save%20again%20to%20retry.#founder-glasses");
    }
  }
  revalidatePath("/admin/control-room");
  revalidatePath("/founder-shipping");
  redirect("/admin/control-room#founder-glasses");
}

export default async function CompanyControlRoomPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const fulfillmentError = typeof query?.fulfillmentError === "string" ? query.fulfillmentError : "";
  const coverageUpdatedId = typeof query?.coverageUpdated === "string" && /^[0-9a-f-]{36}$/i.test(query.coverageUpdated)
    ? query.coverageUpdated
    : "";
  const coverageUpdatedStatus = typeof query?.coverageStatus === "string"
    ? COVERAGE_REQUEST_STATUS_OPTIONS.find((option) => option.value === query.coverageStatus)?.value || ""
    : "";
  const coverageChanged = query?.coverageChanged === "yes";
  const coverageError = typeof query?.coverageError === "string" ? query.coverageError : "";
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/admin/control-room");
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const ownerEmail = companyMemberPrimaryEmail(user);
  if (!isCompanyControlRoomOwnerEmail(ownerEmail)) notFound();
  const canAdministerRetailers = isRetailerAdminEmail(ownerEmail);

  const [snapshot, founderShipping, retailerAdministration] = await Promise.all([
    getCompanyControlRoomSnapshot({ forceFresh: Boolean(coverageUpdatedId) }),
    listFounderShippingForOwner(),
    canAdministerRetailers ? listRetailerAdministration() : Promise.resolve(null),
  ]);
  const { memberships, founder, revenue, audience, growth, lifecycle, retention, demand, coverageDemand, retailer, engine, alerts, release, automation } = snapshot;
  const coverageStatusUpdatedConfirmed = Boolean(coverageUpdatedId && coverageUpdatedStatus && coverageDemand.recentRequests.some(
    (request) => request.id === coverageUpdatedId && request.status === coverageUpdatedStatus,
  ));
  const founderShippingOpen = founderShipping.filter((record) => record.status !== "shipped").length;
  const deliveryCounts = alerts.counts as Record<string, number>;
  const stateExceptions = engine.failedStates + engine.degradedStates + engine.staleStates;

  return (
    <main className="cr-shell">
      <style>{controlRoomCss}</style>
      <div className="cr-frame">
        <header className="cr-header">
          <div>
            <p className="cr-kicker">Private owner view</p>
            <h1>Company Control Room</h1>
            <p className="cr-subtitle">Your review queues first, followed by the few numbers that matter for the business and product.</p>
          </div>
          <div className="cr-checked">
            <span className={`cr-status ${statusTone(engine.status)}`}>{engine.status.replaceAll("_", " ")}</span>
            <p>Checked {formatControlRoomDateTime(snapshot.checkedAt)}</p>
          </div>
        </header>

        <nav className="cr-jump" aria-label="Control room sections">
          <a href="#actions">Your actions</a>
          {retailerAdministration ? <a href="#retailers">Retailers</a> : null}
          <a href="#founder-glasses">Founder glasses</a>
          <a href="#signal-points">Signal Points</a>
          <a href="#coverage-demand">Coverage demand</a>
          <a href="#paid-retention">Paid retention</a>
          <a href="#business">Business</a>
          <a href="#product">Product</a>
          <a href="#operations">Operations</a>
          <a href="#state-engines">State engines</a>
          <a href="#background">Background</a>
        </nav>

        <section id="actions" className="cr-section cr-priority">
          <div className="cr-heading">
            <div><p>Start here</p><h2>Needs your attention</h2></div>
            <span>Queues update immediately after each decision</span>
          </div>
          <div className="cr-attention-strip">
            {retailerAdministration ? <Link href="#retailers" className={Number(retailer.pendingApplications || 0) > 0 ? "needs-action" : ""}>
              <span>Retailer applications</span><strong>{count(retailer.pendingApplications)}</strong><small>{Number(retailer.pendingApplications || 0) > 0 ? "Review pending" : "Clear"}</small>
            </Link> : <div><span>Retailer applications</span><strong>{count(retailer.pendingApplications)}</strong><small>Restricted</small></div>}
            <div className={memberships.counts.pastDue > 0 ? "needs-action" : ""}>
              <span>Past-due members</span><strong>{memberships.counts.pastDue}</strong><small>{memberships.counts.pastDue > 0 ? "Needs follow-up" : "Clear"}</small>
            </div>
            <Link href="#paid-retention" className={retention.attention.length > 0 ? "needs-action" : ""}>
              <span>Paid retention</span><strong>{retention.attention.length}</strong><small>{retention.attention.length > 0 ? "Review members" : "Clear"}</small>
            </Link>
            <Link href="/admin/operations" className={stateExceptions > 0 ? "needs-action" : ""}>
              <span>Engine exceptions</span><strong>{stateExceptions}</strong><small>{stateExceptions > 0 ? "Inspect states" : "Clear"}</small>
            </Link>
            <Link href="#coverage-demand" className={coverageDemand.totalOpenRequests > 0 ? "needs-action" : ""}>
              <span>Coverage demand</span><strong>{coverageDemand.totalOpenRequests}</strong><small>{coverageDemand.totalOpenRequests > 0 ? "Review gaps" : "Clear"}</small>
            </Link>
            <Link href="#founder-glasses" className={founderShippingOpen > 0 ? "needs-action" : ""}>
              <span>Founder glasses</span><strong>{founderShippingOpen}</strong><small>{founderShippingOpen > 0 ? "In fulfillment" : "Clear"}</small>
            </Link>
          </div>

          <div className="cr-queue-grid">
            <article id="bottles" className="cr-queue-panel">
              <div className="cr-subheading"><div><p>Catalog</p><h3>Bottle review</h3></div><Link href="/admin/bottle-queue">Open full queue</Link></div>
              <p className="cr-note top">Match an existing Bottle Bible entry, add a reviewed bottle directly to the catalog, or dismiss an invalid entry.</p>
              <AdminBottleQueueClient embedded />
            </article>
            <article id="sightings" className="cr-queue-panel">
              <div className="cr-subheading"><div><p>Community</p><h3>Member sighting approvals</h3></div><Link href="/admin/sightings">Open full queue</Link></div>
              <p className="cr-note top">Approve a valid sighting publicly or privately, add any reviewed bottle/location to the catalog, or reject the whole submission.</p>
              <AdminSightingsClient embedded />
            </article>
          </div>
        </section>

        {retailerAdministration ? <div id="retailers" className="cr-anchor"><RetailerAdministration retailers={retailerAdministration.retailers} submissions={retailerAdministration.submissions} /></div> : null}

        <section id="founder-glasses" className="cr-section">
          <div className="cr-heading">
            <div><p>Private fulfillment</p><h2>Founder and referral glass fulfillment</h2></div>
            <span>{founderShipping.length} submitted · {founderShippingOpen} not shipped</span>
          </div>
          {fulfillmentError ? <p className="cr-founder-error" role="alert">{fulfillmentError}</p> : null}
          {founderShipping.length ? (
            <div className="cr-founder-list">
              {founderShipping.map((record) => (
                <details className="cr-founder-record" key={record.userId}>
                  <summary>
                    <span><strong>{record.founderNumber ? `Founder No. ${record.founderNumber}` : `Referral glasses ×${record.referralGlassQuantity}`}</strong><small>{record.recipientName}</small></span>
                    <span className={`cr-founder-status ${record.status}`}>{record.status}</span>
                  </summary>
                  <div className="cr-founder-body">
                    <div className="cr-founder-private">
                      <p><strong>Account</strong><a href={`mailto:${record.accountEmail}`}>{record.accountEmail}</a></p>
                      <address>
                        <strong>{record.recipientName}</strong>
                        <span>{record.addressLine1}</span>
                        {record.addressLine2 ? <span>{record.addressLine2}</span> : null}
                        <span>{record.city}, {record.stateCode} {record.postalCode}</span>
                        <span>United States</span>
                      </address>
                      <p><strong>Phone</strong><a href={`tel:${record.phone}`}>{record.phone}</a></p>
                      <p><strong>Submitted</strong><span>{formatControlRoomDateTime(record.submittedAt)}</span></p>
                    </div>
                    <form action={updateFounderGlassFulfillment} className="cr-founder-form">
                      <input type="hidden" name="userId" value={record.userId} />
                      <label><span>Status</span><select name="status" defaultValue={record.status}>{["submitted", "confirmed", "packed", "shipped"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                      <label><span>Carrier</span><select name="carrier" defaultValue={record.carrier || ""}><option value="">Select carrier</option>{FOUNDER_SHIPPING_CARRIERS.map((carrier) => <option key={carrier} value={carrier}>{carrier}</option>)}</select></label>
                      <label><span>Tracking number</span><input name="trackingNumber" maxLength={160} defaultValue={record.trackingNumber || ""} /></label>
                      <small>Carrier and tracking are required before marking shipped.</small>
                      <button type="submit">Save fulfillment</button>
                    </form>
                    {record.status === "shipped" ? <p className="cr-founder-email-status">{record.shipmentNotificationSentAt ? "Shipment email sent" : "Shipment email pending"}</p> : null}
                  </div>
                </details>
              ))}
            </div>
          ) : <div className="cr-unavailable"><strong>No founder shipping submissions yet.</strong><p>Eligible founders will appear here after saving their private shipping form.</p></div>}
          <p className="cr-note">Addresses and phone numbers stay collapsed by default and are available only in this owner-authorized fulfillment view.</p>
        </section>

        <details id="signal-points" className="cr-section cr-collapsible">
          <summary className="cr-collapsible-summary">
            <span><p>Owner ledger and fulfillment</p><h2>Signal Points leaderboard</h2></span>
            <span className="cr-collapsible-meta">Earners and reward redemptions <b aria-hidden="true">⌄</b></span>
          </summary>
          <div className="cr-collapsible-body"><SignalPointsAdminBoard /></div>
        </details>

        <section id="coverage-demand" className="cr-section">
          <div className="cr-heading">
            <div><p>Explicit member requests</p><h2>Coverage demand</h2></div>
            <span>{coverageDemand.source === "database" ? `${coverageDemand.uniqueRequesters} unique requesters` : "Request store unavailable"}</span>
          </div>
          {coverageStatusUpdatedConfirmed ? (
            <p className="cr-action-message good" role="status">
              {coverageChanged
                ? <>Coverage request moved to {COVERAGE_REQUEST_STATUS_OPTIONS.find((option) => option.value === coverageUpdatedStatus)?.label}.</>
                : <>Coverage request is already {COVERAGE_REQUEST_STATUS_OPTIONS.find((option) => option.value === coverageUpdatedStatus)?.label}.</>}
            </p>
          ) : null}
          {coverageError ? <p className="cr-action-message bad" role="alert">{coverageError}</p> : null}
          {coverageDemand.source === "database" ? (
            <>
              <div className="cr-metrics four">
                <Metric label="Open requests" value={coverageDemand.totalOpenRequests} detail="Requested or on our radar" accent />
                <Metric label="Unique requesters" value={coverageDemand.uniqueRequesters} detail="Authenticated members" />
                <Metric label="Requested targets" value={coverageDemand.targets.length} detail="State, county, city, and store gaps" />
                <Metric label="Email follow-up" value={coverageDemand.notificationOptIns} detail="Unique members asking to hear when coverage improves" />
              </div>
              {coverageDemand.targets.length ? (
                <div className="cr-demand-list">
                  {coverageDemand.targets.slice(0, 12).map((target) => (
                    <article key={`${target.targetType}:${target.stateCode}:${target.label}`}>
                      <div>
                        <span>{target.targetType} · {target.stateCode}</span>
                        <h3>{target.label}</h3>
                      </div>
                      <dl>
                        <div><dt>Unique requesters</dt><dd>{target.uniqueRequesters}</dd></div>
                        <div><dt>Paid / free</dt><dd>{target.paidRequesters} / {target.freeRequesters}</dd></div>
                        <div><dt>Current capability</dt><dd>{target.currentCapabilityLabel}</dd></div>
                        <div><dt>Health</dt><dd>{target.currentHealthLabel}</dd></div>
                      </dl>
                      <p>{target.gap}</p>
                    </article>
                  ))}
                </div>
              ) : <div className="cr-unavailable"><strong>No open coverage requests.</strong><p>The queue will populate from authenticated state, county, city, and store requests.</p></div>}
              {coverageDemand.recentRequests.length ? (
                <div className="cr-request-state-folders">
                  {COVERAGE_REQUEST_STATUS_OPTIONS.map((option) => {
                    const requests = coverageDemand.recentRequests.filter((request) => request.status === option.value);
                    return (
                      <details className={`cr-request-state-folder status-${option.value}`} open={option.value === "requested"} key={option.value}>
                        <summary>
                          <span><strong>{option.label}</strong><small>{option.description}</small></span>
                          <b>{requests.length}</b>
                        </summary>
                        <div className="cr-request-rows">
                          {requests.length ? requests.map((request) => (
                            <article key={request.id}>
                              <div className="cr-request-person">
                                <strong>{request.requesterName || (request.requesterEmail ? "Member" : "Member record unavailable")}</strong>
                                {request.requesterEmail
                                  ? request.notificationEnabled
                                    ? <a href={`mailto:${request.requesterEmail}`}>{request.requesterEmail}</a>
                                    : <span className="cr-request-email">{request.requesterEmail}</span>
                                  : null}
                              </div>
                              <div className="cr-request-target">
                                <span>{request.targetType} · {request.stateCode}</span>
                                <strong>{request.targetLabel}</strong>
                              </div>
                              <div className="cr-request-flags">
                                <span>{request.memberSegment} member</span>
                                <span className={request.notificationEnabled ? "email-yes" : "email-no"}>Email updates: {request.notificationEnabled ? "Yes" : "No"}</span>
                              </div>
                              <div className="cr-request-actions">
                                <time dateTime={request.updatedAt}>{formatControlRoomDateTime(request.updatedAt)}</time>
                                <form action={updateCoverageRequestStatus} className="cr-request-status-form">
                                  <input type="hidden" name="requestId" value={request.id} />
                                  <label>
                                    <span className="sr-only">Status for {request.targetLabel}</span>
                                    <select name="status" defaultValue={request.status} aria-label={`Status for ${request.targetLabel}`}>
                                      {COVERAGE_REQUEST_STATUS_OPTIONS.map((statusOption) => (
                                        <option value={statusOption.value} key={statusOption.value}>{statusOption.label}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <button type="submit" aria-label={`Save status for ${request.targetLabel}`}>Save</button>
                                </form>
                              </div>
                            </article>
                          )) : <p className="cr-request-empty">No requests in this state.</p>}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : null}
              <p className="cr-note">Changing a request state does not email the member. Moving it out of Requested cancels work that has not entered delivery; moving a manually blocked request back to Requested safely requeues it. Individual identities and email intent appear only in this owner-authorized Control Room. Public demand reporting remains aggregate-only.{coverageDemand.partial ? " This read reached its safe row limit." : ""}</p>
            </>
          ) : (
            <div className="cr-unavailable"><strong>Coverage demand is not connected.</strong><p>The request database could not be read, so this view does not substitute inferred geography or fabricated counts.</p></div>
          )}
        </section>

        <section id="paid-retention" className="cr-section">
          <div className="cr-heading">
            <div><p>Recurring member value</p><h2>Paid-member retention</h2></div>
            <span>{retention.counts.recurringPaid} active recurring members</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="Needs attention" value={retention.attention.length} detail="Setup gaps or 72+ hours without first value" accent={retention.attention.length > 0} />
            <Metric label="Rescue due" value={retention.counts.rescueDue} detail="Setup complete · no first alert after 72 hours" />
            <Metric label="Setup incomplete" value={retention.counts.setupIncomplete} detail="Missing market, criteria, or delivery" />
            <Metric label="First value reached" value={retention.counts.firstValueReached} detail="At least one alert created" />
          </div>
          {retention.attention.length ? (
            <div className="cr-retention-list">
              {retention.attention.map((member) => (
                <article key={member.memberId}>
                  <div><span>{member.tier} · {member.billingPlan.replaceAll("_", " ")}</span><h3>{member.name}</h3><a href={`mailto:${member.email}`}>{member.email}</a></div>
                  <dl>
                    <div><dt>Stage</dt><dd>{member.stage.replaceAll("_", " ")}</dd></div>
                    <div><dt>Member age</dt><dd>{member.membershipAgeHours === null ? "Unknown" : `${Math.floor(member.membershipAgeHours / 24)}d ${member.membershipAgeHours % 24}h`}</dd></div>
                    <div><dt>Setup</dt><dd>{member.savedStateCount} markets · {member.trackedBottleCount} bottles · {member.enabledChannelCount} channels</dd></div>
                    <div><dt>Last sign-in</dt><dd>{formatControlRoomDateTime(member.lastSignInAt)}</dd></div>
                  </dl>
                  <p>{member.recommendedAction}</p>
                  <Link href="/admin/operations">Review signal coverage</Link>
                </article>
              ))}
            </div>
          ) : <div className="cr-unavailable"><strong>No paid-member rescue is due.</strong><p>All current recurring members have reached first alert value, are still inside the monitored window, or completed setup less than 24 hours ago.</p></div>}
          <p className="cr-note">This queue prioritizes recurring Standard and Barrel members. It never sends email by itself and excludes founders, free members, retailers, and owners.</p>
        </section>

        <section id="business" className="cr-section">
          <div className="cr-heading">
            <div><p>Company</p><h2>Business pulse</h2></div>
            <span className={`cr-status ${statusTone(revenue.source)}`}>{revenue.source === "stripe" ? "Live Stripe" : "Stripe unavailable"}</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="Monthly recurring" value={money(revenue.monthlyRecurringCents, revenue.currency)} detail="Active Stripe subscriptions" accent />
            <Metric label="Paid members" value={memberships.counts.paid} detail={`${memberships.counts.standard} Standard · ${memberships.counts.barrel} Barrel`} />
            <Metric label="Reachable free" value={count(audience.reachableFreeMembers)} detail="Eligible contacts available for a reviewed campaign" />
            <Metric label="Collected · 30 days" value={money(revenue.collectedLast30DaysCents, revenue.currency)} detail="Successful charges less refunds" />
          </div>
          <details className="cr-details">
            <summary>Growth funnel and membership detail</summary>
            <div className="cr-detail-grid">
              <dl className="cr-list">
                <div><dt>Total accounts</dt><dd>{memberships.counts.total}</dd></div>
                <div><dt>Free members</dt><dd>{memberships.counts.free}</dd></div>
                <div><dt>Founder members</dt><dd>{memberships.counts.founder}</dd></div>
                <div><dt>Founder spots left</dt><dd>{founder.remaining} / {founder.limit}</dd></div>
                <div><dt>Active subscriptions</dt><dd>{count(revenue.activeSubscriptions)}</dd></div>
              </dl>
              <dl className="cr-list">
                <div><dt>New accounts · 7 days</dt><dd>{growth.days7.accounts}</dd></div>
                <div><dt>Tracked signup starts · 7 days</dt><dd>{growth.days7.signupStarted}</dd></div>
                <div><dt>Registration completed · 7 days</dt><dd>{growth.days7.registrationCompleted}</dd></div>
                <div><dt>Onboarding state selected · 7 days</dt><dd>{growth.days7.onboardingStateSelected}</dd></div>
                <div><dt>Reached free value · 7 days</dt><dd>{growth.days7.freeValueReached}</dd></div>
                <div><dt>Pricing viewed · 7 days</dt><dd>{growth.days7.pricingViewed}</dd></div>
                <div><dt>Checkout started · 7 days</dt><dd>{growth.days7.checkoutStarted}</dd></div>
                <div><dt>Membership activated · 7 days</dt><dd>{growth.days7.membershipActivated}</dd></div>
                <div><dt>Paid setup completed · 7 days</dt><dd>{growth.days7.paidActivationCompleted}</dd></div>
                <div><dt>First alert · 7 days</dt><dd>{growth.days7.firstAlertCreated}</dd></div>
                <div><dt>New accounts · 30 days</dt><dd>{growth.days30.accounts}</dd></div>
                <div><dt>Paid setup incomplete</dt><dd>{lifecycle.paidSetupIncomplete}</dd></div>
                <div><dt>Ready · no first alert</dt><dd>{lifecycle.activatedNoFirstAlert}</dd></div>
              </dl>
            </div>
            <div className="cr-campaign-block">
              <div className="cr-subheading"><div><p>First-party attribution</p><h3>Tagged member cohort · 30 days</h3></div><span>{growth.campaigns.length} campaign{growth.campaigns.length === 1 ? "" : "s"}</span></div>
              <p className="cr-note top">Anonymous campaign visitors are measured in Vercel Web Analytics. This private cohort follows attributed member accounts through registration, free value, pricing, checkout, and paid activation.</p>
              {growth.campaigns.length ? (
                <div className="cr-campaign-scroll">
                  <table className="cr-campaign-table">
                    <thead><tr><th>Campaign</th><th>Accounts</th><th>Registered</th><th>Free value</th><th>Pricing</th><th>Checkout</th><th>Paid</th></tr></thead>
                    <tbody>{growth.campaigns.map((campaign) => (
                      <tr key={campaign.campaign}>
                        <th scope="row"><code>{campaign.campaign}</code></th>
                        <td>{campaign.accounts}</td>
                        <td>{campaign.registrationCompleted}</td>
                        <td>{campaign.freeValueReached}</td>
                        <td>{campaign.pricingViewed}</td>
                        <td>{campaign.checkoutStarted}</td>
                        <td>{campaign.membershipActivated}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <div className="cr-unavailable"><strong>No attributed member accounts yet.</strong><p>Anonymous campaign traffic remains available in Vercel Web Analytics and the scheduled paid-acquisition report.</p></div>}
            </div>
            {revenue.source !== "stripe" ? <p className="cr-note">Membership-derived recurring estimate: {money(memberships.estimatedMonthlyRecurringCents)} monthly.</p> : null}
          </details>
        </section>

        <section id="product" className="cr-section">
          <div className="cr-heading">
            <div><p>Customer value</p><h2>Product pulse</h2></div>
            <span>{engine.ageMinutes ?? "—"} min since engine generation</span>
          </div>
          {demand.collectionSource !== "neon" ? (
            <div className="cr-unavailable" role="alert">
              <strong>Collection demand is temporarily unavailable.</strong>
              <p>The durable Neon collection read failed. Bottle-demand totals below must not be interpreted as zero demand.</p>
            </div>
          ) : null}
          <div className="cr-metrics four">
            <Metric label="Current signals" value={count(engine.signals)} detail={`${count(engine.alertCandidates)} alert candidates`} accent />
            <Metric label="Live-inventory states" value={engine.inventoryStates} detail={`${engine.activeStates} covered states total`} />
            <Metric label="Demand cohorts" value={demand.bottles.length + demand.geographies.length} detail={`${demand.contributingMembers} members contributed approved preferences`} />
            <Metric label="Retailers live" value={count(retailer.storesWithLiveSignals)} detail={`${count(retailer.liveSignals)} current retailer signals`} />
          </div>
          <details className="cr-details">
            <summary>Demand-weighted investment</summary>
            <div className="cr-detail-grid">
              <dl className="cr-list">
                {demand.bottles.slice(0, 4).map((item) => <div key={item.canonicalBottleId}><dt>{item.canonicalBottleName}</dt><dd>{item.weightedDemand}</dd></div>)}
                {!demand.bottles.length ? <div><dt>Bottle demand</dt><dd>{demand.collectionSource === "neon" ? "No reportable cohort" : "Unavailable — durable read failed"}</dd></div> : null}
              </dl>
              <dl className="cr-list">
                {demand.geographies.slice(0, 4).map((item) => <div key={item.state}><dt>{item.state} demand</dt><dd>{item.weightedDemand}</dd></div>)}
                {!demand.geographies.length ? <div><dt>Geographic demand</dt><dd>No reportable cohort</dd></div> : null}
              </dl>
            </div>
          </details>
        </section>

        <section id="operations" className="cr-section">
          <div className="cr-heading">
            <div><p>Data and delivery</p><h2>Operating health</h2></div>
            <span className={`cr-status ${statusTone(alerts.status)}`}>{alerts.status.replaceAll("_", " ")}</span>
          </div>
          <div className="cr-metrics four">
            <Metric label="State exceptions" value={stateExceptions} detail={`${engine.failedStates} failed · ${engine.degradedStates} degraded · ${engine.staleStates} stale`} accent={stateExceptions > 0} />
            <Metric label="Store records" value={count(engine.stores)} detail="Source-backed locations" />
            <Metric label="Users matched" value={count(deliveryCounts.usersMatched ?? 0)} detail="Most recent alert run" />
            <Metric label="Alerts created" value={count(deliveryCounts.onSiteAlertsCreated ?? 0)} detail={`${count(deliveryCounts.emailsSent ?? 0)} emails · ${count(deliveryCounts.smsSent ?? 0)} SMS`} />
          </div>
          <div className="cr-delivery">
            <div><span>On-site</span><strong>{alerts.onSiteEnabled ? "Enabled" : "Off"}</strong></div>
            <div><span>Email</span><strong>{alerts.emailEnabled ? "Enabled" : "Off"}</strong></div>
            <div><span>SMS</span><strong>{alerts.smsEnabled ? "Enabled" : "Off"}</strong></div>
            <div><span>Last run</span><strong>{alerts.ageMinutes ?? "—"} min ago</strong></div>
          </div>
          <div className="cr-lines">
            <div><span>Engine generated</span><strong>{formatControlRoomDateTime(engine.generatedAt)}</strong></div>
            <div><span>Alert monitor completed</span><strong>{formatControlRoomDateTime(alerts.lastRunAt)}</strong></div>
          </div>
        </section>

        <section id="state-engines" className="cr-section">
          <div className="cr-heading">
            <div><p>Per-state containment</p><h2>State engine health</h2></div>
            <span>Problems first · healthy states continue publishing</span>
          </div>
          <div className="cr-engine-legend" aria-label="State engine health legend">
            <span><i className="healthy" aria-hidden="true" />Healthy</span>
            <span><i className="warning" aria-hidden="true" />Needs attention</span>
            <span><i className="critical" aria-hidden="true" />Failed or blocked</span>
          </div>
          <div className="cr-engine-grid">
            {engine.stateEngines.map((stateEngine) => (
              <article key={stateEngine.state} className={`cr-engine-card ${stateEngine.health}`}>
                <div className="cr-engine-card-head">
                  <div><span>{stateEngine.state}</span><h3>{stateEngine.label}</h3></div>
                  <span className={`cr-engine-health ${stateEngine.health}`} role="status" aria-label={`${stateEngine.label} engine ${stateEngine.health}`}>
                    <i aria-hidden="true" />{stateEngine.health}
                  </span>
                </div>
                <dl>
                  <div><dt>Signals</dt><dd>{count(stateEngine.signalCount)}</dd></div>
                  <div><dt>Precision</dt><dd>{stateEngine.bestLocationPrecision?.replaceAll("_", " ") || "Not available"}</dd></div>
                  <div><dt>Source</dt><dd>{stateEngine.sourceLabel || "Source unavailable"}</dd></div>
                  <div><dt>Status</dt><dd>{stateEngine.status.replaceAll("_", " ")}</dd></div>
                </dl>
                {stateEngine.issue ? <p className="cr-engine-issue">{stateEngine.issue}</p> : <p className="cr-engine-clear">No current engine exception.</p>}
              </article>
            ))}
          </div>
        </section>

        <section id="background" className="cr-section cr-background">
          <div className="cr-heading">
            <div><p>Optional detail</p><h2>What is running in the background</h2></div>
            <span>Collapsed unless it produces a decision</span>
          </div>


          <details className="cr-background-item">
            <summary>
              <span><strong>Automation health</strong><small>Research and operator jobs</small></span>
              <span className={`cr-status ${automation.contractVersion ? "good" : "warn"}`}>{automation.contractVersion ? "Reporting" : "Not connected"}</span>
            </summary>
            <div className="cr-background-body">
              {automation.contractVersion ? <>
                <p>This tells you whether scheduled automation is producing useful findings and completed objectives without excessive failures or agent cost.</p>
                <div className="cr-mini-metrics">
                  <Metric label="Useful findings" value={count(automation.totals.usefulFindings ?? null)} detail={`${count(automation.totals.objectivesCompleted ?? null)} objectives completed`} />
                  <Metric label="Failed runs" value={count(automation.totals.failedRuns ?? null)} detail={`${count((automation.totals.deterministicRuns ?? 0) + (automation.totals.agentRuns ?? 0))} tracked runs`} />
                  <Metric label="Coverage gained" value={count(automation.totals.customerCoverageDelta ?? null)} detail={`${count(automation.totals.sourcesPromoted ?? null)} sources promoted`} />
                </div>
                <p className="cr-note">Report generated {formatControlRoomDateTime(automation.generatedAt)}.</p>
              </> : <div className="cr-unavailable"><strong>Automation reporting is not connected.</strong><p>The jobs can still run, but this dashboard cannot currently prove their cadence, results, or cost. Empty counters have been removed because they were not useful. Nothing in this panel needs your action.</p></div>}
            </div>
          </details>
        </section>

        <div className="cr-tool-links" aria-label="Detailed workspaces">
          <Link href="/admin/operations">Engine operations <span>→</span></Link>
          {retailerAdministration ? <Link href="#retailers">Retailer review <span>→</span></Link> : null}
          <Link href="/admin/sightings">Sighting review <span>→</span></Link>
          <Link href="/admin/bottle-queue">Bottle queue <span>→</span></Link>
        </div>

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
.cr-frame{width:min(1220px,100%);margin:0 auto}.cr-header{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;padding:30px 0 26px;border-bottom:1px solid rgba(245,237,214,.12)}
.cr-kicker,.cr-heading p,.cr-subheading p{margin:0;color:#c4943a;font:900 10px/1 var(--font-jetbrains);letter-spacing:.18em;text-transform:uppercase}.cr-header h1{margin:10px 0 0;font:700 clamp(38px,6vw,66px)/.94 var(--font-playfair);letter-spacing:-.045em}.cr-subtitle{max-width:680px;margin:16px 0 0;color:rgba(245,237,214,.62);font-size:14px;line-height:1.55}
.cr-checked{text-align:right}.cr-checked p{margin:10px 0 0;color:rgba(245,237,214,.45);font:11px/1.3 var(--font-jetbrains)}.cr-status{display:inline-flex;border:1px solid;border-radius:999px;padding:7px 10px;font:900 9px/1 var(--font-jetbrains);letter-spacing:.12em;text-transform:uppercase}.cr-status.good{border-color:rgba(115,201,135,.34);background:rgba(56,130,74,.13);color:#aee7ba}.cr-status.warn{border-color:rgba(220,166,55,.38);background:rgba(196,148,58,.12);color:#efd38f}.cr-status.bad{border-color:rgba(222,94,73,.36);background:rgba(154,50,35,.14);color:#f4aa9f}
.cr-jump{position:sticky;top:0;z-index:5;display:flex;gap:7px;overflow:auto;padding:14px 0;background:linear-gradient(180deg,#0d0a07 72%,transparent)}.cr-jump a{border:1px solid rgba(245,237,214,.1);border-radius:999px;padding:9px 12px;color:rgba(245,237,214,.66);font:800 10px/1 var(--font-jetbrains);letter-spacing:.08em;text-decoration:none;text-transform:uppercase;white-space:nowrap;transition:transform 120ms ease,border-color 120ms ease,background 120ms ease}.cr-jump a:hover,.cr-jump a:focus-visible{outline:none;border-color:rgba(196,148,58,.55);background:rgba(196,148,58,.08);color:#f5edd6}.cr-jump a:active{transform:translateY(2px)}
.cr-section{scroll-margin-top:62px;margin-top:22px;border:1px solid rgba(245,237,214,.1);background:linear-gradient(145deg,rgba(255,255,255,.042),rgba(255,255,255,.018));padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.17)}.cr-priority{border-color:rgba(196,148,58,.28);box-shadow:0 28px 90px rgba(0,0,0,.28)}.cr-heading{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:20px}.cr-heading h2{margin:7px 0 0;font:700 clamp(25px,3vw,35px)/1 var(--font-playfair);letter-spacing:-.025em}.cr-heading>span{color:rgba(245,237,214,.5);font:11px/1.3 var(--font-jetbrains)}
.cr-collapsible{padding:0;overflow:hidden}.cr-collapsible-summary{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:19px 22px;cursor:pointer;list-style:none}.cr-collapsible-summary::-webkit-details-marker{display:none}.cr-collapsible-summary p{margin:0;color:#c4943a;font:900 9px/1 var(--font-jetbrains);letter-spacing:.16em;text-transform:uppercase}.cr-collapsible-summary h2{margin:7px 0 0;font:700 clamp(22px,3vw,30px)/1 var(--font-playfair);letter-spacing:-.025em}.cr-collapsible-meta{display:flex;align-items:center;gap:12px;color:rgba(245,237,214,.5);font:10px/1.3 var(--font-jetbrains)}.cr-collapsible-meta b{display:grid;place-items:center;width:28px;height:28px;border:1px solid rgba(196,148,58,.35);border-radius:999px;color:#d9b768;font-size:16px;transition:transform 160ms ease}.cr-collapsible[open]>.cr-collapsible-summary{border-bottom:1px solid rgba(245,237,214,.1)}.cr-collapsible[open]>.cr-collapsible-summary .cr-collapsible-meta b{transform:rotate(180deg)}.cr-collapsible-body{padding:18px 22px 22px}
.cr-attention-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:18px}.cr-attention-strip>a,.cr-attention-strip>div{display:grid;grid-template-columns:1fr auto;gap:5px 14px;border:1px solid rgba(115,201,135,.18);border-radius:14px;background:rgba(56,130,74,.06);padding:13px 14px;color:#f5edd6;text-decoration:none}.cr-attention-strip .needs-action{border-color:rgba(220,166,55,.34);background:rgba(196,148,58,.1)}.cr-attention-strip span{color:rgba(245,237,214,.58);font-size:12px}.cr-attention-strip strong{grid-row:span 2;font:700 28px/1 var(--font-playfair)}.cr-attention-strip small{color:rgba(245,237,214,.42);font-size:10px}.cr-attention-strip a{transition:transform 120ms ease,border-color 120ms ease}.cr-attention-strip a:hover{border-color:rgba(196,148,58,.6)}.cr-attention-strip a:active{transform:translateY(2px)}
.cr-queue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.cr-queue-panel{min-width:0;border:1px solid rgba(245,237,214,.09);border-radius:18px;background:rgba(7,5,4,.42);padding:16px}.cr-subheading{display:flex;justify-content:space-between;align-items:end;gap:12px}.cr-subheading h3{margin:6px 0 0;font:700 25px/1 var(--font-playfair)}.cr-subheading a{color:#d9b768;font-size:11px}.cr-note{margin:15px 0 0;color:rgba(245,237,214,.47);font-size:12px;line-height:1.55}.cr-note.top{margin:9px 0 2px}
.cr-metrics{display:grid;gap:1px;border:1px solid rgba(245,237,214,.08);background:rgba(245,237,214,.08)}.cr-metrics.four{grid-template-columns:repeat(4,minmax(0,1fr))}.cr-metric{min-height:142px;padding:18px;background:#15100c}.cr-metric.accent{background:linear-gradient(145deg,rgba(196,148,58,.18),#15100c 64%)}.cr-metric p{margin:0;color:rgba(245,237,214,.48);font:900 9px/1 var(--font-jetbrains);letter-spacing:.12em;text-transform:uppercase}.cr-metric strong{display:block;margin-top:17px;color:#f5edd6;font:700 clamp(27px,4vw,41px)/.95 var(--font-playfair);letter-spacing:-.035em;overflow-wrap:anywhere}.cr-metric span{display:block;margin-top:13px;color:rgba(245,237,214,.52);font-size:12px;line-height:1.45}
.cr-details{margin-top:14px;border:1px solid rgba(245,237,214,.09);background:rgba(0,0,0,.12)}.cr-details>summary,.cr-contract>summary{cursor:pointer;list-style:none;padding:14px 16px;color:#d9b768;font:800 11px/1.3 var(--font-jetbrains);letter-spacing:.08em;text-transform:uppercase}.cr-details>summary::-webkit-details-marker,.cr-contract>summary::-webkit-details-marker{display:none}.cr-details>summary:after,.cr-contract>summary:after{content:'+';float:right}.cr-details[open]>summary:after,.cr-contract[open]>summary:after{content:'−'}.cr-detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:0 14px 14px}.cr-list{margin:0;background:#15100c;padding:8px 14px}.cr-list div{display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid rgba(245,237,214,.08)}.cr-list div:last-child{border:0}.cr-list dt{color:rgba(245,237,214,.56);font-size:12px}.cr-list dd{margin:0;text-align:right;font:800 12px/1.3 var(--font-jetbrains)}
.cr-campaign-block{margin:0 14px 14px;border-top:1px solid rgba(245,237,214,.09);padding-top:16px}.cr-campaign-block>.cr-subheading>span{color:rgba(245,237,214,.46);font:10px/1.3 var(--font-jetbrains)}.cr-campaign-scroll{overflow-x:auto;margin-top:12px;border:1px solid rgba(245,237,214,.08)}.cr-campaign-table{width:100%;min-width:860px;border-collapse:collapse;background:#15100c}.cr-campaign-table th,.cr-campaign-table td{border-bottom:1px solid rgba(245,237,214,.07);padding:11px 12px;text-align:right;font:800 11px/1.3 var(--font-jetbrains)}.cr-campaign-table thead th{color:rgba(245,237,214,.46);font-size:9px;letter-spacing:.08em;text-transform:uppercase}.cr-campaign-table th:first-child{text-align:left}.cr-campaign-table tbody th{min-width:250px}.cr-campaign-table code{display:block;color:#d9b768;font:700 11px/1.4 var(--font-jetbrains);overflow-wrap:anywhere}.cr-campaign-table small{display:block;margin-top:4px;color:rgba(245,237,214,.38);font:9px/1.3 var(--font-jetbrains)}
.cr-delivery{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}.cr-delivery div{border-left:2px solid rgba(196,148,58,.55);background:#15100c;padding:15px}.cr-delivery span{display:block;color:rgba(245,237,214,.45);font:900 9px/1 var(--font-jetbrains);letter-spacing:.1em;text-transform:uppercase}.cr-delivery strong{display:block;margin-top:9px;font:700 20px/1 var(--font-playfair)}.cr-lines{margin-top:14px}.cr-lines div{display:flex;justify-content:space-between;gap:20px;border-top:1px solid rgba(245,237,214,.08);padding:12px 0;color:rgba(245,237,214,.48);font-size:11px}.cr-lines strong{color:rgba(245,237,214,.72);font-family:var(--font-jetbrains);font-weight:500;text-align:right}
.cr-engine-legend{display:flex;flex-wrap:wrap;gap:14px;margin:-5px 0 16px;color:rgba(245,237,214,.5);font:800 9px/1 var(--font-jetbrains);letter-spacing:.06em;text-transform:uppercase}.cr-engine-legend span{display:flex;align-items:center;gap:6px}.cr-engine-legend i,.cr-engine-health i{width:8px;height:8px;border-radius:50%;background:#73c987;box-shadow:0 0 0 3px rgba(115,201,135,.1)}.cr-engine-legend i.warning,.cr-engine-health.warning i{background:#dca637;box-shadow:0 0 0 3px rgba(220,166,55,.1)}.cr-engine-legend i.critical,.cr-engine-health.critical i{background:#de5e49;box-shadow:0 0 0 3px rgba(222,94,73,.11)}.cr-engine-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.cr-engine-card{min-width:0;border:1px solid rgba(115,201,135,.18);border-left:3px solid #73c987;background:#15100c;padding:14px}.cr-engine-card.warning{border-color:rgba(220,166,55,.26);border-left-color:#dca637;background:linear-gradient(145deg,rgba(196,148,58,.09),#15100c 58%)}.cr-engine-card.critical{border-color:rgba(222,94,73,.28);border-left-color:#de5e49;background:linear-gradient(145deg,rgba(154,50,35,.12),#15100c 58%)}.cr-engine-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.cr-engine-card-head>div>span{color:#c4943a;font:900 9px/1 var(--font-jetbrains);letter-spacing:.12em}.cr-engine-card h3{margin:6px 0 0;font:700 20px/1 var(--font-playfair)}.cr-engine-health{display:flex;align-items:center;gap:6px;border:1px solid rgba(245,237,214,.1);border-radius:999px;padding:6px 8px;color:rgba(245,237,214,.66);font:900 8px/1 var(--font-jetbrains);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.cr-engine-card dl{margin:13px 0 0}.cr-engine-card dl div{display:grid;grid-template-columns:72px minmax(0,1fr);gap:10px;border-top:1px solid rgba(245,237,214,.07);padding:7px 0}.cr-engine-card dt{color:rgba(245,237,214,.4);font-size:10px}.cr-engine-card dd{margin:0;color:rgba(245,237,214,.72);font:700 10px/1.35 var(--font-jetbrains);overflow-wrap:anywhere;text-align:right;text-transform:capitalize}.cr-engine-issue,.cr-engine-clear{margin:10px 0 0;border-radius:7px;padding:8px 9px;font:700 9px/1.4 var(--font-jetbrains);text-transform:capitalize}.cr-engine-issue{background:rgba(220,166,55,.1);color:#efd38f}.cr-engine-card.critical .cr-engine-issue{background:rgba(222,94,73,.1);color:#f4aa9f}.cr-engine-clear{background:rgba(56,130,74,.09);color:#aee7ba}
.cr-demand-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.cr-demand-list article{min-width:0;border:1px solid rgba(245,237,214,.09);background:#15100c;padding:16px}.cr-demand-list article>div>span{color:#c4943a;font:900 9px/1 var(--font-jetbrains);letter-spacing:.1em;text-transform:uppercase}.cr-demand-list h3{margin:7px 0 0;font:700 22px/1.05 var(--font-playfair)}.cr-demand-list dl{margin:13px 0 0}.cr-demand-list dl div{display:flex;justify-content:space-between;gap:12px;border-top:1px solid rgba(245,237,214,.07);padding:8px 0}.cr-demand-list dt{color:rgba(245,237,214,.46);font-size:10px}.cr-demand-list dd{margin:0;color:rgba(245,237,214,.82);font:800 10px/1.3 var(--font-jetbrains);text-align:right}.cr-demand-list p{margin:10px 0 0;color:rgba(245,237,214,.57);font-size:11px;line-height:1.5}
.cr-retention-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.cr-retention-list article{min-width:0;border:1px solid rgba(220,166,55,.22);border-left:3px solid #dca637;background:#15100c;padding:16px}.cr-retention-list article>div>span{color:#c4943a;font:900 9px/1 var(--font-jetbrains);letter-spacing:.1em;text-transform:uppercase}.cr-retention-list h3{margin:7px 0 3px;font:700 22px/1.05 var(--font-playfair)}.cr-retention-list a{color:#d9b768;font-size:11px}.cr-retention-list dl{margin:13px 0 0}.cr-retention-list dl div{display:flex;justify-content:space-between;gap:12px;border-top:1px solid rgba(245,237,214,.07);padding:8px 0}.cr-retention-list dt{color:rgba(245,237,214,.46);font-size:10px}.cr-retention-list dd{margin:0;color:rgba(245,237,214,.82);font:800 10px/1.3 var(--font-jetbrains);text-align:right}.cr-retention-list article>p{margin:10px 0;color:rgba(245,237,214,.6);font-size:11px;line-height:1.5}
.cr-request-state-folders{display:grid;gap:8px;margin-top:16px}.cr-request-state-folder{border:1px solid rgba(245,237,214,.09);border-left:3px solid rgba(245,237,214,.2);border-radius:12px;background:rgba(5,4,3,.3);overflow:hidden}.cr-request-state-folder.status-requested{border-left-color:#dca637}.cr-request-state-folder.status-on_radar{border-left-color:#7893b8}.cr-request-state-folder.status-improved{border-left-color:#73c987}.cr-request-state-folder.status-closed{border-left-color:rgba(245,237,214,.28)}.cr-request-state-folder>summary{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;cursor:pointer;list-style:none;padding:14px 15px;transition:background 120ms ease}.cr-request-state-folder>summary::-webkit-details-marker{display:none}.cr-request-state-folder>summary:hover{background:rgba(196,148,58,.055)}.cr-request-state-folder>summary:focus-visible{outline:2px solid #c4943a;outline-offset:-2px;background:rgba(196,148,58,.08)}.cr-request-state-folder>summary>span{display:grid;gap:4px;min-width:0}.cr-request-state-folder>summary strong{color:#f5edd6;font:700 17px/1 var(--font-playfair)}.cr-request-state-folder>summary small{color:rgba(245,237,214,.44);font-size:10px}.cr-request-state-folder>summary b{min-width:28px;border:1px solid rgba(245,237,214,.11);border-radius:999px;padding:6px 8px;color:#d9b768;font:900 9px/1 var(--font-jetbrains);text-align:center}.cr-request-state-folder>summary:after{content:'+';color:rgba(245,237,214,.44);font:18px/1 var(--font-playfair)}.cr-request-state-folder[open]>summary:after{content:'−'}.cr-request-rows{border-top:1px solid rgba(245,237,214,.08);padding:0 14px 14px}.cr-request-rows article{display:grid;grid-template-columns:minmax(180px,1.2fr) minmax(150px,1fr) auto minmax(190px,auto);align-items:center;gap:16px;padding:13px 2px;border-top:1px solid rgba(245,237,214,.07)}.cr-request-rows article:first-child{border-top:0}.cr-request-person,.cr-request-target{display:grid;gap:4px;min-width:0}.cr-request-person strong,.cr-request-target strong{overflow:hidden;color:#f5edd6;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.cr-request-person a,.cr-request-email{overflow:hidden;color:#d9b768;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.cr-request-target span{color:#c4943a;font:850 8px/1 var(--font-jetbrains);letter-spacing:.09em;text-transform:uppercase}.cr-request-flags{display:flex;flex-wrap:wrap;gap:5px}.cr-request-flags span{border-radius:999px;background:rgba(245,237,214,.055);padding:5px 7px;color:rgba(245,237,214,.58);font:800 8px/1 var(--font-jetbrains);text-transform:uppercase}.cr-request-flags .email-yes{background:rgba(56,130,74,.15);color:#aee7ba}.cr-request-rows time{color:rgba(245,237,214,.4);font:9px/1.3 var(--font-jetbrains);text-align:right}.cr-request-actions{display:grid;justify-items:end;gap:7px}.cr-request-status-form{display:flex;align-items:stretch;gap:6px}.cr-request-status-form label{display:flex}.cr-request-status-form select{min-width:116px;min-height:40px;border:1px solid rgba(245,237,214,.14);border-radius:8px;background:#0d0a07;color:#f5edd6;padding:9px 30px 9px 10px;font:800 11px/1 var(--font-jetbrains);cursor:pointer}.cr-request-status-form select:focus-visible{outline:1px solid #c4943a;outline-offset:1px}.cr-request-status-form button{min-height:40px;border:1px solid rgba(196,148,58,.48);border-radius:8px;background:rgba(196,148,58,.1);color:#e6c77c;padding:9px 12px;font:900 10px/1 var(--font-jetbrains);letter-spacing:.04em;text-transform:uppercase;cursor:pointer}.cr-request-status-form button:hover,.cr-request-status-form button:focus-visible{outline:none;border-color:#c4943a;background:rgba(196,148,58,.2);color:#f5edd6}.cr-request-empty{margin:0;padding:15px 2px 2px;color:rgba(245,237,214,.4);font-size:11px}.cr-action-message{margin:0 0 14px;border-left:2px solid;padding:10px 12px;font-size:11px}.cr-action-message.good{border-color:#73c987;background:rgba(56,130,74,.1);color:#bde8c6}.cr-action-message.bad{border-color:#dc5b4b;background:rgba(151,48,38,.1);color:#ffd3cd}
.cr-founder-list{display:grid;gap:8px}.cr-founder-record{border:1px solid rgba(245,237,214,.09);background:#15100c}.cr-founder-record>summary{display:flex;align-items:center;justify-content:space-between;gap:18px;cursor:pointer;list-style:none;padding:14px 16px}.cr-founder-record>summary::-webkit-details-marker{display:none}.cr-founder-record>summary>span:first-child{display:grid;gap:4px}.cr-founder-record>summary strong{font-family:var(--font-playfair);font-size:18px}.cr-founder-record>summary small{color:rgba(245,237,214,.48)}.cr-founder-status{border:1px solid rgba(220,166,55,.3);border-radius:999px;padding:6px 8px;color:#efd38f;font:900 8px/1 var(--font-jetbrains);letter-spacing:.08em;text-transform:uppercase}.cr-founder-status.shipped{border-color:rgba(115,201,135,.3);color:#aee7ba}.cr-founder-body{display:grid;grid-template-columns:1fr 1.3fr;gap:14px;border-top:1px solid rgba(245,237,214,.08);padding:16px}.cr-founder-private{display:grid;gap:10px;border:1px solid rgba(245,237,214,.07);padding:13px}.cr-founder-private p,.cr-founder-private address{display:grid;gap:4px;margin:0;color:rgba(245,237,214,.68);font-size:11px;font-style:normal;line-height:1.45}.cr-founder-private p strong{color:rgba(245,237,214,.42);font:900 8px/1 var(--font-jetbrains);letter-spacing:.08em;text-transform:uppercase}.cr-founder-private a{color:#d9b768}.cr-founder-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cr-founder-form label{display:grid;gap:6px}.cr-founder-form label:last-of-type{grid-column:1/-1}.cr-founder-form label>span{color:rgba(245,237,214,.5);font-size:10px}.cr-founder-form input,.cr-founder-form select{min-width:0;border:1px solid rgba(245,237,214,.14);border-radius:8px;background:#0d0a07;color:#f5edd6;padding:10px;font:11px var(--font-jetbrains)}.cr-founder-form small{grid-column:1/-1;color:rgba(245,237,214,.45);font-size:10px}.cr-founder-form button{grid-column:1/-1;border:0;border-radius:8px;background:#c4943a;color:#0d0a07;padding:11px;font-weight:900;cursor:pointer}.cr-founder-error{border-left:2px solid #de5e49;background:rgba(154,50,35,.14);padding:12px;color:#f4aa9f;font-size:12px}.cr-founder-email-status{grid-column:1/-1;margin:0;color:rgba(245,237,214,.52);font-size:10px}
.cr-anchor{scroll-margin-top:62px}.cr-anchor>.cr-section{margin-top:22px}.cr-retailer-list{display:grid;gap:8px;margin-top:16px}.cr-retailer-record{border:1px solid rgba(245,237,214,.09);background:#15100c}.cr-retailer-record>summary{display:flex;align-items:center;justify-content:space-between;gap:18px;cursor:pointer;list-style:none;padding:15px 16px}.cr-retailer-record>summary::-webkit-details-marker{display:none}.cr-retailer-record>summary>span:first-child{display:grid;gap:4px;min-width:0}.cr-retailer-record>summary strong{overflow:hidden;font:700 18px/1.15 var(--font-playfair);text-overflow:ellipsis;white-space:nowrap}.cr-retailer-record>summary small{overflow:hidden;color:rgba(245,237,214,.48);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.cr-retailer-status{border:1px solid rgba(220,166,55,.3);border-radius:999px;padding:6px 8px;color:#efd38f;font:900 8px/1 var(--font-jetbrains);letter-spacing:.08em;text-transform:uppercase}.cr-retailer-status.verified{border-color:rgba(115,201,135,.3);color:#aee7ba}.cr-retailer-status.rejected{border-color:rgba(222,94,73,.36);color:#f4aa9f}.cr-retailer-body{display:grid;grid-template-columns:1.25fr .9fr;gap:14px;border-top:1px solid rgba(245,237,214,.08);padding:16px}.cr-retailer-profile{border:1px solid rgba(245,237,214,.07);padding:5px 13px}.cr-retailer-profile dl{margin:0}.cr-retailer-profile dl div{display:grid;grid-template-columns:105px minmax(0,1fr);gap:12px;border-top:1px solid rgba(245,237,214,.07);padding:10px 0}.cr-retailer-profile dl div:first-child{border-top:0}.cr-retailer-profile dt{color:rgba(245,237,214,.4);font:900 8px/1.4 var(--font-jetbrains);letter-spacing:.07em;text-transform:uppercase}.cr-retailer-profile dd{margin:0;overflow-wrap:anywhere;color:rgba(245,237,214,.7);font-size:11px;line-height:1.45}.cr-retailer-actions{display:grid;align-content:start;gap:8px}.cr-retailer-actions form,.cr-retailer-remove form{display:grid;gap:8px}.cr-retailer-verify{border:1px solid rgba(115,201,135,.2);background:rgba(56,130,74,.06);padding:12px}.cr-retailer-actions label,.cr-retailer-remove label{color:rgba(245,237,214,.55);font-size:10px;line-height:1.45}.cr-retailer-actions input,.cr-retailer-actions select,.cr-retailer-remove input{min-width:0;border:1px solid rgba(245,237,214,.14);border-radius:7px;background:#0d0a07;color:#f5edd6;padding:9px;font:10px var(--font-jetbrains)}.cr-retailer-actions button,.cr-retailer-remove button{border:1px solid rgba(196,148,58,.28);border-radius:7px;background:rgba(196,148,58,.09);color:#e8cf93;padding:10px;font:850 10px/1 var(--font-jetbrains);cursor:pointer}.cr-retailer-actions button.danger,.cr-retailer-remove button.danger{border-color:rgba(222,94,73,.32);background:rgba(154,50,35,.11);color:#f4aa9f}.cr-retailer-decision-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cr-retailer-remove{border:1px solid rgba(222,94,73,.2);padding:10px}.cr-retailer-remove>summary{cursor:pointer;color:#f4aa9f;font-size:10px}.cr-retailer-remove form{margin-top:10px}.cr-retailer-submissions{border-top:1px solid rgba(245,237,214,.08);padding:16px}.cr-retailer-submissions h3{margin:0 0 10px;font:700 18px/1 var(--font-playfair)}.cr-retailer-submissions article{display:grid;grid-template-columns:1fr auto;gap:14px;border-top:1px solid rgba(245,237,214,.07);padding:11px 0}.cr-retailer-submissions article>div{display:grid;gap:4px}.cr-retailer-submissions article strong{font-size:12px}.cr-retailer-submissions article span{color:#d9b768;font:800 8px/1 var(--font-jetbrains);text-transform:uppercase}.cr-retailer-submissions article p{margin:0;color:rgba(245,237,214,.48);font-size:10px;line-height:1.45}.cr-retailer-submissions article details>summary{cursor:pointer;color:#f4aa9f;font-size:10px}.cr-retailer-submissions article form{margin-top:6px}
.cr-background{padding-bottom:16px}.cr-background-item{border-top:1px solid rgba(245,237,214,.1)}.cr-background-item:last-child{border-bottom:1px solid rgba(245,237,214,.1)}.cr-background-item>summary{display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;list-style:none;padding:15px 2px}.cr-background-item>summary::-webkit-details-marker{display:none}.cr-background-item>summary>span:first-child{display:grid;gap:5px}.cr-background-item>summary strong{font-size:14px}.cr-background-item>summary small{color:rgba(245,237,214,.44);font-size:11px}.cr-background-body{padding:2px 2px 17px;color:rgba(245,237,214,.64);font-size:13px;line-height:1.6}.cr-background-body>p{max-width:800px}.cr-list.compact{max-width:720px;margin-top:12px}.cr-contract{max-width:900px;margin-top:12px;border:1px solid rgba(245,237,214,.09);background:#15100c}.cr-contract dl{margin:0;padding:0 15px 10px}.cr-contract dl div{display:grid;grid-template-columns:130px 1fr;gap:16px;padding:10px 0;border-top:1px solid rgba(245,237,214,.07)}.cr-contract dt{color:#d9b768;font:900 9px/1.4 var(--font-jetbrains);letter-spacing:.08em;text-transform:uppercase}.cr-contract dd{margin:0;color:rgba(245,237,214,.62);font-size:12px}.cr-mini-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(245,237,214,.08);max-width:900px}.cr-mini-metrics .cr-metric{min-height:120px}.cr-unavailable{max-width:760px;border-left:2px solid rgba(220,166,55,.5);background:rgba(196,148,58,.07);padding:14px}.cr-unavailable p{margin:5px 0 0}
.cr-tool-links{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}.cr-tool-links a{display:flex;justify-content:space-between;gap:15px;border:1px solid rgba(245,237,214,.09);border-radius:12px;padding:15px;color:#f5edd6;text-decoration:none;font-size:13px;transition:transform 120ms ease,border-color 120ms ease,background 120ms ease}.cr-tool-links a span{color:#c4943a}.cr-tool-links a:hover,.cr-tool-links a:focus-visible{outline:none;border-color:rgba(196,148,58,.55);background:rgba(196,148,58,.07)}.cr-tool-links a:active{transform:translateY(2px)}.cr-footer{display:flex;justify-content:space-between;gap:20px;padding:20px 2px;color:rgba(245,237,214,.34);font:10px/1.4 var(--font-jetbrains)}.cr-footer a{color:rgba(245,237,214,.52)}
@media(max-width:980px){.cr-queue-grid,.cr-demand-list,.cr-retention-list{grid-template-columns:1fr}.cr-engine-grid,.cr-attention-strip,.cr-metrics.four{grid-template-columns:repeat(2,minmax(0,1fr))}.cr-request-rows article{grid-template-columns:1fr 1fr}.cr-request-actions{grid-column:1/-1;grid-template-columns:1fr auto;align-items:end}}
@media(max-width:700px){.cr-engine-grid,.cr-attention-strip,.cr-detail-grid,.cr-delivery,.cr-mini-metrics,.cr-tool-links,.cr-founder-body,.cr-founder-form,.cr-retailer-body,.cr-retailer-decision-row,.cr-retailer-submissions article{grid-template-columns:1fr}.cr-shell{padding:18px 12px 45px}.cr-header{align-items:flex-start;display:grid}.cr-checked{text-align:left}.cr-section{padding:16px}.cr-collapsible{padding:0}.cr-collapsible-summary{align-items:flex-start;padding:16px}.cr-collapsible-meta{max-width:145px;text-align:right}.cr-collapsible-meta b{flex:0 0 28px}.cr-collapsible-body{padding:12px}.cr-heading{align-items:flex-start;display:grid}.cr-metrics.four{grid-template-columns:1fr}.cr-metric{min-height:124px}.cr-subheading{align-items:flex-start}.cr-lines div{display:grid}.cr-jump{margin-inline:-12px;padding-inline:12px}.cr-contract dl div{grid-template-columns:1fr;gap:5px}.cr-request-rows article{grid-template-columns:1fr;gap:9px}.cr-request-rows time{text-align:left}.cr-request-actions{grid-template-columns:1fr;justify-items:stretch}.cr-request-status-form{width:100%;min-width:0}.cr-request-status-form label{flex:1;min-width:0}.cr-request-status-form select{width:100%;min-width:0}.cr-request-status-form button{flex:0 0 auto}}
@media(prefers-reduced-motion:reduce){.cr-jump a,.cr-attention-strip a,.cr-tool-links a{transition:none}}
`;
