import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { render } from "@react-email/render";
import { FreeMemberDayTwoEmail } from "../src/components/emails/FreeMemberDayTwoEmail.tsx";

async function main() {
  const outputPath = resolve(process.argv[2] || "artifacts/free-member-day-two-trial-v2.html");
  const html = await render(FreeMemberDayTwoEmail({
    firstName: "Chandler",
    unsubscribeUrl: "https://www.bourbonsignal.com/api/member-weekly-intelligence/unsubscribe?token=REVIEW_ONLY",
    baseUrl: "https://www.bourbonsignal.com",
  }));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
  console.log(outputPath);
}

void main();
