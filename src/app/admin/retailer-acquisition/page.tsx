import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  RETAILER_PROSPECT_STATES,
  OFFICIAL_REGULATOR_AUTHORITIES,
  draftProspectOutreach,
  type OfficialContactEvidenceKind,
  type ProspectContactChannel,
  type RetailerProspectState,
} from "@/lib/retailer-acquisition";
import { isRetailerAdminEmail } from "@/lib/retailer-admin";
import { getRetailerProspectRepository } from "@/lib/retailer-prospect-repository";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function primaryEmail(user: { emailAddresses?: Array<{ id?: string; emailAddress?: string }>; primaryEmailAddressId?: string | null }) {
  const emails = user.emailAddresses || [];
  return (emails.find((email) => email.id === user.primaryEmailAddressId) || emails[0])?.emailAddress?.trim().toLowerCase() || "";
}

async function requireOwner() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/admin/retailer-acquisition");
  const client = await clerkClient();
  const owner = await client.users.getUser(userId);
  if (!isRetailerAdminEmail(primaryEmail(owner))) notFound();
  return owner;
}

function prospectState(value: FormDataEntryValue | null) {
  const state = String(value || "") as RetailerProspectState;
  return RETAILER_PROSPECT_STATES.includes(state) ? state : null;
}

function nextStates(state: RetailerProspectState, followUpCount: number) {
  const byState: Partial<Record<RetailerProspectState, RetailerProspectState[]>> = {
    discovered: ["qualified", "paused", "declined", "invalid"],
    qualified: ["contact_verified", "paused", "declined", "invalid"],
    contacted: [...(followUpCount < 1 ? ["follow_up_due" as const] : []), "interested", "onboarding", "paused", "declined", "invalid"],
    follow_up_due: ["interested", "onboarding", "paused", "declined", "invalid"],
    interested: ["onboarding", "paused", "declined"],
    onboarding: ["verified", "paused", "declined"],
    verified: ["first_signal_live", "paused"],
    first_signal_live: ["paused"],
    paused: ["qualified", "declined", "invalid"],
    awaiting_approval: ["draft_ready", "paused", "declined", "invalid"],
  };
  return byState[state] || [];
}

async function transitionProspect(formData: FormData) {
  "use server";
  await requireOwner();
  const id = String(formData.get("prospectId") || "");
  const state = prospectState(formData.get("state"));
  if (!id || !state) return;
  await getRetailerProspectRepository().transition({ prospectId: id, state, outcome: String(formData.get("outcome") || "") });
  revalidatePath("/admin/retailer-acquisition");
}

async function addOfficialContact(formData: FormData) {
  "use server";
  const owner = await requireOwner();
  const prospectId = String(formData.get("prospectId") || "");
  const kind = String(formData.get("kind") || "") as OfficialContactEvidenceKind;
  if (!prospectId || !["official_website_email", "official_website_phone", "official_contact_form", "regulator_listing"].includes(kind)) return;
  const authorityId = String(formData.get("regulatorAuthorityId") || "");
  const regulatorAuthority = kind === "regulator_listing"
    ? OFFICIAL_REGULATOR_AUTHORITIES.find((authority) => authority.id === authorityId)
    : undefined;
  if (kind === "regulator_listing" && !regulatorAuthority) return;
  await getRetailerProspectRepository().addOfficialContactEvidence({
    prospectId,
    verifiedBy: owner.id,
    evidence: {
      kind,
      sourceUrl: String(formData.get("sourceUrl") || "").trim(),
      contactValue: String(formData.get("contactValue") || "").trim(),
      capturedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      regulatorAuthority,
    },
  });
  revalidatePath("/admin/retailer-acquisition");
}

async function createDraft(formData: FormData) {
  "use server";
  const owner = await requireOwner();
  const prospectId = String(formData.get("prospectId") || "");
  const channel = String(formData.get("channel") || "email") as ProspectContactChannel;
  const repository = getRetailerProspectRepository();
  const prospect = await repository.getProspect(prospectId);
  if (!prospect || !["email", "phone", "contact_form"].includes(channel)) return;
  const versions = await repository.listMessageVersions(prospectId);
  const draft = draftProspectOutreach({
    prospectId,
    version: (versions[0]?.version || 0) + 1,
    retailerName: prospect.name,
    city: prospect.city,
    state: prospect.state,
    contactChannel: channel,
  });
  await repository.createDraft({ prospectId, channel, subject: draft.subject, body: draft.body, createdBy: owner.id });
  revalidatePath("/admin/retailer-acquisition");
}

