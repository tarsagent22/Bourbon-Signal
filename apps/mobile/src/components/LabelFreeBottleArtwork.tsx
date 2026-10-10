import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, View } from 'react-native';
import type { LabelFreeShape } from './label-free-bottle-artwork';
import { LABEL_FREE_ARTWORK as artwork } from './label-free-artwork-assets';

export function LabelFreeBottleArtwork({ shape, size = 'grid' }: {
  shape: LabelFreeShape; size?: 'grid' | 'list' | 'detail' | 'showcase' | 'feed';
}) {
  const phase = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const detail = size === 'detail';
  const width = detail ? 180 : size === 'feed' ? 64 : size === 'showcase' ? 88 : size === 'grid' ? 80 : 44;
  const height = detail ? 270 : size === 'feed' ? 102 : size === 'showcase' ? 148 : size === 'grid' ? 116 : 62;
  useEffect(() => {
    if (!detail) return;
    let mounted = true;
    let changed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !changed) setReduceMotion(value);
    }).catch(() => { /* Keep static artwork if accessibility preference is unavailable. */ });
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReduceMotion(value);
    });
    const app = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { mounted = false; preference.remove(); app.remove(); };
  }, [detail]);
  useEffect(() => {
    phase.setValue(0);
    if (!detail || reduceMotion || !active) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: 2750, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(phase, { toValue: 0, duration: 2750, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => { animation.stop(); phase.setValue(0); };
  }, [active, detail, phase, reduceMotion]);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width, height, alignItems: 'center' }}>
    <Animated.View style={{ width, height, transform: [
      { translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -1.2] }) },
      { rotate: phase.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '.4deg'] }) },
    ] }}>
      <Image source={artwork[shape]} resizeMode="contain" style={{ width, height, ...(size === 'showcase' ? { transform: [{ translateY: 12 }] } : {}) }} />
    </Animated.View>
  </View>;
}
