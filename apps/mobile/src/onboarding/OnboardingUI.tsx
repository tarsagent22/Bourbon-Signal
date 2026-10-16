import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CellarBottleArtwork } from '../components/CellarBottleArtwork';
import { colors, fonts } from '../theme';
import { OnboardingBackdrop } from './OnboardingBackdrop';
import { sightingPreviewForState } from './sighting-preview';
export function BrandMark({ large = false }: { large?: boolean }) {
  return <Image accessible={false} source={require('../../assets/splash-icon.png')} style={large ? s.logoLarge : s.logo} resizeMode="contain" />;
}
export function OnboardingFrame({ children, title, description, eyebrow, step, footer, transitionKey, largeMark = false, onBack, backDisabled = false, context, scrollEnabled = true, obscured = false }: PropsWithChildren<{
  title: string; description?: string; eyebrow?: string; step?: number; footer?: React.ReactNode; transitionKey?: string | number; largeMark?: boolean; onBack?: () => void; backDisabled?: boolean; context?: string; scrollEnabled?: boolean; obscured?: boolean;
}>) {
  const insets = useSafeAreaInsets(); const scroll = useRef<ScrollView>(null); const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(true); const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduceMotion(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true)); const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { live = false; listener.remove(); show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    Keyboard.dismiss(); scroll.current?.scrollTo({ y: 0, animated: false }); opacity.stopAnimation(); opacity.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;
    const animation = Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }); animation.start(); return () => animation.stop();
  }, [transitionKey, reduceMotion, opacity]);
  const progress = step !== undefined && step !== 4 && step !== 8;
  const total = step !== undefined && step >= 5 ? 3 : 4; const current = step !== undefined && step >= 5 ? step - 4 : (step || 0) + 1;
  return <View aria-hidden={obscured} accessibilityElementsHidden={obscured} importantForAccessibility={obscured ? 'no-hide-descendants' : 'auto'} style={[s.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <OnboardingBackdrop reduceMotion={reduceMotion} />
    <View style={s.chrome}>
      {largeMark ? null : onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={backDisabled} onPress={onBack} style={[s.back, backDisabled && s.disabled]}><Text style={s.backText}>‹</Text></Pressable> : <BrandMark />}
      <Text style={[s.wordmark, largeMark && { textAlign: 'center', fontSize: 15 }]}>Bourbon Signal</Text>
      {progress ? <Text accessibilityLabel={`${step! >= 5 ? 'Alert setup' : 'Introduction'}, ${current} of ${total}`} style={s.counter}>{current} / {total}</Text> : null}
    </View>
    {progress ? <View accessible={false} style={s.progress}><View style={[s.progressActive, { width: `${current / total * 100}%` }]} /></View> : null}
    {context ? <Text style={[s.counter, { paddingHorizontal: 24, paddingTop: 8, width: '100%', maxWidth: 520, alignSelf: 'center' }]}>{context}</Text> : null}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} scrollEnabled={scrollEnabled} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[s.page, largeMark && s.welcomePage, { paddingBottom: 24 + (footer ? 0 : insets.bottom) }]}>
        <Animated.View style={{ opacity, gap: 20 }}>
          {largeMark ? <View style={s.welcomeMark}><BrandMark large /></View> : null}
          <View style={s.heading}>{eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}<Text accessibilityRole="header" style={[s.title, largeMark && s.welcomeTitle]}>{title}</Text>{description ? <Text style={s.copy}>{description}</Text> : null}</View>
          <View style={s.body}>{children}</View>
        </Animated.View>
      </ScrollView>
      {footer && !keyboardOpen ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View> : null}
      {keyboardOpen ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss keyboard" onPress={Keyboard.dismiss} style={s.keyboardBar}><Text style={s.link}>Done</Text></Pressable> : null}
    </KeyboardAvoidingView>
  </View>;
}
export function OnboardingButton({ label, onPress, secondary = false, disabled = false, busy = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [secondary ? s.secondary : s.button, pressed && s.pressed, (disabled || busy) && s.disabled]}>{busy ? <ActivityIndicator color={secondary ? colors.accent : colors.background} /> : <Text style={secondary ? s.secondaryText : s.buttonText}>{label}</Text>}</Pressable>;
}
export function Choice({ title, detail, selected, onPress, multiple = false, disabled = false }: { title: string; detail?: string; selected: boolean; onPress: () => void; multiple?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.choice, selected && s.choiceSelected, pressed && s.pressed, disabled && s.disabled]}><View style={{ flex: 1, gap: 4 }}><Text style={s.choiceTitle}>{title}</Text>{detail ? <Text style={s.small}>{detail}</Text> : null}</View><View accessible={false} style={[s.selection, multiple && s.checkbox, selected && s.selectionActive]}>{selected ? <Text style={s.selectionCheck}>✓</Text> : null}</View></Pressable>;
}
export function FlavorChip({ title, selected, onPress, disabled }: { title: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={title} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.chip, selected && s.chipSelected, pressed && s.pressed]}><Text style={[s.chipText, selected && { color: '#F5DBAF' }]}>{selected ? '✓  ' : '+  '}{title}</Text></Pressable>;
}
export function ExampleSighting({ notification = false, state = '' }: { notification?: boolean; state?: string }) {
  const preview = sightingPreviewForState(state);
  return <View style={[s.example, notification && { padding: 14, gap: 10 }]}>
    <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.label}>{notification ? 'Bourbon Signal' : 'Community'}</Text><Text style={s.exampleLabel}>Preview</Text></View>
    <View style={s.row}><CellarBottleArtwork bottle={{ bottleId: preview.bottleId, bottleName: preview.bottleName }} size={notification ? 'list' : 'feed'} /><View style={{ flex: 1, gap: 6 }}><Text style={s.label}>{notification ? `${preview.bottleName} was spotted.` : preview.bottleName}</Text><Text style={s.small}>{preview.store}</Text><Text style={s.small}>{preview.city}, {preview.state}</Text></View></View>
  </View>;
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#10100E', overflow: 'hidden' },
  chrome: { width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, minHeight: 60, gap: 10, backgroundColor: '#10100E' },
  wordmark: { color: '#EAE1D2', fontFamily: fonts.heading, fontSize: 17, flex: 1 }, logo: { width: 34, height: 34 }, logoLarge: { width: 96, height: 96 },
  back: { minWidth: 34, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' }, backText: { color: '#D9C6A7', fontSize: 36, lineHeight: 38 }, counter: { color: '#AFA99C', fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  progress: { height: 2, backgroundColor: '#2B2A24', marginHorizontal: 24 }, progressActive: { height: 2, backgroundColor: '#BD9560' },
  page: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 26 }, welcomePage: { justifyContent: 'center', paddingTop: 12 }, welcomeMark: { alignItems: 'center', paddingVertical: 12 }, heading: { gap: 10 }, eyebrow: { color: '#BD9560', fontSize: 10, fontWeight: '700', letterSpacing: 1.7 },
  title: { color: '#F1E9DC', fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 }, welcomeTitle: { fontSize: 38, lineHeight: 43, textAlign: 'center' }, copy: { color: '#B9B3A7', fontSize: 15, lineHeight: 23 }, small: { color: '#AFA99C', fontSize: 12, lineHeight: 18 },
  body: { gap: 14 }, footer: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 10, gap: 2, backgroundColor: '#10100E', borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#2B2A24' }, keyboardBar: { paddingHorizontal: 24, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center', backgroundColor: '#10100E' }, label: { color: '#EBE3D6', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  input: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#48463C', borderRadius: 10, backgroundColor: '#1A1B17', color: '#F1E9DC', fontSize: 16 }, button: { minHeight: 52, backgroundColor: '#D5AD73', borderRadius: 10, padding: 14, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#181A14', fontSize: 15, fontWeight: '700' },
  secondary: { minHeight: 44, paddingVertical: 9, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' }, secondaryText: { color: '#BDB7AA', fontSize: 13, fontWeight: '500' }, link: { color: '#DEC393', fontSize: 13, fontWeight: '600' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 58, borderWidth: 1, borderColor: '#33362C', borderRadius: 10, backgroundColor: '#171A15' }, choiceSelected: { borderColor: '#A98A57', backgroundColor: '#242A1D' }, choiceTitle: { color: '#EBE3D6', fontSize: 15, fontWeight: '600', lineHeight: 21 },
  selection: { width: 21, height: 21, borderRadius: 11, borderWidth: 1, borderColor: '#8C897D', alignItems: 'center', justifyContent: 'center' }, checkbox: { borderRadius: 5 }, selectionActive: { backgroundColor: '#D5AD73', borderColor: '#D5AD73' }, selectionCheck: { color: '#181A14', fontWeight: '800', fontSize: 12 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 14, minHeight: 44, borderWidth: 1, borderColor: '#373B30', borderRadius: 24, justifyContent: 'center', backgroundColor: '#181C16' }, chipSelected: { backgroundColor: '#303624', borderColor: '#BA9A65' }, chipText: { color: '#C1BFAE', fontSize: 14 }, panel: { padding: 16, borderWidth: 1, borderColor: '#35392F', borderRadius: 14, backgroundColor: '#191E17', gap: 10 }, row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  example: { padding: 18, borderRadius: 16, backgroundColor: '#232B20', borderWidth: 1, borderColor: '#495039', gap: 16 }, exampleLabel: { color: '#B7B8A5', fontSize: 10 }, exampleTitle: { color: '#F1E9DC', fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 }, exampleRule: { height: 1, backgroundColor: '#444B35' }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 }, success: { color: colors.success, fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.75 }, disabled: { opacity: 0.5 },
});
