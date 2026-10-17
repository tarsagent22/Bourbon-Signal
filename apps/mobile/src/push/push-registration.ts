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

type MobileApi = ReturnType<typeof createMobileApi> & { pushAccountId?: string; accountIdentity?: string };
type PushStatusListener = (status: PushDeviceStatus | null) => void;
let logoutInProgress = false;
let activePushApi: MobileApi | undefined;
const signedOutApis = new WeakSet<MobileApi>();
const operations = new Map<MobileApi, Promise<PushDeviceStatus | null>>();
const statusListeners = new Map<PushStatusListener, MobileApi>();
const recoveryRetryAfter = new WeakMap<MobileApi,number>();
// The provider owns this API instance. A remount must not reuse work from its predecessor.
const operationKey = (api: MobileApi) => api;
const sessionActive = (api: MobileApi) => !logoutInProgress && !signedOutApis.has(api) && (!activePushApi || activePushApi === api);
// Called only when the authenticated app mounts with its current session API.
export function beginRadarPushSession(api: MobileApi) {
  if (!api.pushAccountId || signedOutApis.has(api)) return false;
  activePushApi = api;
  logoutInProgress = false;
  recoveryRetryAfter.delete(operationKey(api));
  return true;
}
const intentKey = (api: MobileApi) => api.pushAccountId ? `${PUSH_ENABLED_KEY}.${api.pushAccountId}` : PUSH_ENABLED_KEY;
const tokenKey = (api: MobileApi) => `${intentKey(api)}.token`;
async function rememberIntent(api: MobileApi, enabled: boolean) {
  if (enabled && !sessionActive(api)) return;
  await SecureStore.setItemAsync(intentKey(api), enabled ? "1" : "0");
  await rememberRadarPushEnabled(enabled);
}
function serializePush(api: MobileApi, work: () => Promise<PushDeviceStatus | null>) {
  const key = operationKey(api);
  const previous = operations.get(key);
  const pending = (previous ? previous.catch(() => null) : Promise.resolve()).then(work);
  operations.set(key, pending);
  void pending.then(status => { if (status && sessionActive(api)) statusListeners.forEach((account, listener) => { if (account === key) listener(status); }); }, () => {}).finally(() => { if (operations.get(key) === pending) operations.delete(key); });
  return pending;
}

type PendingPushRevocation = { deviceId: string; revocationToken: string };
let revocationStore: Promise<unknown> = Promise.resolve();
function withRevocationStore<T>(work: () => Promise<T>): Promise<T> {
  const pending = revocationStore.then(work, work);
  revocationStore = pending.catch(() => undefined);
  return pending;
}
function pendingRevocations(raw: string | null): PendingPushRevocation[] {
  if (!raw) return [];
  try { const value = JSON.parse(raw); return (Array.isArray(value) ? value : [value]).filter(item => item && typeof item.deviceId === 'string' && item.deviceId && typeof item.revocationToken === 'string' && item.revocationToken); }
  catch { return []; }
}
async function writePendingRevocations(items: PendingPushRevocation[]) {
  if (!items.length) await SecureStore.deleteItemAsync(PENDING_PUSH_REVOCATION_KEY);
  else await SecureStore.setItemAsync(PENDING_PUSH_REVOCATION_KEY, JSON.stringify(items.length === 1 ? items[0] : items));
}
async function queuePushRevocation(item: PendingPushRevocation) {
  await withRevocationStore(async () => {
    const pending = pendingRevocations(await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY));
    if (!pending.some(value => value.revocationToken === item.revocationToken)) pending.push(item);
    await writePendingRevocations(pending);
  });
}
async function discardStaleRegistration(deviceId: string, status: PushDeviceStatus) {
  if (!status.revocationToken) return;
  await queuePushRevocation({ deviceId, revocationToken: status.revocationToken });
  await flushPendingPushRevocation().catch(() => false);
  const current = activePushApi;
  if (current && sessionActive(current)) {
    // A late server registration may have displaced this installation's new
    // owner. Recheck after its current operation settles, still respecting Off.
    void Promise.resolve(operations.get(operationKey(current))).catch(() => null).then(async () => {
      await Promise.resolve();
      if (sessionActive(current)) await refreshRadarPushIfEnabled(current);
    }).catch(() => undefined);
  }
}

