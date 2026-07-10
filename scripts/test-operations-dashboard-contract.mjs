import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/admin/operations/page.tsx", import.meta.url), "utf8");
assert.match(page, /auth\(\)/);
assert.match(page, /isRewardsAdminEmail/);
assert.match(page, /readAlertDeliveryHeartbeat/);
assert.match(page, /readSiteExport\("stats"\)/);
assert.doesNotMatch(page, /BLOB_READ_WRITE_TOKEN|CRON_SECRET|TWILIO_AUTH_TOKEN|RESEND_API_KEY/);
assert.match(page, /force-dynamic/);
console.log("Operations dashboard contract passed.");
