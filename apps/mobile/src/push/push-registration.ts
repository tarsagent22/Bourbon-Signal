import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { PushDeviceStatus } from "../api/types";
import type { createMobileApi } from "../api/client";

const DEVICE_ID_KEY = "bourbon-signal.push-device-id";
export const PUSH_ENABLED_KEY = "bourbon-signal.push-enabled";

type MobileApi = ReturnType<typeof createMobileApi>;
type PushStatusListener = (status: PushDeviceStatus | null) => void;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
  return api.registerPushDevice({ deviceId, expoPushToken: token.data, platform: Platform.OS === "android" ? "android" : "ios" });
}

export async function enableRadarPush(api: MobileApi) {
  const status = await registerCurrentRadarPushToken(api, true);
  if (!status) throw new Error("Push notifications could not be enabled on this device.");
  await rememberRadarPushEnabled(status.enabled);
  return status;
}

export async function disableRadarPush(api: MobileApi) {
  const status = await api.disablePushDevice(await radarPushDeviceId());
  await rememberRadarPushEnabled(false);
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
