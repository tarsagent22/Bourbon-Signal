import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';

const phases = Array.from({ length: 33 }, (_, index) => index / 32);
const drift = phases.map(value => Math.sin(value * Math.PI * 2) * 12);

// One shared phase keeps neighboring columns moving in opposite directions.
export function OnboardingBackdrop({ reduceMotion }: { reduceMotion: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    phase.setValue(0);
    if (reduceMotion || !focused || !active) return;
    // A single native timing loop avoids JS work per frame and keeps reversals smooth.
    // The sine path starts centered: odd columns travel right, even columns left.
    const animation = Animated.loop(Animated.timing(phase, {
      toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    animation.start();
    return () => { animation.stop(); phase.stopAnimation(); };
  }, [active, focused, phase, reduceMotion]);
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    {Array.from({ length: 8 }, (_, column) => <Animated.View key={column} testID={`onboarding-dot-column-${column + 1}`} style={[styles.column, { left: `${6 + column * 12.5}%`, transform: [{ translateX: phase.interpolate({ inputRange: phases, outputRange: column % 2 === 0 ? drift : drift.map(value => -value) }) }] }]}>
      {Array.from({ length: 24 }, (_, row) => <View key={row} style={[styles.dot, { top: `${2 + row * 4.25}%`, opacity: 0.045 + ((column + row) % 3) * 0.015 }]} />)}
    </Animated.View>)}
  </View>;
}
const styles = StyleSheet.create({
  column: { position: 'absolute', top: 0, bottom: 0, width: 3 },
  dot: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: '#F1E9DC' },
});
