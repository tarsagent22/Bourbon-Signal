import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet } from "react-native";
import { colors } from "../theme";

// Keep the slide independent of server latency and native disabled-state effects.
export function PreferenceSwitch({ label, value, disabled, onValueChange }: {
  label: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => Promise<boolean>;
}) {
  const [requested, setRequested] = useState<boolean | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const busy = useRef(false);
  const mounted = useRef(true);
  const checked = requested ?? value;
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    mounted.current = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", next => {
      changed = true;
      setReduceMotion(next);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(next => {
      if (mounted.current && !changed) setReduceMotion(next);
    }).catch(() => undefined);
    return () => { mounted.current = false; listener.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion) { progress.setValue(checked ? 1 : 0); return; }
    const slide = Animated.timing(progress, {
      toValue: checked ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    slide.start();
    return () => slide.stop();
  }, [checked, progress, reduceMotion]);

  async function toggle() {
    if (disabled || busy.current) return;
    busy.current = true;
    setRequested(!checked);
    try { await onValueChange(!checked); }
    finally {
      busy.current = false;
      // The parent commits the confirmed value on success; failure slides back.
      if (mounted.current) setRequested(null);
    }
  }

  const pending = requested !== null;
  return <Pressable accessibilityRole="switch" accessibilityLabel={label}
    accessibilityState={{ checked, disabled: disabled || pending, busy: pending }}
    aria-checked={checked} aria-busy={pending}
    disabled={disabled || pending} onPress={() => { void toggle().catch(() => undefined); }}
    style={[styles.target, disabled && !pending ? styles.unavailable : undefined]}>
    <Animated.View pointerEvents="none" style={styles.track} />
    <Animated.View pointerEvents="none" style={[styles.track, styles.enabled, { opacity: progress }]} />
    <Animated.View pointerEvents="none" style={[styles.thumb, {
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) }],
    }]} />
  </Pressable>;
}

const styles = StyleSheet.create({
  target: { width: 56, height: 44, flexShrink: 0 },
  track: { position: "absolute", left: 0, right: 0, top: 6, height: 32, borderRadius: 16, backgroundColor: colors.border },
  enabled: { backgroundColor: colors.accentPressed },
  thumb: { position: "absolute", left: 3, top: 9, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.text },
  unavailable: { opacity: 0.45 },
});
