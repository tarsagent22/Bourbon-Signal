import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { CameraView as CameraViewType } from 'expo-camera';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { createLabelIndex, matchBottleLabel, normalizeBarcode, VERIFIED_BOTTLE_BARCODES } from './label-matching';
import { createScanLoop } from './scan-loop';
import type { ScannerProps } from './scanner-types';
import { colors } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Keep search and profiles usable in a binary that predates the scanner modules.
const cameraAvailable = Boolean(requireOptionalNativeModule('ExpoCamera'));
const textRecognition = requireOptionalNativeModule<{ recognizeText: (uri: string) => Promise<{ text: string }> }>('BottleLabelReader');
const cameraLibrary: typeof import('expo-camera') | null = cameraAvailable ? require('expo-camera') : null;

export function NativeBottleScanner(props: ScannerProps) {
  if (!cameraLibrary || !textRecognition) return <View style={s.fallback}><Text style={s.copy}>Live scanning needs the updated app build. You can still search by name below.</Text></View>;
  return <LiveCamera {...props} />;
}

function LiveCamera({ active, catalog, onMatches }: ScannerProps) {
  const CameraView = cameraLibrary!.CameraView;
  const [permission, requestPermission] = cameraLibrary!.useCameraPermissions();
  const camera = useRef<CameraViewType>(null);
  const [ready, setReady] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [torch, setTorch] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const current = useRef({ catalog, onMatches }); current.current = { catalog, onMatches };
  const index = useMemo(() => createLabelIndex(catalog), [catalog]);
  const lastBarcode = useRef('');
  const capturing = useRef(false);

  useEffect(() => { const listener = AppState.addEventListener('change', state => { setForeground(state === 'active'); if (state !== 'active') setTorch(false); }); return () => listener.remove(); }, []);
  const cameraActive = active && foreground && permission?.granted && !failed;
  useEffect(() => { if (!cameraActive) { setReady(false); setTorch(false); } }, [cameraActive]);
  useEffect(() => {
    if (!cameraActive || !ready) return;
    let failures = 0; let emptyReads = 0;
    const loop = createScanLoop({
      read: async () => {
        if (capturing.current) return null;
        capturing.current = true;
        let original: string | undefined, cropped: string | undefined;
        try {
          const picture = await camera.current?.takePictureAsync({ quality: 0.65, shutterSound: false });
          if (!picture) throw new Error('Camera is not ready');
          original = picture.uri;
          // Read the center label rather than background bottles. Temporary frames never enter the photo library.
          const frame = await manipulateAsync(picture.uri, [{ crop: { originX: Math.floor(picture.width * 0.15), originY: Math.floor(picture.height * 0.2), width: Math.floor(picture.width * 0.7), height: Math.floor(picture.height * 0.6) } }, { resize: { width: 1000 } }], { compress: 0.8, format: SaveFormat.JPEG });
          cropped = frame.uri;
          const result = await textRecognition!.recognizeText(frame.uri);
          return matchBottleLabel(index, result.text);
        } finally {
          capturing.current = false;
          for (const uri of [original, cropped]) if (uri) { try { new File(uri).delete(); } catch { /* Cache cleanup must not interrupt recovery. */ } }
        }
      },
      onResult: matches => { if (!matches) return; failures = 0; current.current.onMatches(matches); emptyReads = matches.length ? 0 : emptyReads + 1; setMessage(matches.length ? 'Choose a match below' : emptyReads >= 4 ? 'Try more light or move closer' : ''); },
      onError: () => { failures += 1; if (failures >= 3) { setFailed(true); setMessage('Label reading paused. Try again or search by name.'); } },
    });
    loop.start(); return () => loop.stop();
  }, [cameraActive, ready, index, retry]);

  if (!permission?.granted) return <View style={s.fallback}><Text style={s.copy}>Use your camera to read a bottle label. Label reading stays on your device.</Text><Pressable accessibilityRole="button" onPress={() => void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())} style={s.button}><Text style={s.buttonText}>{permission?.canAskAgain === false ? 'Open camera settings' : 'Enable camera'}</Text></Pressable></View>;
  return <View style={s.frame}>
    {cameraActive ? <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" animateShutter={false} enableTorch={torch} onCameraReady={() => setReady(true)} onMountError={() => { setFailed(true); setMessage('The camera couldn’t start. Try again or search by name.'); }} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a'] }} onBarcodeScanned={result => {
      const code = normalizeBarcode(result.data);
      if (!code || code === lastBarcode.current) return;
      lastBarcode.current = code;
      const id = VERIFIED_BOTTLE_BARCODES[code];
      const bottle = id ? current.current.catalog.find(item => item.id === id) : null;
      if (bottle) current.current.onMatches([bottle]);
      else setMessage('Barcode read · turn to the front label to find a match');
    }} /> : null}
    <View pointerEvents="none" style={s.guide}><View style={s.bracket} /></View>
    <View style={s.top}><View accessible accessibilityLabel={cameraActive ? 'Camera scanning' : 'Camera paused'} style={[s.statusDot, { backgroundColor: cameraActive ? '#AAD1AB' : colors.muted }]} /><Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'} accessibilityState={{ selected: torch }} onPress={() => setTorch(value => !value)} style={s.torch}><MaterialCommunityIcons name={torch ? 'flashlight' : 'flashlight-off'} color="#fff" size={22} /></Pressable></View>
    <View style={s.bottom}>{message ? <Text accessibilityLiveRegion="polite" style={s.overlayCopy}>{message}</Text> : null}{failed ? <Pressable accessibilityRole="button" onPress={() => { setReady(false); setFailed(false); setRetry(value => value + 1); }} style={s.button}><Text style={s.buttonText}>Try camera again</Text></Pressable> : null}</View>
  </View>;
}
const s = StyleSheet.create({ frame: { height: 360, borderRadius: 26, overflow: 'hidden', backgroundColor: '#171411' }, guide: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }, bracket: { width: '70%', height: '60%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)', borderRadius: 18 }, top: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, statusDot: { width: 8, height: 8, borderRadius: 4, margin: 12 }, badge: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', fontSize: 10, letterSpacing: 1.4, fontWeight: '700', padding: 10, borderRadius: 12 }, torch: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, paddingHorizontal: 14 }, light: { color: '#fff', fontSize: 13 }, bottom: { position: 'absolute', bottom: 16, left: 16, right: 16, gap: 8 }, overlayCopy: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.7)', textAlign: 'center', fontSize: 13, lineHeight: 19, padding: 12, borderRadius: 12 }, fallback: { minHeight: 220, padding: 28, gap: 18, backgroundColor: colors.surface, borderRadius: 24, justifyContent: 'center' }, copy: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center' }, button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.accent }, buttonText: { color: colors.background, fontSize: 14, fontWeight: '700' } });
