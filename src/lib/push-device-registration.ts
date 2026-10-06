import { disablePushDevice, enabledPushTokens, registerPushDevice, type PushDeviceRecord, type PushPlatform } from "./push-devices.ts";

export type PushDeviceErrorCode = "PUSH_PROFILE_LOAD_FAILED" | "PUSH_ENTITLEMENT_FAILED" | "PUSH_VALIDATION_FAILED" | "PUSH_DEVICE_WRITE_FAILED" | "PUSH_PREFERENCE_WRITE_FAILED";

export function pushDeviceErrorBody(code: PushDeviceErrorCode, message: string, requestId: string, retryable = false) {
  return { contractVersion: "bourbon-signal/api-error@1" as const, error: { code, message, requestId, retryable } };
}

export interface PushDeviceChangeInput {
  currentDevices: unknown;
  action: "register" | "disable";
  device: { deviceId: string; expoPushToken?: string; platform?: PushPlatform };
  now: string;
  writeAtomicDeviceAndPreference?: (devices: PushDeviceRecord[], enabled: boolean, projection: { status: "saved"; updatedAt: string }) => Promise<void>;
  writePrivateDevices?: (devices: PushDeviceRecord[], projection: { status: "pending"; updatedAt: string }) => Promise<void>;
  writePublicPushPreference?: (enabled: boolean) => Promise<void>;
  writeProjectionState?: (projection: { status: "saved"; updatedAt: string }) => Promise<void>;
}

export async function persistPushDeviceChange(input: PushDeviceChangeInput) {
  const devices = input.action === "register"
    ? registerPushDevice(input.currentDevices, {
      deviceId: input.device.deviceId,
      expoPushToken: input.device.expoPushToken || "",
      platform: input.device.platform === "android" ? "android" : "ios",
    }, input.now)
    : disablePushDevice(input.currentDevices, input.device.deviceId, input.now);
  const pushEnabled = enabledPushTokens(devices).length > 0;
  if(input.writeAtomicDeviceAndPreference){
    await input.writeAtomicDeviceAndPreference(devices,pushEnabled,{status:"saved",updatedAt:input.now});
    return {devices,pushEnabled,preferenceProjection:"saved" as const};
  }
  if(!input.writePrivateDevices || !input.writePublicPushPreference || !input.writeProjectionState)throw new Error("Push persistence adapters are unavailable.");
  await input.writePrivateDevices(devices, { status: "pending", updatedAt: input.now });
  let preferenceProjection: "saved" | "deferred" = "saved";
  try {
    await input.writePublicPushPreference(pushEnabled);
    await input.writeProjectionState({ status: "saved", updatedAt: input.now });
  } catch (error) {
    preferenceProjection = "deferred";
    console.warn("push preference projection deferred", error instanceof Error ? error.message : "unknown error");
  }
  return { devices, pushEnabled, preferenceProjection };
}

// Provider metadata is one atomic update. A rejected provider write must not
// rotate an otherwise valid installation binding. Explicit disable still wins.
export async function commitOwnedPushDeviceChange(input:{
  action:"register"|"disable";deviceId:string;devices:PushDeviceRecord[];bindingId:string;
  assertHeld:()=>Promise<void>;write:()=>Promise<void>;
  bind:(device:PushDeviceRecord,bindingId:string)=>Promise<void>;disable:()=>Promise<void>;
}) {
  await input.assertHeld();
  const target=input.devices.find(device=>device.deviceId===input.deviceId);
  if(input.action === "register"){
    if(!target)throw new Error("Push device registration is unavailable.");
    target.bindingId=input.bindingId;
    await input.write();
    await input.assertHeld();
    await input.bind(target,input.bindingId);
    return input.bindingId;
  }
  await input.disable();
  await input.assertHeld();
  await input.write();
  return undefined;
}
