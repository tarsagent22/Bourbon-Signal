// Native scanner behavior fixture. This simulates camera/OCR boundaries, never hardware acceptance.
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { View, Text } from 'react-native';
declare global { interface Window { scannerText?: string; scannerReads?: number; scannerCrop?: unknown } }
export function requireOptionalNativeModule(name: string) {
  return name === 'BottleLabelReader' ? { async recognizeText() { window.scannerReads = (window.scannerReads || 0) + 1; return { text: window.scannerText || '' }; } } : {};
}
export function useCameraPermissions() { return [{ granted: true }, async () => ({ granted: true })] as const; }
export const CameraView = forwardRef(function FixtureCamera({ style, onCameraReady }: any, ref) {
  useImperativeHandle(ref, () => ({ async takePictureAsync() { return { uri: 'fixture://frame', width: 3024, height: 4032 }; } }));
  useEffect(() => { onCameraReady(); }, []);
  return <View style={[style, { backgroundColor: '#39332B', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#D6CAB8', fontSize: 10 }}>SIMULATED CAMERA / OCR</Text></View>;
});
export class File { constructor(_uri: string) {} delete() {} }
export const SaveFormat = { JPEG: 'jpeg' };
export async function manipulateAsync(_uri: string, actions: unknown[]) { window.scannerCrop = actions[0]; return { uri: 'fixture://crop' }; }
