import { memo, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useFocusEffect } from 'expo-router';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme';

export const SIGNAL_WAVE_DURATION_MS = 10_000; // The selected 12-second example at 1.2×.
export const SIGNAL_WAVE_VISIBILITY = 1.3;
const samples = Array.from({ length: 33 }, (_, i) => i / 32);
const tau = Math.PI * 2;

export const SignalMotionBackdrop = memo(function SignalMotionBackdrop({ reduceMotion }: { reduceMotion?: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;
  const [systemReduced, setSystemReduced] = useState(true);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setSystemReduced(value); }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    const app = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { live = false; motion.remove(); app.remove(); };
  }, []);
  const motionReduced = reduceMotion ?? systemReduced;
  useEffect(() => {
    if (motionReduced || !focused || !active) return;
    const animation = Animated.loop(Animated.timing(phase, {
      toValue: 1, duration: SIGNAL_WAVE_DURATION_MS, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    animation.start();
    return () => { animation.stop(); phase.stopAnimation(); phase.setValue(0); };
  }, [active, focused, motionReduced, phase]);
  const dots = useMemo(() => Array.from({ length: 160 }, (_, i) => {
    const rows = 20; const column = Math.floor(i / rows); const row = i % rows;
    const top = .025 + row * .051;
    const offset = column * .48 + row * .31;
    const wave = samples.map(value => offset - value * tau);
    const crest = wave.map(value => Math.pow((Math.sin(value) + 1) / 2, 3));
    const distance = Math.abs(.06 + column * .125 - .5) * 2;
    const readingFade = top > .30 && top < .71 ? .35 + .65 * Math.min(1, distance * 1.5) : 1;
    const edgeFade = Math.min(1, Math.max(.2, Math.min(top, 1 - top) / .08));
    const visibility = SIGNAL_WAVE_VISIBILITY * readingFade * edgeFade;
    return { key: i, left: `${6 + column * 12.5}%` as const, top: `${top * 100}%` as const,
      amber: (column * 5 + row) % 23 === 0,
      x: wave.map(value => Math.sin(value) * 8), y: wave.map(value => Math.cos(value) * 3),
      opacity: crest.map(value => (.105 + value * .15) * visibility), scale: crest.map(value => 1 + value * .25 / 1.4) };
  }), []);
  return <View testID="signal-wave-field" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.field}>
    {dots.map(dot => <Animated.View key={dot.key} style={[styles.dot, { left: dot.left, top: dot.top, backgroundColor: dot.amber ? '#D5AD73' : '#F1E9DC',
      opacity: phase.interpolate({ inputRange: samples, outputRange: dot.opacity }), transform: [
        { translateX: phase.interpolate({ inputRange: samples, outputRange: dot.x }) },
        { translateY: phase.interpolate({ inputRange: samples, outputRange: dot.y }) },
        { scale: phase.interpolate({ inputRange: samples, outputRange: dot.scale }) },
      ] }]} />)}
  </View>;
});

export function SignalMotionScreen({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View testID="signal-motion-screen" style={[styles.screen, style]}><SignalMotionBackdrop />{children}</View>;
}
const styles = StyleSheet.create({
  field: { position: 'absolute', inset: 0, overflow: 'hidden' },
  dot: { position: 'absolute', width: 2.8, height: 2.8, borderRadius: 1.4 },
  screen: { flex: 1, backgroundColor: colors.background },
});