function pushRevocationUrl() {
  const base = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || "https://www.bourbonsignal.com";
  return `${String(base).replace(/\/+$/, "")}/api/v1/push-revocations`;
}

export async function flushPendingPushRevocation(fetcher: typeof fetch = fetch) {
  const raw = await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY);
  if (!raw) return true;
  const items = pendingRevocations(raw);
  if (!items.length) { await withRevocationStore(async () => { if (await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY) === raw) await SecureStore.deleteItemAsync(PENDING_PUSH_REVOCATION_KEY); }); return true; }
  let complete = true;
  for (const pending of items) try {
    const response = await fetcher(pushRevocationUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    });
    const body = await response.json().catch(() => ({})) as { ok?: boolean };
    if (!response.ok || body.ok !== true) { complete = false; continue; }
    await withRevocationStore(async () => {
      await writePendingRevocations(pendingRevocations(await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY)).filter(item => item.revocationToken !== pending.revocationToken));
      if (await SecureStore.getItemAsync(PUSH_REVOCATION_TOKEN_KEY) === pending.revocationToken) await SecureStore.deleteItemAsync(PUSH_REVOCATION_TOKEN_KEY);
    });
  } catch {
    complete = false;
  }
  return complete && !await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY);
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
  if (!sessionActive(api)) return null;
  // Google Play Android emulators support FCM. Let the native token provider
  // determine availability instead of rejecting them before registration.
  if (!Device.isDevice && Platform.OS !== "android") {
    if (requestPermission) throw new Error("Push notifications require a physical device.");
    return null;
  }
  await configureAndroidRadarChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (!sessionActive(api)) return null;
  if (requestPermission && permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
  if (!sessionActive(api)) return null;
  if (permission.status !== "granted") {
    if (requestPermission) throw new Error("Notification permission was not granted. Enable it in device settings to receive Radar alerts.");
    return null;
  }
  if (requestPermission) await rememberIntent(api, true);
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Push project configuration is unavailable.");
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceId = await radarPushDeviceId();
  if (!sessionActive(api)) return null;
  const hadPendingRevocation = Boolean(await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY));
  if (!hadPendingRevocation && currentStatus?.enabled && currentStatus.currentDeviceRegistered && !currentStatus.warning && await SecureStore.getItemAsync(tokenKey(api)) === token.data) return currentStatus;
  if (!await flushPendingPushRevocation()) throw new Error("Previous push registration is still being disconnected.");
  if (!sessionActive(api) || await SecureStore.getItemAsync(intentKey(api)) !== "1") return null;
  const status = await api.registerPushDevice({ deviceId, expoPushToken: token.data, platform: Platform.OS === "android" ? "android" : "ios" });
  if (!sessionActive(api)) {
    await discardStaleRegistration(deviceId, status);
    return null;
  }
  if (status.revocationToken) await withRevocationStore(async () => { if (sessionActive(api)) await SecureStore.setItemAsync(PUSH_REVOCATION_TOKEN_KEY, status.revocationToken!); });
  if (!sessionActive(api)) { await discardStaleRegistration(deviceId, status); return null; }
  if (status.enabled && !status.warning) await SecureStore.setItemAsync(tokenKey(api), token.data);
  if (!sessionActive(api)) { await discardStaleRegistration(deviceId, status); return null; }
  return status;
}

