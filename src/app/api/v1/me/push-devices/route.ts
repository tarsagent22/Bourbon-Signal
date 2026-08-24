import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { normalizeNotificationPreferences } from "@/lib/notification-preferences";
import { disablePushDevice, enabledPushTokens, normalizePushDevices, registerPushDevice, type PushPlatform } from "@/lib/push-devices";
import { isServerPaidTier } from "@/lib/server-entitlements";

function responseFor(devices: ReturnType<typeof normalizePushDevices>, deviceId = "") {
  const active = devices.filter((device) => device.enabled);
  const currentDeviceRegistered = Boolean(deviceId && active.some((device) => device.deviceId === deviceId));
  return {
    supported: true,
    enabled: deviceId ? currentDeviceRegistered : active.length > 0,
    registeredDeviceCount: active.length,
    currentDeviceRegistered,
  };
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const deviceId = req.nextUrl.searchParams.get("deviceId")?.trim() || "";
  return NextResponse.json(responseFor(normalizePushDevices(privateMetadata.pushDevices), deviceId));
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: "register" | "disable"; deviceId?: string; expoPushToken?: string; platform?: PushPlatform };
  if (!body.deviceId || (body.action !== "register" && body.action !== "disable")) {
    return NextResponse.json({ error: "Invalid push device request" }, { status: 400 });
  }
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (body.action === "register" && !(await isServerPaidTier(user.publicMetadata))) {
    return NextResponse.json({ error: "Radar alerts require an eligible membership." }, { status: 403 });
  }
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const current = normalizePushDevices(privateMetadata.pushDevices);
  const now = new Date().toISOString();
  let devices;
  try {
    devices = body.action === "register"
      ? registerPushDevice(current, { deviceId: body.deviceId, expoPushToken: body.expoPushToken || "", platform: body.platform === "android" ? "android" : "ios" }, now)
      : disablePushDevice(current, body.deviceId, now);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid push device registration." }, { status: 400 });
  }
  const notificationPreferences = normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences);
  const pushEnabled = enabledPushTokens(devices).length > 0;
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { pushDevices: devices },
    publicMetadata: { notificationPreferences: { ...notificationPreferences, push: { enabled: pushEnabled } } },
  });
  return NextResponse.json(responseFor(devices, body.deviceId));
}
