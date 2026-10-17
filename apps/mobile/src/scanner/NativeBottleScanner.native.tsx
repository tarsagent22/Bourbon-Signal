import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createLabelIndex } from './label-matching';
import { createLiveLabelSession, type LabelFrame } from './live-label-session';
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
const LabelCamera = reader?.liveFramesVersion === 1 ? requireNativeView<NativeCameraProps>('BottleLabelReader') : null;

/** Old binaries retain search; file-based capture is never used as a hidden fallback. */
export function NativeBottleScanner(props: ScannerProps) {
  if (!cameraLibrary || !LabelCamera) return <View style={s.fallback}><Text style={s.copy}>Live scanning needs the updated app build. You can still search by name.</Text></View>;
  return <LiveCamera {...props} />;
}

function LiveCamera({ active, catalog, onMatches, session = 0, onMetrics }: ScannerProps) {
  const NativeCamera = LabelCamera!;
  const [permission, requestPermission] = cameraLibrary!.useCameraPermissions();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [held, setHeld] = useState(false), [failed, setFailed] = useState(false), [torch, setTorch] = useState(false);
  const [retry, setRetry] = useState(0), [message, setMessage] = useState('Reading label…');
  const [view, setView] = useState({ width: 320, height: 380 });
  const [family, setFamily] = useState<ReturnType<typeof createLabelIndex>['families'][number]>();
  const current = useRef({ onMatches, onMetrics, view }); current.current = { onMatches, onMetrics, view };
  const enabled = active && foreground && Boolean(permission?.granted) && !failed;
  const accepting = useRef(false); accepting.current = enabled && !held;
  const index = useMemo(() => createLabelIndex(catalog), [catalog]);
  const tracker = useMemo(() => createLiveLabelSession(index, performance.now()), [index]);
  const token = useMemo(() => ++nextScanToken, [session, tracker, retry, enabled]);
  const currentToken = useRef(token); currentToken.current = token;
  const lastFamily = useRef(''), lastList = useRef(''), failures = useRef(0);
  const publish = (matches: Parameters<ScannerProps['onMatches']>[0]) => {
    const ids = matches.map(b => b.id).join('|');
    if (ids !== lastList.current) { lastList.current = ids; current.current.onMatches(matches); }
  };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { setForeground(state === 'active'); if (state !== 'active') setTorch(false); });
    return () => { accepting.current = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    tracker.reset(performance.now()); setHeld(false); setFailed(false); setTorch(false); setFamily(undefined);
    publish([]); lastFamily.current = ''; failures.current = 0; setMessage('Reading label…');
  }, [session, tracker]);
  useEffect(() => {
    if (enabled && !held) tracker.reset(performance.now());
    if (!enabled) {
      tracker.reset(performance.now()); setTorch(false);
      if (!held && !failed) { publish([]); setFamily(undefined); lastFamily.current = ''; }
    }
  }, [enabled, tracker, held, failed]);
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
      if (width > 0 && height > 0) setView({ width, height });
    }}>
      <NativeCamera key={retry} style={StyleSheet.absoluteFill} active={enabled} scanning={enabled && !held} torch={enabled && !held && torch} scanToken={token}
        onFrame={({ nativeEvent }) => {
          if (!accepting.current || nativeEvent.scanToken !== currentToken.current) return;
          const result = tracker.observe(nativeEvent, current.current.view, performance.now());
          if (!result) return;
          failures.current = 0;
          if (result.family?.identity !== lastFamily.current) { lastFamily.current = result.family?.identity || ''; setFamily(result.family); }
          if (result.changed) publish(result.matches);
          const text = { reading: 'Reading label…', suggesting: 'Possible bottles below · reading expression…', ready: 'Matches saved below',
            unknown: 'Label text read · no catalog match yet. Search by name.', empty: 'No label text read yet · keep the front label in view.' };
          setMessage(text[result.phase]);
          if (result.phase === 'ready') {
            accepting.current = false; setHeld(true); setTorch(false); current.current.onMetrics?.(result.metrics);
            if (__DEV__) console.info('Bottle scan timings', result.metrics);
          }
        }} onStatus={({ nativeEvent }) => {
          if (!accepting.current || nativeEvent.scanToken !== currentToken.current || nativeEvent.state !== 'error') return;
          failures.current += 1;
          if (nativeEvent.code === 'LABEL_ANALYSIS_FAILED' && failures.current < 3) return;
          setFailed(true); setMessage('Label reading paused. Try again or search by name.');
        }} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}><View testID="bottle-label-scan-guide" style={[s.bracket, { left: guide.left, top: guide.top, width: guide.width, height: guide.height }]} /></View>
      <View style={s.top}>
        <View accessible accessibilityLabel={held ? 'Scan results saved' : enabled ? 'Camera scanning' : 'Camera paused'} style={[s.dot, { backgroundColor: enabled && !held ? '#AAD1AB' : colors.muted }]} />
        <Pressable accessibilityRole="button" disabled={!enabled || held} accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'} accessibilityState={{ selected: torch, disabled: !enabled || held }} onPress={() => setTorch(value => !value)} style={s.torch}>
          <MaterialCommunityIcons name={torch ? 'flashlight' : 'flashlight-off'} color="#fff" size={22} />
        </Pressable>
      </View>
      <View style={s.bottom}>
        <Text accessibilityLiveRegion="polite" style={s.overlay}>{message}</Text>
        {failed ? <Pressable accessibilityRole="button" onPress={() => { tracker.reset(performance.now()); failures.current = 0; setFailed(false); setHeld(false); setRetry(value => value + 1); setMessage('Reading label…'); }} style={s.button}><Text style={s.buttonText}>Try camera again</Text></Pressable> : null}
      </View>
    </View>
    {family ? <Pressable accessibilityRole="button" accessibilityLabel={`Show all ${family.name} expressions`} onPress={() => {
      accepting.current = false; setHeld(true); setTorch(false); setMessage('Choose your expression below');
      publish([...family.bottles].sort((a, b) => a.name.localeCompare(b.name)));
    }} style={s.familyButton}><Text style={s.familyText}>Show all {family.name} expressions ({family.bottles.length})</Text></Pressable> : null}
  </View>;
}
const s = StyleSheet.create({
  container: { gap: 8 }, frame: { height: 380, borderRadius: 26, overflow: 'hidden', backgroundColor: '#171411' },
  bracket: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)', borderRadius: 18 },
  top: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dot: { width: 8, height: 8, borderRadius: 4, margin: 12 },
  torch: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, paddingHorizontal: 14 },
  bottom: { position: 'absolute', bottom: 16, left: 16, right: 16, gap: 8 },
  overlay: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.7)', textAlign: 'center', fontSize: 13, lineHeight: 19, padding: 12, borderRadius: 12 },
  fallback: { minHeight: 220, padding: 28, gap: 18, backgroundColor: colors.surface, borderRadius: 24, justifyContent: 'center' },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.accent },
  buttonText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  familyButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, familyText: { color: colors.accent, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
