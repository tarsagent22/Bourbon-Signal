import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createLabelIndex } from './label-matching';
import { createLiveLabelSession, type LabelFrame, type LiveScanResult } from './live-label-session';
import { scanGuide } from './scan-guide';
import type { ScannerProps } from './scanner-types';
import { colors } from '../theme';

const reader = requireOptionalNativeModule<{ liveFramesVersion?: number }>('BottleLabelReader');
const cameraAvailable = Boolean(requireOptionalNativeModule('ExpoCamera'));
const cameraLibrary: typeof import('expo-camera') | null = cameraAvailable ? require('expo-camera') : null;
interface NativeCameraProps extends ViewProps {
  active: boolean; scanning: boolean; torch: boolean; scanToken: number;
  onFrame: (event: { nativeEvent: LabelFrame }) => void;
  onStatus: (event: { nativeEvent: { state: string; code?: string; scanToken: number } }) => void;
}
let nextScanToken = 0;
const LabelCamera = reader?.liveFramesVersion === 1 ? memo(requireNativeView<NativeCameraProps>('BottleLabelReader')) : null;
// Enough for several native OCR passes, with a fixed end if a read stalls.
const READ_WINDOW_MS = 1650;
const AIM = 'Center the front label in the frame.';

export function NativeBottleScanner(props: ScannerProps) {
  if (!cameraLibrary || !LabelCamera) return <View style={s.fallback}><Text style={s.copy}>Live scanning needs the updated app build. You can still search by name.</Text></View>;
  return <LiveCamera {...props} />;
}