export async function enableRadarPush(api: MobileApi) {
  if (!sessionActive(api)) throw new Error("Sign in again before enabling push notifications.");
  recoveryRetryAfter.delete(operationKey(api));
  const status = await serializePush(api, () => registerCurrentRadarPushToken(api, true));
  if (!status) throw new Error("Push notifications could not be enabled on this device.");
  return status;
}

export async function disableRadarPush(api: MobileApi) {
  if (!sessionActive(api)) throw new Error("The account changed. Reopen notification preferences.");
  recoveryRetryAfter.delete(operationKey(api));
  await rememberIntent(api, false);
  const status = await serializePush(api, async () => {
    if (!sessionActive(api)) return null;
    await rememberIntent(api, false);
    const saved = await api.disablePushDevice(await radarPushDeviceId());
    await SecureStore.deleteItemAsync(tokenKey(api));
    if (sessionActive(api)) await withRevocationStore(async () => {
      if (sessionActive(api)) await SecureStore.deleteItemAsync(PUSH_REVOCATION_TOKEN_KEY);
    });
    return saved;
  });
  return status!;
}

export async function refreshRadarPushIfEnabled(api: MobileApi, knownStatus?: PushDeviceStatus) {
  if (!sessionActive(api)) return null;
  const existing = operations.get(operationKey(api));
  if (existing) return existing;
  return serializePush(api, async () => {
    if (!sessionActive(api)) return null;
    const current = knownStatus || await api.getPushDeviceStatus(await radarPushDeviceId(), { fresh: true });
    if (!sessionActive(api)) return null;
    let intent = await SecureStore.getItemAsync(intentKey(api));
    // Migrate only an owned registration, never another account's local opt-in.
    if (intent == null && current.currentDeviceRegistered && !await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY)) {
      await rememberIntent(api, true);
      intent = "1";
    }
    if (intent !== "1") return current;
    if(Date.now() < (recoveryRetryAfter.get(operationKey(api)) || 0))return current;
    try {
      const result=await registerCurrentRadarPushToken(api, false, current) || current;
      if(result.enabled)recoveryRetryAfter.delete(operationKey(api));
      else recoveryRetryAfter.set(operationKey(api),Date.now()+60_000);
      return result;
    } catch(caught){recoveryRetryAfter.set(operationKey(api),Date.now()+60_000);throw caught;}
  });
}

export function watchRadarPushToken(api: MobileApi, onStatus?: PushStatusListener) {
  if (onStatus) statusListeners.set(onStatus, operationKey(api));
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
  signedOutApis.add(api);
  let timer: ReturnType<typeof setTimeout>;
  let expired = false;
  const revoke = async () => {
    // Disconnect delivery without converting this account's saved opt-in into a manual Off.
    await rememberRadarPushEnabled(false).catch(() => {});
    await operations.get(operationKey(api))?.catch(() => null);
    if (expired) return false;
    const id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id || expired) return false;
    const revocationToken = await SecureStore.getItemAsync(PUSH_REVOCATION_TOKEN_KEY);
    if (expired) return false;
    if (revocationToken) {
      await queuePushRevocation({ deviceId: id, revocationToken });
      if (await flushPendingPushRevocation(adapters.fetcher || fetch)) return true;
      // Keep the binding-specific revoke queued; a broad delayed disable could
      // otherwise disconnect a newer login on this same installation.
      return false;
    }
    await api.disablePushDevice(id);
    if (expired) return false;
    const status = await api.getPushDeviceStatus(id, { fresh: true });
    if (status.currentDeviceRegistered === false) {
      await withRevocationStore(async () => {
        if (revocationToken) await writePendingRevocations(pendingRevocations(await SecureStore.getItemAsync(PENDING_PUSH_REVOCATION_KEY)).filter(item => item.revocationToken !== revocationToken));
        if (await SecureStore.getItemAsync(PUSH_REVOCATION_TOKEN_KEY) === revocationToken) await SecureStore.deleteItemAsync(PUSH_REVOCATION_TOKEN_KEY);
      });
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
