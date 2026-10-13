import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

export function BrandMark({ large = false }: { large?: boolean }) {
  return <View style={[s.mark, large && s.markLarge]}>
    <View accessible={false} style={[s.markRing, large && s.markRingLarge]} />
    <Image accessible={false} source={require('../../assets/splash-icon.png')} style={large ? s.logoLarge : s.logo} resizeMode="contain" />
  </View>;
}
export function OnboardingFrame({ children, title, description, eyebrow = 'BOURBON SIGNAL', step, footer, transitionKey, largeMark = false }: PropsWithChildren<{
  title: string; description?: string; eyebrow?: string; step?: number; footer?: React.ReactNode; transitionKey?: string | number; largeMark?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduceMotion(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { live = false; listener.remove(); };
  }, []);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    opacity.stopAnimation(); opacity.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;
    const animation = Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [transitionKey, reduceMotion, opacity]);
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View pointerEvents="none" accessible={false} style={s.topGlow} />
    <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page, { paddingTop: Math.max(insets.top, 20) + 12, paddingBottom: footer ? 24 : insets.bottom + 24 }]}>
      <View style={s.brandRow}><BrandMark large={largeMark} />{!largeMark ? <Text style={s.wordmark}>Bourbon Signal</Text> : null}</View>
      {step !== undefined ? <View accessibilityLabel={`Getting started, page ${Math.min(step + 1, 5)} of 5${step > 4 ? ', alert setup' : ''}`} style={s.progress}>{[0, 1, 2, 3, 4].map(index => <View key={index} style={[s.progressLine, index <= step && s.progressActive]} />)}</View> : null}
      <Animated.View style={{ opacity, gap: 26 }}>
        <View style={s.heading}><Text style={s.eyebrow}>{eyebrow}</Text><Text accessibilityRole="header" style={s.title}>{title}</Text>{description ? <Text style={s.copy}>{description}</Text> : null}</View>
        <View style={s.body}>{children}</View>
      </Animated.View>
    </ScrollView>
    {footer ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View> : null}
  </KeyboardAvoidingView>;
}
export function OnboardingButton({ label, onPress, secondary = false, disabled = false, busy = false }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [secondary ? s.secondary : s.button, pressed && s.pressed, (disabled || busy) && s.disabled]}>
    {busy ? <ActivityIndicator color={secondary ? colors.accent : colors.background} /> : <Text style={secondary ? s.secondaryText : s.buttonText}>{label}</Text>}
  </Pressable>;
}
export function Choice({ title, detail, selected, onPress, multiple = false, disabled = false }: {
  title: string; detail?: string; selected: boolean; onPress: () => void; multiple?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.choice, selected && s.choiceSelected, pressed && s.pressed, disabled && s.disabled]}>
    <View style={{ flex: 1, gap: 5 }}><Text style={s.choiceTitle}>{title}</Text>{detail ? <Text style={s.small}>{detail}</Text> : null}</View>
    <View accessible={false} style={[s.selection, selected && s.selectionActive]}>{selected ? <Text style={s.selectionCheck}>✓</Text> : null}</View>
  </Pressable>;
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' }, topGlow: { position: 'absolute', top: -300, right: -180, width: 520, height: 520, borderRadius: 260, borderWidth: 1, borderColor: 'rgba(214,154,74,0.09)' },
  page: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, gap: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, wordmark: { color: colors.text, fontFamily: fonts.heading, fontSize: 20 },
  mark: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' }, markLarge: { width: 160, height: 160 },
  markRing: { position: 'absolute', width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#5D452E' }, markRingLarge: { width: 146, height: 146, borderRadius: 73 },
  logo: { width: 54, height: 54 }, logoLarge: { width: 160, height: 160 }, progress: { flexDirection: 'row', gap: 7 },
  progressLine: { flex: 1, height: 3, backgroundColor: colors.border, borderRadius: 2 }, progressActive: { backgroundColor: colors.accent },
  heading: { gap: 12 }, eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 32, lineHeight: 39, letterSpacing: -0.6 },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 25 }, small: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  body: { gap: 14 }, footer: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12, gap: 4, backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  input: { minHeight: 54, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: '#534230', borderRadius: 9, backgroundColor: '#1B1611', color: colors.text, fontSize: 16 },
  button: { minHeight: 54, backgroundColor: colors.accent, borderRadius: 9, padding: 14, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '800' }, secondary: { minHeight: 46, padding: 10, justifyContent: 'center', alignItems: 'center' }, secondaryText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  choiceSelected: { borderColor: colors.accent, backgroundColor: '#261E14' }, choiceTitle: { color: colors.text, fontSize: 16, fontWeight: '600', lineHeight: 23 },
  selection: { width: 23, height: 23, borderRadius: 12, borderWidth: 1, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' }, selectionActive: { backgroundColor: colors.accent, borderColor: colors.accent }, selectionCheck: { color: colors.background, fontWeight: '800' },
  panel: { padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, gap: 12 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'center' }, error: { color: colors.danger, fontSize: 14, lineHeight: 21 }, success: { color: colors.success, fontSize: 14, lineHeight: 21 },
  pressed: { opacity: 0.75 }, disabled: { opacity: 0.5 },
});