async function saveDraftVersion(formData: FormData) {
  "use server";
  const owner = await requireOwner();
  const prospectId = String(formData.get("prospectId") || "");
  const channel = String(formData.get("channel") || "email") as ProspectContactChannel;
  const subject = String(formData.get("subject") || "");
  const body = String(formData.get("body") || "");
  if (!prospectId || !body.trim() || !["email", "phone", "contact_form"].includes(channel)) return;
  await getRetailerProspectRepository().createDraft({ prospectId, channel, subject, body, createdBy: owner.id });
  revalidatePath("/admin/retailer-acquisition");
}

async function submitApprovalPacket(formData: FormData) {
  "use server";
  await requireOwner();
  const prospectId = String(formData.get("prospectId") || "");
  const messageId = String(formData.get("messageId") || "");
  if (!prospectId || !messageId) return;
  await getRetailerProspectRepository().submitDraftForApproval({ prospectId, messageId });
  revalidatePath("/admin/retailer-acquisition");
}

async function approveExactDraft(formData: FormData) {
  "use server";
  const owner = await requireOwner();
  const prospectId = String(formData.get("prospectId") || "");
  const messageId = String(formData.get("messageId") || "");
  const version = Number(formData.get("version") || 0);
  if (!prospectId || !messageId || !Number.isInteger(version) || version < 1) return;
  await getRetailerProspectRepository().approveExactDraft({ prospectId, messageId, version, approvedBy: owner.id });
  revalidatePath("/admin/retailer-acquisition");
}

async function recordManualOutreach(formData: FormData) {
  "use server";
  const owner = await requireOwner();
  const prospectId = String(formData.get("prospectId") || "");
  const messageVersionId = String(formData.get("messageVersionId") || "");
  const kind = String(formData.get("kind") || "") === "follow_up" ? "follow_up" : "initial";
  const timestamp = new Date(String(formData.get("contactedAt") || ""));
  if (!prospectId || !messageVersionId || Number.isNaN(timestamp.getTime())) return;
  await getRetailerProspectRepository().recordManualOutreach({
    prospectId,
    messageVersionId,
    kind,
    recordedBy: owner.id,
    contactedAt: timestamp.toISOString(),
    note: String(formData.get("note") || ""),
  });
  revalidatePath("/admin/retailer-acquisition");
}

