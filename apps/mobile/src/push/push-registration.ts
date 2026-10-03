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

type MobileApi = ReturnType<typeof createMobileApi> & { pushAccountId?: string };
type PushStatusListener = (status: PushDeviceStatus | null) => void;
let logoutInProgress = false;
const operations = new Map<string, Promise<PushDeviceStatus | null>>();
const statusListeners = new Map<PushStatusListener, string>();
const accountKey = (api: MobileApi) => api.pushAccountId || "legacy";
const intentKey = (api: MobileApi) => api.pushAccountId ? `${PUSH_ENABLED_KEY}.${api.pushAccountId}` : PUSH_ENABLED_KEY;
const tokenKey = (api: MobileApi) => `${intentKey(api)}.token`;
async function rememberIntent(api: MobileApi, enabled: boolean) {
  if (enabled && logoutInProgress) return;
  await SecureStore.setItemAsync(intentKey(api), enabled ? "1" : "0");
  await rememberRadarPushEnabled(enabled);
}
function serializePush(api: MobileApi, work: () => Promise<PushDeviceStatus | null>) {
  const key = accountKey(api);
  const previous = operations.get(key);
  const pending = (previous ? previous.catch(() => null) : Promise.resolve()).then(work);
  operations.set(key, pending);
  void pending.then(status => { if (status) statusListeners.forEach((account, listener) => { if (account === key) listener(status); }); }, () => {}).finally(() => { if (operations.get(key) === pending) operations.delete(key); });
  return pending;
}

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

let deviceIdLoad: Promise<string> | undefined;
export function radarPushDeviceId() {
  if (!deviceIdLoad) deviceIdLoad = loadRadarPushDeviceId().catch(error => { deviceIdLoad = undefined; throw error; });
  return deviceIdLoad;
}
async function loadRadarPushDeviceId() {
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

async function registerCurrentRadarPushToken(api: MobileApi, requestPermission: boolean, currentStatus?: PushDeviceStatus) {
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
  if (requestPermission) await rememberIntent(api, true);
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Push project configuration is unavailable.");
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceId = await radarPushDeviceId();
  if (logoutInProgress) return null;
  if (currentStatus?.enabled && currentStatus.currentDeviceRegistered && !currentStatus.warning && await SecureStore.getItemAsync(tokenKey(api)) === token.data) return currentStatus;
  if (!await flushPendingPushRevocation()) throw new Error("Previous push registration is still being disconnected.");
  if (logoutInProgress || await SecureStore.getItemAsync(intentKey(api)) !== "1") return null;
  const status = await api.registerPushDevice({ deviceId, expoPushToken: token.data, platform: Platform.OS === "android" ? "android" : "ios" });
  if (status.revocationToken) await SecureStore.setItemAsync(PUSH_REVOCATION_TOKEN_KEY, status.revocationToken);
  if (logoutInProgress) {
    if (status.revocationToken) {
      await SecureStore.setItemAsync(PENDING_PUSH_REVOCATION_KEY, JSON.stringify({ deviceId, revocationToken: status.revocationToken }));
      await flushPendingPushRevocation().catch(() => false);
    }
    return null;
  }
  if (status.enabled && !status.warning) await SecureStore.setItemAsync(tokenKey(api), token.data);
  return status;
}

export async function enableRadarPush(api: MobileApi) {
  logoutInProgress = false;
  const status = await serializePush(api, () => registerCurrentRadarPushToken(api, true));
  if (!status) throw new Error("Push notifications could not be enabled on this device.");
  return status;
}

export async function disableRadarPush(api: MobileApi) {
  await rememberIntent(api, false);
  const status = await serializePush(api, async () => {
    await rememberIntent(api, false);
    const saved = await api.disablePushDevice(await radarPushDeviceId());
    await SecureStore.deleteItemAsync(tokenKey(api));
    await SecureStore.deleteItemAsync(PUSH_REVOCATION_TOKEN_KEY);
    await SecureStore.deleteItemAsync(PENDING_PUSH_REVOCATION_KEY);
    return saved;
  });
  return status!;
}

export async function refreshRadarPushIfEnabled(api: MobileApi, knownStatus?: PushDeviceStatus) {
  if (logoutInProgress) return null;
  const existing = operations.get(accountKey(api));
  if (existing) return existing;
  return serializePush(api, async () => {
    if (logoutInProgress) return null;
    const current = knownStatus || await api.getPushDeviceStatus(await radarPushDeviceId(), { fresh: true });
    let intent = await SecureStore.getItemAsync(intentKey(api));
    // Migrate only an owned registration, never another account's local opt-in.
    if (intent == null && current.currentDeviceRegistered && !await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY)) {
      await rememberIntent(api, true);
      intent = "1";
    }
    if (intent !== "1") return current;
    return await registerCurrentRadarPushToken(api, false, current) || current;
  });
}

export function watchRadarPushToken(api: MobileApi, onStatus?: PushStatusListener) {
  if (onStatus) statusListeners.set(onStatus, accountKey(api));
  const subscription = Notifications.addPushTokenListener(() => {
    void refreshRadarPushIfEnabled(api).catch(() => {});
  });
  return { remove() { if (onStatus) statusListeners.delete(onStatus); subscription.remove(); } };
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
    await rememberIntent(api, false).catch(() => {});
    await operations.get(accountKey(api))?.catch(() => null);
    if (expired) return false;
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
