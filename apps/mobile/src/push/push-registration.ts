import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { PushDeviceStatus } from "../api/types";
import type { createMobileApi } from "../api/client";

const DEVICE_ID_KEY = "bourbon-signal.push-device-id";
const PUSH_REVOCATION_TOKEN_KEY = "bourbon-signal.push-revocation-token";
export const PENDING_PUSH_REVOCATION_KEY = "bourbon-signal.pending-push-revocation";
export const PUSH_ENABLED_KEY = "bourbon-signal.push-enabled";

type MobileApi = ReturnType<typeof createMobileApi>;
type PushStatusListener = (status: PushDeviceStatus | null) => void;
let logoutInProgress = false;

type PendingPushRevocation = { deviceId: string; revocationToken: string };

function pushRevocationUrl() {
  const base = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || "https://www.bourbonsignal.com";
  return `${String(base).replace(/\/+$/, "")}/api/v1/push-revocations`;
}

export async function flushPendingPushRevocation(fetcher: typeof fetch = fetch) {
  const raw = await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY);
  if (!raw) return true;
  let pending: PendingPushRevocation;
  try {
    pending = JSON.parse(raw) as PendingPushRevocation;
  } catch {
    await SecureStore.deleteItemAsync(PENDING_PUSH_REVOCATION_KEY);
    return true;
  }
  if (!pending.deviceId || !pending.revocationToken) return false;
  try {
    const response = await fetcher(pushRevocationUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    });
    const body = await response.json().catch(() => ({})) as { ok?: boolean };
    if (!response.ok || body.ok !== true) return false;
    await SecureStore.deleteItemAsync(PENDING_PUSH_REVOCATION_KEY);
    if (await SecureStore.getItemAsync(PUSH_REVOCATION_TOKEN_KEY) === pending.revocationToken) {
      await SecureStore.deleteItemAsync(PUSH_REVOCATION_TOKEN_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function configureRadarNotifications() {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function radarPushDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}

export async function radarPushPermission() {
  const permission = await Notifications.getPermissionsAsync();
  return permission.status;
}

export async function rememberRadarPushEnabled(enabled: boolean) {
  if (enabled && logoutInProgress) return;
  await SecureStore.setItemAsync(PUSH_ENABLED_KEY, enabled ? "1" : "0");
}

async function configureAndroidRadarChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("radar", {
    name: "Radar matches",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    sound: "default",
  });
}

async function registerCurrentRadarPushToken(api: MobileApi, requestPermission: boolean) {
  if (logoutInProgress) return null;
  if (!Device.isDevice) {
    if (requestPermission) throw new Error("Push notifications require a physical device.");
    return null;
  }
  await configureAndroidRadarChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (requestPermission && permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") {
    if (requestPermission) throw new Error("Notification permission was not granted. Enable it in device settings to receive Radar alerts.");
    return null;
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Push project configuration is unavailable.");
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceId = await radarPushDeviceId();
  if (logoutInProgress) return null;
  await flushPendingPushRevocation().catch(() => false);
  const status = await api.registerPushDevice({ deviceId, expoPushToken: token.data, platform: Platform.OS === "android" ? "android" : "ios" });
  if (status.revocationToken) await SecureStore.setItemAsync(PUSH_REVOCATION_TOKEN_KEY, status.revocationToken);
  return status;
}

export async function enableRadarPush(api: MobileApi) {
  logoutInProgress = false;
  const status = await registerCurrentRadarPushToken(api, true);
  if (!status) throw new Error("Push notifications could not be enabled on this device.");
  await rememberRadarPushEnabled(status.enabled);
  return status;
}

export async function disableRadarPush(api: MobileApi) {
  const status = await api.disablePushDevice(await radarPushDeviceId());
  await rememberRadarPushEnabled(false);
  await SecureStore.deleteItemAsync(PUSH_REVOCATION_TOKEN_KEY);
  await SecureStore.deleteItemAsync(PENDING_PUSH_REVOCATION_KEY);
  return status;
}

export async function refreshRadarPushIfEnabled(api: MobileApi) {
  if (await SecureStore.getItemAsync(PUSH_ENABLED_KEY) !== "1") return null;
  const status = await registerCurrentRadarPushToken(api, false);
  if (status && !status.enabled) await rememberRadarPushEnabled(false);
  return status;
}

export function watchRadarPushToken(api: MobileApi, onStatus?: PushStatusListener) {
  return Notifications.addPushTokenListener(() => {
    void refreshRadarPushIfEnabled(api)
      .then((status) => onStatus?.(status))
      .catch(() => onStatus?.(null));
  });
}

// Online device-only mitigation, NOT cross-account ownership or offline safety.
export async function signOutWithRadarPushDisabled(
  api: MobileApi,
  signOut: () => Promise<unknown>,
  timeoutMs = 5000,
  adapters: { fetcher?: typeof fetch } = {},
) {
  logoutInProgress = true;
  let timer: ReturnType<typeof setTimeout>;
  let expired = false;
  const revoke = async () => {
    await rememberRadarPushEnabled(false).catch(() => {});
    const id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id || expired) return false;
    const revocationToken = await SecureStore.getItemAsync(PUSH_REVOCATION_TOKEN_KEY);
    if (revocationToken) {
      await SecureStore.setItemAsync(PENDING_PUSH_REVOCATION_KEY, JSON.stringify({ deviceId: id, revocationToken }));
      if (await flushPendingPushRevocation(adapters.fetcher || fetch)) return true;
    }
    await api.disablePushDevice(id);
    if (expired) return false;
    const status = await api.getPushDeviceStatus(id, { fresh: true });
    if (status.currentDeviceRegistered === false) {
      await SecureStore.deleteItemAsync(PENDING_PUSH_REVOCATION_KEY);
      await SecureStore.deleteItemAsync(PUSH_REVOCATION_TOKEN_KEY);
      return true;
    }
    return false;
  };
  let pushDisabled = false;
  try {
    pushDisabled = await Promise.race([
      revoke().catch(() => false),
      new Promise<false>(resolve => { timer = setTimeout(() => { expired = true; resolve(false); }, timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer!);
    api.clearReadCache();
    void Notifications.dismissAllNotificationsAsync().catch(() => {});
    await signOut();
  }
  return { pushDisabled };
}
