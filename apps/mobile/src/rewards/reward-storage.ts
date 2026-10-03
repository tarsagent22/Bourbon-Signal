import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const keyFor = (userId: string, kind: string) =>
  `bs.rewards.${kind}.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
export async function readRewardValue(userId: string, kind: string) {
  const key = keyFor(userId, kind);
  return Platform.OS === "web"
    ? globalThis.localStorage?.getItem(key) || null
    : SecureStore.getItemAsync(key);
}
export async function saveRewardValue(
  userId: string,
  kind: string,
  value: string | null,
) {
  const key = keyFor(userId, kind);
  if (Platform.OS === "web") {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } else if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
