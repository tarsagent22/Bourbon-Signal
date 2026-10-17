import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { CameraView as CameraViewType } from 'expo-camera';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { createLabelIndex, readBottleLabel, normalizeBarcode, VERIFIED_BOTTLE_BARCODES } from './label-matching';
import { createScanLoop } from './scan-loop';
import { scanCrop, scanGuide } from './scan-guide';
import { createCandidateLatch } from './scan-candidates';
import { labelPictureSize, LABEL_FRAME_DELAY_MS } from './capture-settings';
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
  const [pictureSize, setPictureSize] = useState<string>();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [torch, setTorch] = useState(false);
  const [message, setMessage] = useState('Reading label…');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState({ width: 320, height: 380 });
  const viewRef = useRef(view); viewRef.current = view;
  const guide = scanGuide(view);
  const candidates = useRef(createCandidateLatch());
  const lastMatches = useRef('');
  const stopped = useRef(false);
  const [family, setFamily] = useState<ReturnType<typeof readBottleLabel>['family']>();
  const [locked, setLocked] = useState(false);
  const publishMatches = (matches: Parameters<ScannerProps['onMatches']>[0]) => {
    const identity = matches.map(bottle => bottle.id).join('|');
    if (!matches.length || identity === lastMatches.current) return;
    lastMatches.current = identity; current.current.onMatches(matches);
  };
  const holdMatches = (matches: Parameters<ScannerProps['onMatches']>[0], verified = false, canHold = true) => {
    if (stopped.current) return;
    publishMatches(matches);
    const stable = verified ? candidates.current.verified(matches) : candidates.current.observe(matches, canHold);
    if (!stable) return;
    stopped.current = true; setLocked(true); setTorch(false); setMessage('Matches saved below');
  };
  const current = useRef({ catalog, onMatches }); current.current = { catalog, onMatches };
  const index = useMemo(() => createLabelIndex(catalog), [catalog]);
  const lastBarcode = useRef('');
  const capturing = useRef(false);

  useEffect(() => { const listener = AppState.addEventListener('change', state => { setForeground(state === 'active'); if (state !== 'active') setTorch(false); }); return () => listener.remove(); }, []);
  const cameraActive = active && foreground && permission?.granted && !failed && !locked;
  useEffect(() => { if (!cameraActive) { setReady(false); setTorch(false); } }, [cameraActive]);
  useEffect(() => {
    if (!cameraActive || !ready || locked) return;
    let failures = 0; let emptyReads = 0;
    const loop = createScanLoop({
      delay: LABEL_FRAME_DELAY_MS,
      read: async () => {
        if (capturing.current) return null;
        capturing.current = true;
        let original: string | undefined, cropped: string | undefined;
        try {
          const picture = await camera.current?.takePictureAsync({ quality: 0.85, shutterSound: false });
          if (!picture) throw new Error('Camera is not ready');
          original = picture.uri;
          // Read the center label rather than background bottles. Temporary frames never enter the photo library.
          const frame = await manipulateAsync(picture.uri, [{ crop: scanCrop(picture, viewRef.current, true) }, { resize: { width: 1200 } }], { compress: 0.9, format: SaveFormat.JPEG });
          cropped = frame.uri;
          const result = await textRecognition!.recognizeText(frame.uri);
          return readBottleLabel(index, result.text);
        } finally {
          capturing.current = false;
          for (const uri of [original, cropped]) if (uri) { try { new File(uri).delete(); } catch { /* Cache cleanup must not interrupt recovery. */ } }
        }
      },
      onResult: result => {
        if (!result || stopped.current) return;
        const { matches, family, canHold, hasText } = result;
        failures = 0; emptyReads = matches.length ? 0 : emptyReads + 1;
        if (family) setFamily(family);
        setMessage(matches.length ? 'Possible bottles below · reading expression…' : lastMatches.current ? 'Possible bottles below · keep the label steady' : emptyReads >= 2
          ? hasText ? 'Label text read · no catalog match yet. Search by name.' : 'No label text read yet · keep the front label in view.' : 'Reading label…');
        holdMatches(matches, false, canHold);
      },
      onError: () => { failures += 1; if (failures >= 3) { setFailed(true); setMessage('Label reading paused. Try again or search by name.'); } },
    });
    loop.start(); return () => loop.stop();
  }, [cameraActive, ready, index, retry, locked]);

  if (!permission?.granted) return <View style={s.fallback}><Text style={s.copy}>Use your camera to read a bottle label. Label reading stays on your device.</Text><Pressable accessibilityRole="button" onPress={() => void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())} style={s.button}><Text style={s.buttonText}>{permission?.canAskAgain === false ? 'Open camera settings' : 'Enable camera'}</Text></Pressable></View>;
  return <View style={{ gap: 8 }}><View testID="bottle-scanner-frame" style={s.frame} onLayout={event => { const { width, height } = event.nativeEvent.layout; if (width > 0 && height > 0) setView({ width, height }); }}>
    {cameraActive ? <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" pictureSize={pictureSize} animateShutter={false} enableTorch={torch} onCameraReady={async () => {
      const opened = camera.current;
      try {
        const sizes = await opened?.getAvailablePictureSizesAsync();
        if (opened && camera.current === opened) setPictureSize(labelPictureSize(sizes || []));
      } catch { /* Unsupported size discovery retains the platform default. */ }
      if (opened && camera.current === opened) setReady(true);
    }} onMountError={() => { setFailed(true); setMessage('The camera couldn’t start. Try again or search by name.'); }} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a'] }} onBarcodeScanned={result => {
      const code = normalizeBarcode(result.data);
      if (locked || !code || code === lastBarcode.current) return;
      lastBarcode.current = code;
      const id = VERIFIED_BOTTLE_BARCODES[code];
      const bottle = id ? current.current.catalog.find(item => item.id === id) : null;
      if (bottle) holdMatches([bottle], true);
      else setMessage('Barcode read · turn to the front label to find a match');
    }} /> : null}
    <View pointerEvents="none" style={s.guide}><View testID="bottle-label-scan-guide" style={[s.bracket, { position: 'absolute', left: guide.left, top: guide.top, width: guide.width, height: guide.height }]} /></View>
    <View style={s.top}><View accessible accessibilityLabel={locked ? 'Scan results saved' : cameraActive ? 'Camera scanning' : 'Camera paused'} style={[s.statusDot, { backgroundColor: cameraActive && !locked ? '#AAD1AB' : colors.muted }]} /><Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'} accessibilityState={{ selected: torch }} onPress={() => setTorch(value => !value)} style={s.torch}><MaterialCommunityIcons name={torch ? 'flashlight' : 'flashlight-off'} color="#fff" size={22} /></Pressable></View>
    <View style={s.bottom}>{message ? <Text accessibilityLiveRegion="polite" style={s.overlayCopy}>{message}</Text> : null}{failed ? <Pressable accessibilityRole="button" onPress={() => { setReady(false); setFailed(false); setRetry(value => value + 1); }} style={s.button}><Text style={s.buttonText}>Try camera again</Text></Pressable> : null}</View>
  </View>{family ? <Pressable accessibilityRole="button" accessibilityLabel={`Show all ${family.name} expressions`} onPress={() => {
    stopped.current = true; setLocked(true); setTorch(false); setMessage('Choose your expression below');
    publishMatches([...family.bottles].sort((a, b) => a.name.localeCompare(b.name)));
  }} style={familyStyles.button}><Text style={familyStyles.text}>Show all {family.name} expressions ({family.bottles.length})</Text></Pressable> : null}</View>;
}
const familyStyles = StyleSheet.create({ button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, text: { color: colors.accent, fontSize: 14, lineHeight: 21, textAlign: 'center' } });
const s = StyleSheet.create({ frame: { height: 380, borderRadius: 26, overflow: 'hidden', backgroundColor: '#171411' }, guide: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }, bracket: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)', borderRadius: 18 }, top: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, statusDot: { width: 8, height: 8, borderRadius: 4, margin: 12 }, badge: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', fontSize: 10, letterSpacing: 1.4, fontWeight: '700', padding: 10, borderRadius: 12 }, torch: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, paddingHorizontal: 14 }, light: { color: '#fff', fontSize: 13 }, bottom: { position: 'absolute', bottom: 16, left: 16, right: 16, gap: 8 }, overlayCopy: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.7)', textAlign: 'center', fontSize: 13, lineHeight: 19, padding: 12, borderRadius: 12 }, fallback: { minHeight: 220, padding: 28, gap: 18, backgroundColor: colors.surface, borderRadius: 24, justifyContent: 'center' }, copy: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center' }, button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.accent }, buttonText: { color: colors.background, fontSize: 14, fontWeight: '700' } });
