import type { RetailerApplicationRecord, RetailerSubmissionRecord } from "@/lib/retailer-repository";
import {
  removeRetailerAccess,
  removeRetailerSubmission,
  resendRetailerDecisionNotification,
  updateRetailerStatus,
} from "@/app/admin/retailers/actions";

type Props = {
  retailers: RetailerApplicationRecord[];
  submissions: RetailerSubmissionRecord[];
};

export default function RetailerAdministration({ retailers, submissions }: Props) {
  const pendingCount = retailers.filter((retailer) => retailer.status === "pending").length;
  return (
    <section className="cr-section cr-retailer-section">
      <div className="cr-heading">
        <div><p>Retailer operations</p><h2>Retailer access</h2></div>
        <span>{retailers.length} accounts · {pendingCount} pending</span>
      </div>
      <p className="cr-note top">Verify retailer identity, manage access, and remove invalid retailer-submitted signals from this owner-only workspace.</p>

      {retailers.length ? (
        <div className="cr-retailer-list">
          {retailers.map((application) => {
            const retailerSubmissions = submissions.filter((submission) => submission.userId === application.userId);
            const decisionPending = (application.status === "verified" || application.status === "rejected")
              && application.decisionNotifiedStatus !== application.status;
            return (
              <details className="cr-retailer-record" key={application.userId} open={application.status === "pending"}>
                <summary>
                  <span><strong>{application.storeName || "Incomplete retailer account"}</strong><small>{application.firstName || "Unknown applicant"} · {application.email}</small></span>
                  <span className={`cr-retailer-status ${application.status}`}>{application.status}</span>
                </summary>
                <div className="cr-retailer-body">
                  <div className="cr-retailer-profile">
                    <dl>
                      <div><dt>Role</dt><dd>{application.applicantRole || "Not provided"}</dd></div>
                      <div><dt>Phone</dt><dd>{application.listedPhone || "Not provided"}</dd></div>
                      <div><dt>Website</dt><dd>{application.website || "Not provided"}</dd></div>
                      <div><dt>Address</dt><dd>{application.storeAddress || "Not provided"}</dd></div>
                      <div><dt>Review notice</dt><dd>{application.notificationSentAt ? `Sent ${new Date(application.notificationSentAt).toLocaleString()}` : "Pending delivery"}</dd></div>
                      {(application.status === "verified" || application.status === "rejected") ? <div><dt>Decision email</dt><dd>{decisionPending ? "Decision email pending" : application.decisionNotificationSentAt ? `Sent ${new Date(application.decisionNotificationSentAt).toLocaleString()}` : "Sent"}</dd></div> : null}
                    </dl>
                  </div>

                  <div className="cr-retailer-actions">
                    <form action={updateRetailerStatus} className="cr-retailer-verify">
                      <input type="hidden" name="userId" value={application.userId} />
                      <input type="hidden" name="status" value="verified" />
                      <label htmlFor={`verification-method-${application.userId}`}>Independent verification</label>
                      <select id={`verification-method-${application.userId}`} name="verificationMethod" required defaultValue="public_phone">
                        <option value="public_phone">Public phone callback</option>
                        <option value="business_email">Official business email</option>
                      </select>
                      <input name="verificationContact" required maxLength={240} placeholder="Phone called or email used" />
                      <button type="submit">Mark verified</button>
                    </form>
                    <div className="cr-retailer-decision-row">
                      <form action={updateRetailerStatus}><input type="hidden" name="userId" value={application.userId} /><input type="hidden" name="status" value="pending" /><button type="submit">Keep pending</button></form>
                      <form action={updateRetailerStatus}><input type="hidden" name="userId" value={application.userId} /><input type="hidden" name="status" value="rejected" /><button className="danger" type="submit">Reject access</button></form>
                    </div>
                    {decisionPending ? <form action={resendRetailerDecisionNotification}><input type="hidden" name="userId" value={application.userId} /><button type="submit">Resend decision email</button></form> : null}
                    <details className="cr-retailer-remove">
                      <summary>Remove retailer access</summary>
                      <form action={removeRetailerAccess}>
                        <input type="hidden" name="userId" value={application.userId} />
                        <label htmlFor={`remove-${application.userId}`}>Type <strong>{application.storeName}</strong> to remove this retailer profile and its submissions. The customer’s main sign-in account is not deleted.</label>
                        <input id={`remove-${application.userId}`} name="confirmation" required autoComplete="off" />
                        <button className="danger" type="submit">Remove retailer profile</button>
                      </form>
                    </details>
                  </div>
                </div>

                {retailerSubmissions.length ? (
                  <div className="cr-retailer-submissions">
                    <h3>Submitted signals</h3>
                    {retailerSubmissions.map((submission) => (
                      <article key={submission.id}>
                        <div><strong>{submission.title}</strong><span>{submission.status === "rejected" ? "removed" : "retailer signal"}</span><p>{submission.storeName} · {submission.storeAddress}{submission.locationDetails ? ` · ${submission.locationDetails}` : ""}{submission.kind === "other" ? "" : ` · ${submission.availability || "No availability supplied"} · ${submission.price || "No price supplied"}`}</p></div>
                        <details><summary>Remove</summary><form action={removeRetailerSubmission}><input type="hidden" name="userId" value={application.userId} /><input type="hidden" name="submissionId" value={submission.id} /><button className="danger" type="submit">Confirm remove</button></form></details>
                      </article>
                    ))}
                  </div>
                ) : null}
              </details>
            );
          })}
        </div>
      ) : <div className="cr-unavailable"><strong>No retailer accounts yet.</strong><p>New retailer applications will appear here for verification.</p></div>}
    </section>
  );
}
