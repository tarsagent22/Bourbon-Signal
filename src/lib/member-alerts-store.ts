import { promises as fs } from "fs";
import path from "path";
import type { MemberAlertRecord } from "@/lib/notification-preferences";

const alertsFilePath = path.join(process.cwd(), "data", "member-alerts.json");

async function ensureAlertsFile() {
  await fs.mkdir(path.dirname(alertsFilePath), { recursive: true });
  try {
    await fs.access(alertsFilePath);
  } catch {
    await fs.writeFile(alertsFilePath, "[]\n", "utf8");
  }
}

export async function readMemberAlerts(): Promise<MemberAlertRecord[]> {
  await ensureAlertsFile();
  try {
    const raw = await fs.readFile(alertsFilePath, "utf8");
    const parsed = JSON.parse(raw) as MemberAlertRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeMemberAlerts(alerts: MemberAlertRecord[]) {
  await ensureAlertsFile();
  await fs.writeFile(alertsFilePath, JSON.stringify(alerts, null, 2), "utf8");
}
