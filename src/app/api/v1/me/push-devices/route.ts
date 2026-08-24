import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { persistPushDeviceChange, pushDeviceErrorBody, type PushDeviceErrorCode } from "@/lib/push-device-registration";
import { normalizePushDevices, type PushPlatform } from "@/lib/push-devices";
import { isServerPaidTier } from "@/lib/server-entitlements";
import { normalizeNotificationPreferences } from "@/lib/notification-preferences";

const HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
function errorResponse(status: number, code: PushDeviceErrorCode, message: string, requestId: string, retryable = false) {
  return Response.json(pushDeviceErrorBody(code, message, requestId, retryable), { status, headers: HEADERS });
}

function projectionStatus(value: unknown): "saved" | "deferred" {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return source.status === "pending" ? "deferred" : "saved";
}

function responseFor(
  devices: ReturnType<typeof normalizePushDevices>,
  deviceId: string,
  requestId: string,
  preferenceProjection: "saved" | "deferred",
  publicPushEnabled: boolean,
) {
  const active = devices.filter((device) => device.enabled);
  const currentDeviceRegistered = Boolean(deviceId && active.some((device) => device.deviceId === deviceId));
  const enabled = preferenceProjection === "saved" && publicPushEnabled && (deviceId ? currentDeviceRegistered : active.length > 0);
  return {
    supported: true,
    enabled,
    registeredDeviceCount: active.length,
    currentDeviceRegistered,
    requestId,
    preferenceProjection,
    ...(preferenceProjection === "deferred" ? {
      warning: { code: "PUSH_PREFERENCE_WRITE_FAILED" as const, message: "The device was saved, but Radar preference sync is incomplete. Tap Retry to finish enabling Push.", requestId },
    } : {}),
  };
}

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const { userId } = await auth();
  if (!userId) return errorResponse(401, "PUSH_PROFILE_LOAD_FAILED", "Sign in to view push registration.", requestId);
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
    const deviceId = req.nextUrl.searchParams.get("deviceId")?.trim().slice(0, 120) || "";
    const publicPushEnabled = normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences).push.enabled;
    return Response.json(responseFor(
      normalizePushDevices(privateMetadata.pushDevices),
      deviceId,
      requestId,
      projectionStatus(privateMetadata.pushPreferenceProjection),
      publicPushEnabled,
    ), { headers: HEADERS });
  } catch {
    return errorResponse(503, "PUSH_PROFILE_LOAD_FAILED", "Push registration is temporarily unavailable.", requestId, true);
  }
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const { userId } = await auth();
  if (!userId) return errorResponse(401, "PUSH_PROFILE_LOAD_FAILED", "Sign in to change push registration.", requestId);
  const body = (await req.json().catch(() => ({}))) as { action?: "register" | "disable"; deviceId?: string; expoPushToken?: string; platform?: PushPlatform };
  if (!body.deviceId?.trim() || (body.action !== "register" && body.action !== "disable")) {
    return errorResponse(400, "PUSH_VALIDATION_FAILED", "A device ID and valid action are required.", requestId);
  }
  let client: Awaited<ReturnType<typeof clerkClient>>;
  let user: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>;
  try {
    client = await clerkClient();
    user = await client.users.getUser(userId);
  } catch {
    return errorResponse(503, "PUSH_PROFILE_LOAD_FAILED", "Member profile is temporarily unavailable.", requestId, true);
  }
  if (body.action === "register") {
    try {
      if (!(await isServerPaidTier(user.publicMetadata))) {
        return errorResponse(403, "PUSH_ENTITLEMENT_FAILED", "Radar alerts require an eligible membership.", requestId);
      }
    } catch {
      return errorResponse(503, "PUSH_ENTITLEMENT_FAILED", "Membership access could not be confirmed.", requestId, true);
    }
  }
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  let saved;
  try {
    saved = await persistPushDeviceChange({
      currentDevices: privateMetadata.pushDevices,
      action: body.action,
      device: { deviceId: body.deviceId, expoPushToken: body.expoPushToken, platform: body.platform },
      now: new Date().toISOString(),
      writePrivateDevices: async (pushDevices, pushPreferenceProjection) => {
        await client.users.updateUserMetadata(userId, { privateMetadata: { pushDevices, pushPreferenceProjection } });
      },
      writePublicPushPreference: async (enabled) => {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: { notificationPreferences: { push: { enabled } } },
        });
      },
      writeProjectionState: async (pushPreferenceProjection) => {
        await client.users.updateUserMetadata(userId, { privateMetadata: { pushPreferenceProjection } });
      },
    });
  } catch (error) {
    const validation = error instanceof Error && /invalid push device/i.test(error.message);
    return errorResponse(validation ? 400 : 503, validation ? "PUSH_VALIDATION_FAILED" : "PUSH_DEVICE_WRITE_FAILED", validation ? error.message : "This device could not be saved.", requestId, !validation);
  }
  return Response.json(responseFor(saved.devices, body.deviceId, requestId, saved.preferenceProjection, saved.pushEnabled), { headers: HEADERS });
}
