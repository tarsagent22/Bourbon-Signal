import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { COMMUNITY_TERMS_VERSION, PRIVACY_URL, TERMS_URL } from '../../../../shared/legal-acceptance';
import { useMobileApi } from '../hooks/useMobileApi';
import { colors } from '../theme';

export function CommunityTermsGate({ onAccepted }: { onAccepted: (accepted: boolean) => void }) {
  const api = useMobileApi();
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); onAccepted(false);
    api.getLegalAcceptance().then(result => {
      if (active) { const valid = result.acceptance?.termsVersion === COMMUNITY_TERMS_VERSION; setAccepted(valid); onAccepted(valid); }
    }).catch(() => { if (active) setError('Your agreement could not be checked. Try again.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [api, attempt, onAccepted]);
  async function accept() {
    if (!checked || busy) return;
    setBusy(true); setError('');
    try {
      await api.acceptLegalTerms();
      setAccepted(true); onAccepted(true);
    } catch { setError('Your agreement could not be saved. Try again.'); }
    finally { setBusy(false); }
  }
  if (accepted) return null;
  return <View style={styles.card}>
    <Text style={styles.title}>Before you post</Text>
    <Text style={styles.copy}>Agree to our terms before sharing with the community. You keep ownership of your photos and give Bourbon Signal permission to display them.</Text>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="I agree to the Terms of Use and acknowledge the Privacy Policy" accessibilityState={{ checked, disabled: busy }} disabled={busy} onPress={() => setChecked(value => !value)} style={styles.row}>
      <Text accessible={false} style={styles.box}>{checked ? '☑' : '☐'}</Text><Text style={styles.copy}>I agree to the Terms of Use and acknowledge the Privacy Policy.</Text>
    </Pressable>
    <View style={styles.links}>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_URL).catch(() => setError('Terms could not open. Try again.'))} style={styles.link}><Text style={styles.gold}>Terms of Use</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => setError('Privacy Policy could not open. Try again.'))} style={styles.link}><Text style={styles.gold}>Privacy Policy</Text></Pressable>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.copy}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !checked }} disabled={busy || !checked} onPress={() => void accept()} style={styles.link}>
      {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={[styles.gold, !checked && { opacity: 0.5 }]}>Agree and continue</Text>}
    </Pressable>
    {error ? <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={styles.link}><Text style={styles.gold}>Check again</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8, borderWidth: 1, borderColor: colors.accent, borderRadius: 14, marginTop: 12 },
  title: { color: colors.text, fontSize: 17, fontWeight: '600' },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  box: { color: colors.accent, fontSize: 26 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  link: { minHeight: 44, justifyContent: 'center' },
  gold: { color: colors.accent, fontSize: 14, fontWeight: '600' },
});
