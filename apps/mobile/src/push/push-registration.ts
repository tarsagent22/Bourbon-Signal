import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { createMobileApi } from "../api/client";

const DEVICE_ID_KEY = "bourbon-signal.push-device-id";

type MobileApi = ReturnType<typeof createMobileApi>;

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

export async function enableRadarPush(api: MobileApi) {
  if (!Device.isDevice) throw new Error("Push notifications require a physical device.");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("radar", {
      name: "Radar matches",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      sound: "default",
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Notification permission was not granted. Enable it in device settings to receive Radar alerts.");
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Push project configuration is unavailable.");
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceId = await radarPushDeviceId();
  return api.registerPushDevice({ deviceId, expoPushToken: token.data, platform: Platform.OS === "android" ? "android" : "ios" });
}

export async function disableRadarPush(api: MobileApi) {
  return api.disablePushDevice(await radarPushDeviceId());
}