export default async function RetailerAcquisitionPage() {
  await requireOwner();
  const repository = getRetailerProspectRepository();
  const [prospects, aggregate, allEvidence, allMessages, allPackets] = await Promise.all([
    repository.listProspects({ limit: 200 }),
    repository.aggregateOutcomes(),
    repository.listEvidence(),
    repository.listMessageVersions(),
    repository.listApprovalPackets(),
  ]);
  const bundles = prospects.map((prospect) => ({
    prospect,
    evidence: allEvidence.filter((item) => item.prospectId === prospect.id),
    messages: allMessages.filter((item) => item.prospectId === prospect.id),
    packet: allPackets.find((item) => item.prospectId === prospect.id) || null,
  }));
  const approvedCount = (aggregate.states.approved || 0) + (aggregate.states.contacted || 0) + (aggregate.states.follow_up_due || 0);
  const convertedCount = (aggregate.states.verified || 0) + (aggregate.states.first_signal_live || 0);

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.masthead}>
          <div>
            <p className={styles.eyebrow}>Owner console · acquisition ledger</p>
            <h1 className={styles.title}>Retailer acquisition machine</h1>
            <p className={styles.lede}>A deliberate path from measured coverage gaps to verified retailer signals. Approval is version-locked; contact is a manual ledger event; outcomes stay aggregate.</p>
          </div>
          <nav className={styles.nav} aria-label="Owner operations"><a href="/admin/retailers">Retailer access</a><a href="/admin/operations">Engine operations</a></nav>
        </header>

        <section aria-labelledby="aggregate-outcomes-heading">
          <h2 className={`${styles.eyebrow} ${styles.aggregateHeading}`} id="aggregate-outcomes-heading">Aggregate outcomes</h2>
          <div className={styles.metrics}>
            <div className={styles.metric}><span>Prospects</span><strong>{aggregate.total}</strong></div>
            <div className={styles.metric}><span>Awaiting owner</span><strong>{aggregate.states.awaiting_approval || 0}</strong></div>
            <div className={styles.metric}><span>Approved / active</span><strong>{approvedCount}</strong></div>
            <div className={styles.metric}><span>Verified / live</span><strong>{convertedCount}</strong></div>
          </div>
        </section>

        <section className={styles.list} aria-label="Retailer prospect work queue">
          {bundles.length ? bundles.map(({ prospect, evidence, messages, packet }) => {
            const currentDraft = messages.find((message) => message.status === "draft");
            const approvedMessage = messages.find((message) => message.status === "approved");
            const verifiedEvidence = evidence.filter((item) => item.verifiedAt);
            const transitions = nextStates(prospect.prospectState, prospect.followUpCount);
            const outreachKind = prospect.prospectState === "follow_up_due" ? "follow_up" : "initial";
            return (
              <article className={styles.prospect} key={prospect.id}>
                <div className={styles.identity}>
                  <div className={styles.statusRow}><span className={styles.status}>{prospect.prospectState.replaceAll("_", " ")}</span><strong className={styles.score}>{prospect.score.total}<small>/100</small></strong></div>
                  <h2 className={styles.name}>{prospect.name}</h2>
                  <p className={styles.address}>{[prospect.address, prospect.city, prospect.state, prospect.postalCode].filter(Boolean).join(" · ") || "Location pending"}</p>
                  <dl className={styles.meta}>
                    <div><dt>Coverage gap</dt><dd>{prospect.score.components.coverageGap} / 30</dd></div>
                    <div><dt>Demand</dt><dd>{prospect.score.components.demand} / 30</dd></div>
                    <div><dt>Official source</dt><dd>{prospect.website ? <a href={prospect.website} rel="noreferrer" target="_blank">{prospect.domainKey}</a> : "Not captured"}</dd></div>
                    <div><dt>Contact ledger</dt><dd>{prospect.initialContactCount} initial · {prospect.followUpCount} follow-up</dd></div>
                  </dl>
                  {transitions.length ? <div className={styles.buttonRow}>{transitions.map((state) => (
                    <form action={transitionProspect} key={state}><input name="prospectId" type="hidden" value={prospect.id} /><input name="state" type="hidden" value={state} /><button className={`${styles.button} ${["declined", "invalid"].includes(state) ? styles.buttonDanger : ""}`} type="submit">Mark {state.replaceAll("_", " ")}</button></form>
                  ))}</div> : null}
                </div>

                <div className={styles.workbench}>
                  <section className={styles.section}>
                    <h3>Official-contact evidence</h3>
                    <p className={styles.sectionIntro}>Only a business-controlled website or an explicitly allowlisted regulator authority qualifies. Directory contact details are not enough.</p>
                    <div className={styles.evidenceList}>{verifiedEvidence.length ? verifiedEvidence.map((item) => <div className={styles.evidence} key={item.id}><strong>{item.kind.replaceAll("_", " ")}</strong><br />{item.contactValue}<br />{item.sourceUrl}{item.regulatorAuthority ? <><br />{item.regulatorAuthority.name} · {item.regulatorAuthority.domain}</> : null}</div>) : <div className={styles.evidence}>No verified official contact.</div>}</div>
                    {["qualified", "contact_verified"].includes(prospect.prospectState) ? <form action={addOfficialContact} className={styles.form}>
                      <input name="prospectId" type="hidden" value={prospect.id} />
                      <div className={styles.formGrid}>
                        <label>Evidence type<select className={styles.select} name="kind" defaultValue="official_website_email"><option value="official_website_email">Official website email</option><option value="official_website_phone">Official website phone</option><option value="official_contact_form">Official contact form</option><option value="regulator_listing">Regulator listing</option></select></label>
                        <label>Contact value<input className={styles.input} name="contactValue" required /></label>
                      </div>
                      <label>Regulator authority (required for regulator listings)<select className={styles.select} name="regulatorAuthorityId" defaultValue=""><option value="">Not a regulator listing</option>{OFFICIAL_REGULATOR_AUTHORITIES.map((authority) => <option key={authority.id} value={authority.id}>{authority.name} · {authority.domain}</option>)}</select></label>
                      <label>Exact source URL<input className={styles.input} name="sourceUrl" type="url" required /></label>
                      <button className={styles.button} type="submit">Verify evidence</button>
                    </form> : null}
                  </section>

                  <section className={styles.section}>
                    <h3>Approval packet</h3>
                    <p className={styles.sectionIntro}>Score inputs, evidence, and copy travel together. Editing copy creates another version.</p>
                    {prospect.prospectState === "contact_verified" ? <form action={createDraft} className={styles.form}><input name="prospectId" type="hidden" value={prospect.id} /><label>Contact channel<select className={styles.select} name="channel" defaultValue="email"><option value="email">Email</option><option value="phone">Phone</option><option value="contact_form">Contact form</option></select></label><button className={styles.button} type="submit">Create local draft</button></form> : null}
                    {currentDraft ? <div className={styles.draft}>
                      <div className={styles.draftHeader}><strong>Version {currentDraft.version} · {currentDraft.status}</strong><span>{currentDraft.channel}</span></div>
                      <pre>{currentDraft.subject}{"\n\n"}{currentDraft.body}</pre>
                      {prospect.prospectState === "draft_ready" ? <form action={saveDraftVersion} className={styles.form}>
                        <input name="prospectId" type="hidden" value={prospect.id} />
                        <label>Channel<select className={styles.select} name="channel" defaultValue={currentDraft.channel}><option value="email">Email</option><option value="phone">Phone</option><option value="contact_form">Contact form</option></select></label>
                        <label>Subject<input className={styles.input} defaultValue={currentDraft.subject} name="subject" maxLength={240} /></label>
                        <label>Message<textarea className={styles.textarea} defaultValue={currentDraft.body} name="body" maxLength={10_000} required /></label>
                        <button className={styles.button} type="submit">Save as new version</button>
                      </form> : null}
                      {prospect.prospectState === "draft_ready" ? <form action={submitApprovalPacket} className={styles.buttonRow}><input name="prospectId" type="hidden" value={prospect.id} /><input name="messageId" type="hidden" value={currentDraft.id} /><button className={styles.button} type="submit">Submit packet for review</button></form> : null}
                      {prospect.prospectState === "awaiting_approval" ? <form action={approveExactDraft} className={styles.buttonRow}><input name="prospectId" type="hidden" value={prospect.id} /><input name="messageId" type="hidden" value={currentDraft.id} /><input name="version" type="hidden" value={currentDraft.version} /><button className={styles.button} type="submit">Approve exact draft</button></form> : null}
                    </div> : null}
                    {packet ? <details className={styles.packet}><summary>Approved packet · immutable snapshot</summary><pre>{JSON.stringify(packet.packet, null, 2)}</pre></details> : null}
                  </section>

                  {approvedMessage && ["approved", "follow_up_due"].includes(prospect.prospectState) ? <section className={styles.section}>
                    <h3>Record manual outreach</h3>
                    <p className={styles.sectionIntro}>This records work completed elsewhere. It does not contact the retailer.</p>
                    <form action={recordManualOutreach} className={styles.form}>
                      <input name="prospectId" type="hidden" value={prospect.id} /><input name="messageVersionId" type="hidden" value={approvedMessage.id} /><input name="kind" type="hidden" value={outreachKind} />
                      <div className={styles.formGrid}><label>Approved channel<input className={styles.input} readOnly value={approvedMessage.channel} /></label><label>Completed at<input className={styles.input} name="contactedAt" type="datetime-local" required /></label></div>
                      <label>Private note<input className={styles.input} name="note" maxLength={500} /></label>
                      <button className={styles.button} type="submit">Record {outreachKind.replaceAll("_", " ")}</button>
                    </form>
                  </section> : null}
                </div>
              </article>
            );
          }) : <p className={styles.empty}>No prospects yet. Run discovery and ranking, review the artifact, then use the owner-only acquisition import command. It is a dry run unless --apply is explicit.</p>}
        </section>
      </div>
    </main>
  );
}