function LiveCamera({ active, catalog, onMatches, session = 0, onMetrics }: ScannerProps) {
  const NativeCamera = LabelCamera!;
  const [permission, requestPermission] = cameraLibrary!.useCameraPermissions();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [phase, setPhase] = useState<'aim' | 'reading' | 'finished' | 'failed'>('aim');
  const [torch, setTorch] = useState(false);
  const [retry, setRetry] = useState(0);
  const [token, setToken] = useState(() => ++nextScanToken);
  const [message, setMessage] = useState(AIM);
  const [view, setView] = useState({ width: 320, height: 380 });
  const [family, setFamily] = useState<LiveScanResult['family']>();
  const current = useRef({ onMatches, onMetrics, view });
  current.current = { onMatches, onMetrics, view };
  const enabled = active && foreground && Boolean(permission?.granted) && phase !== 'failed';
  const burst = useRef<{
    token: number;
    tracker: ReturnType<typeof createLiveLabelSession>;
    result?: LiveScanResult;
    timer: ReturnType<typeof setTimeout>;
    failures: number;
  } | null>(null);

  const cancelRead = useCallback(() => {
    if (!burst.current) return;
    clearTimeout(burst.current.timer);
    burst.current = null;
  }, []);

  const finishRead = useCallback(() => {
    const read = burst.current;
    if (!read) return;
    cancelRead();
    const result = read.result;
    const matches = result?.matches ?? [];
    setTorch(false);
    setFamily(result?.family);
    setPhase('finished');
    setMessage(matches.length ? 'Choose your bottle below.'
      : result?.hasText ? 'No match yet. Try the front label or search by name.'
      : 'Move closer or tilt the bottle to reduce glare.');
    current.current.onMatches(matches);
    if (result) current.current.onMetrics?.(result.metrics);
  }, [cancelRead]);

  const startRead = () => {
    if (!enabled || burst.current) return;
    const scanToken = ++nextScanToken;
    const tracker = createLiveLabelSession(createLabelIndex(catalog), performance.now());
    burst.current = { token: scanToken, tracker, failures: 0, timer: setTimeout(finishRead, READ_WINDOW_MS) };
    setToken(scanToken);
    setFamily(undefined);
    current.current.onMatches([]);
    setPhase('reading');
    setMessage('Hold steady…');
  };

  const onFrame = useCallback(({ nativeEvent }: { nativeEvent: LabelFrame }) => {
    const read = burst.current;
    if (!read || nativeEvent.scanToken !== read.token) return;
    const result = read.tracker.observe(nativeEvent, current.current.view, performance.now());
    if (!result) return;
    read.failures = 0;
    read.result = result;
    if (result.phase === 'ready') finishRead();
  }, [finishRead]);

  const onStatus = useCallback(({ nativeEvent }: { nativeEvent: { state: string; code?: string; scanToken: number } }) => {
    if (nativeEvent.scanToken !== token || nativeEvent.state !== 'error') return;
    if (nativeEvent.code === 'LABEL_ANALYSIS_FAILED') {
      const read = burst.current;
      if (!read || ++read.failures < 3) return;
      finishRead();
      return;
    }
    cancelRead();
    setTorch(false);
    setPhase('failed');
    setMessage('The camera couldn’t open. Try again or search by name.');
  }, [token, cancelRead, finishRead]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') cancelRead();
      setForeground(state === 'active');
    });
    return () => { cancelRead(); subscription.remove(); };
  }, [cancelRead]);
  useLayoutEffect(() => {
    cancelRead();
    setTorch(false);
    setFamily(undefined);
    setPhase('aim');
    setMessage(AIM);
    current.current.onMatches([]);
    return cancelRead;
  }, [session, cancelRead]);
  useLayoutEffect(() => {
    if (enabled || phase === 'failed') return;
    cancelRead();
    setTorch(false);
    if (phase === 'reading') {
      setPhase('aim');
      setMessage(AIM);
      setToken(++nextScanToken);
    }
  }, [enabled, phase, cancelRead]);
  const guide = scanGuide(view);
  if (!permission?.granted) return <View style={s.fallback}>
    <Text style={s.copy}>Use your camera to read a bottle label. Label reading stays on your device.</Text>
    <Pressable accessibilityRole="button" onPress={() => void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())} style={s.button}>
      <Text style={s.buttonText}>{permission?.canAskAgain === false ? 'Open camera settings' : 'Enable camera'}</Text>
    </Pressable>
  </View>;
  return <View style={s.container}>
    <View testID="bottle-scanner-frame" style={s.frame} onLayout={event => {
      const { width, height } = event.nativeEvent.layout;
      if (width > 0 && height > 0) setView(previous => previous.width === width && previous.height === height ? previous : { width, height });
    }}>
      <NativeCamera key={retry} style={StyleSheet.absoluteFill} active={enabled} scanning={enabled && phase === 'reading'} torch={enabled && torch} scanToken={token}
        onFrame={onFrame} onStatus={onStatus} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}><View testID="bottle-label-scan-guide" style={[s.bracket, { left: guide.left, top: guide.top, width: guide.width, height: guide.height }]} /></View>
      <View style={s.top}>
        <Pressable accessibilityRole="button" disabled={!enabled} accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'} accessibilityState={{ selected: torch, disabled: !enabled }} onPress={() => setTorch(value => !value)} style={s.torch}>
          <MaterialCommunityIcons name={torch ? 'flashlight' : 'flashlight-off'} color="#fff" size={22} />
        </Pressable>
      </View>
    </View>
    <View style={s.controls}>
        <Text accessibilityLiveRegion="polite" style={s.overlay}>{message}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ busy: phase === 'reading', disabled: phase === 'reading' || (!enabled && phase !== 'failed') }}
          disabled={phase === 'reading' || (!enabled && phase !== 'failed')}
          onPress={phase === 'failed' ? () => {
            setRetry(value => value + 1);
            setToken(++nextScanToken);
            setPhase('aim');
            setMessage(AIM);
          } : startRead}
          style={[s.button, phase === 'reading' && s.busyButton]}>
          <Text style={s.buttonText}>{phase === 'failed' ? 'Try camera again' : phase === 'reading' ? 'Reading label…' : phase === 'finished' ? 'Read again' : 'Read label'}</Text>
        </Pressable>
    </View>
    {family ? <Pressable accessibilityRole="button" accessibilityLabel={`Show all ${family.name} expressions`} onPress={() => {
      setMessage('Choose your expression below.');
      current.current.onMatches([...family.bottles].sort((a, b) => a.name.localeCompare(b.name)));
    }} style={s.familyButton}><Text style={s.familyText}>Show all {family.name} expressions ({family.bottles.length})</Text></Pressable> : null}
  </View>;
}
const s = StyleSheet.create({
  container: { gap: 8 }, frame: { height: 380, borderRadius: 26, overflow: 'hidden', backgroundColor: '#171411' },
  bracket: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)', borderRadius: 18 },
  top: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  torch: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, paddingHorizontal: 14 },
  controls: { gap: 6 },
  overlay: { color: colors.muted, textAlign: 'center', fontSize: 13, lineHeight: 19, paddingHorizontal: 6, paddingVertical: 4 },
  fallback: { minHeight: 220, padding: 28, gap: 18, backgroundColor: colors.surface, borderRadius: 24, justifyContent: 'center' },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.accent },
  buttonText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  busyButton: { opacity: 0.75 },
  familyButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, familyText: { color: colors.accent, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
