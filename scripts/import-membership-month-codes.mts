import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as monthModule from "../src/lib/membership-month.ts";
const {encryptMembershipCode,membershipMonthQuery} = ((monthModule as {default?: typeof monthModule}).default || monthModule);
const manifestPath = process.argv.find(value=>value.startsWith("--manifest="))?.slice(11);
if (!manifestPath) throw new Error("Use --manifest=<private provider batch manifest>. Code files must remain outside the repository.");
type Batch = {tier:"standard"|"barrel";audience:"free"|"member";environment:"PRODUCTION"|"SANDBOX";offerId:string;batchId:string;expirationDate:string;csvPath:string};
const batches = JSON.parse(await readFile(manifestPath,"utf8")) as Batch[];
const offers = {"standard:free":"9d5e37e5-7161-4493-8188-663fe9a446ca","standard:member":"8507cd86-d510-43b6-808b-594b74bcb432","barrel:member":"d4ef7adf-cf4b-4f93-9948-c82be19b2707"};
const sql = membershipMonthQuery();
for (const batch of batches) {
  if (offers[`${batch.tier}:${batch.audience}` as keyof typeof offers] !== batch.offerId || !["PRODUCTION","SANDBOX"].includes(batch.environment) || !batch.batchId || Date.parse(batch.expirationDate) <= Date.now()+86400000) throw new Error("Invalid or expired Apple provider batch.");
  // Apple downloads one code per line without a header. Neither plaintext codes nor CSV content may be logged.
  const codes = (await readFile(batch.csvPath,"utf8")).trim().split(/\r?\n/).map(value=>value.trim());
  const encrypted = codes.map(code=>({hash:createHash("sha256").update(code).digest("hex"),ciphertext:encryptMembershipCode(code)}));
  if (process.argv.includes("--apply")) {
    await sql.transaction(tx=>encrypted.map(code=>tx.query(`INSERT INTO signal_membership_offer_codes(id,offer_id,batch_id,tier,audience,environment,code_hash,encrypted_code,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date) ON CONFLICT(code_hash) DO NOTHING`,[code.hash,batch.offerId,batch.batchId,batch.tier,batch.audience,batch.environment,code.hash,code.ciphertext,batch.expirationDate])),{isolationLevel:"Serializable"});
  }
  console.log(JSON.stringify({batchId:batch.batchId,environment:batch.environment,codeCount:codes.length,applied:process.argv.includes("--apply")}));
}
