import { useEffect, useState } from 'react';
import { Keyboard, Modal, Switch, Text, TextInput, View } from 'react-native';
import type { RadarBottleOption } from '../api/types';
import { CellarBottleArtwork } from '../components/CellarBottleArtwork';
import { ScoreSlider } from '../components/ScoreSlider';
import { useBottleCatalog } from '../hooks/useBottleCatalog';
import { colors } from '../theme';
import { Choice, OnboardingButton, OnboardingFrame, s } from './OnboardingUI';
export function OnboardingShelfSheet({ visible, bottle, busy, error, onClose, onSave, embedded = false }: {
  embedded?: boolean; visible: boolean; bottle: RadarBottleOption | null; busy: boolean; error: string;
  onClose: () => void; onSave: (bottle: RadarBottleOption, kind: 'sealed' | 'opened' | 'just_tasted', rating?: number) => Promise<void>;
}) {
  const catalog = useBottleCatalog();
  const [selected, setSelected] = useState<RadarBottleOption | null>(bottle); const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'sealed' | 'opened' | 'just_tasted'>('sealed'); const [rate, setRate] = useState(false); const [rating, setRating] = useState(0); const [dragging, setDragging] = useState(false);
  useEffect(() => { if (visible) { setSelected(bottle); setQuery(''); setKind('sealed'); setRate(false); setRating(0); Keyboard.dismiss(); } }, [visible, bottle]);
  const content = <OnboardingFrame title={selected ? selected.name : 'Add a bottle to your shelf.'} onBack={onClose} backDisabled={busy} scrollEnabled={!dragging}
      description={selected ? undefined : 'Search for a bottle you own or a whiskey you’ve tried.'}
      footer={selected ? <>{error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}<OnboardingButton label={kind === 'just_tasted' ? 'Save tasting' : 'Add one bottle'} busy={busy} onPress={() => void onSave(selected, kind, rate ? rating : undefined)} /></> : undefined}>
      {selected ? <>
        <View style={{ alignItems: 'center' }}><CellarBottleArtwork bottle={{ bottleId: selected.id, bottleName: selected.name }} size="showcase" /></View>
        {selected.proof ? <Text style={[s.small, { textAlign: 'center' }]}>{selected.proof} proof · {selected.proof / 2}% ABV</Text> : null}
        <Choice title="I own an unopened bottle" selected={kind === 'sealed'} disabled={busy} onPress={() => setKind('sealed')} />
        <Choice title="I own an open bottle" selected={kind === 'opened'} disabled={busy} onPress={() => setKind('opened')} />
        <Choice title="I’ve tried it, but don’t own it" selected={kind === 'just_tasted'} disabled={busy} onPress={() => setKind('just_tasted')} />
        <View style={[s.row, { justifyContent: 'space-between', minHeight: 48 }]}><Text style={s.label}>Add a rating (optional)</Text><Switch accessibilityLabel="Add a rating" value={rate} disabled={busy} onValueChange={setRate} trackColor={{ true: colors.accent, false: colors.border }} /></View>
        {rate ? <ScoreSlider value={rating} onChange={setRating} onDraggingChange={setDragging} /> : null}
        {!bottle ? <OnboardingButton secondary label="Choose a different bottle" disabled={busy} onPress={() => { setSelected(null); setQuery(''); }} /> : null}
      </> : <>
        <TextInput accessibilityLabel="Search shelf bottles" value={query} onChangeText={setQuery} style={s.input} placeholder="Bottle or distillery name" placeholderTextColor={colors.muted} autoCorrect={false} spellCheck={false} />
        {query.trim() ? catalog.search(query, 8).map(option => <Choice key={option.id} title={option.name} detail={option.proof ? `${option.proof} proof` : undefined} selected={false} onPress={() => { Keyboard.dismiss(); setSelected(option); }} />) : <Text style={s.small}>You can add more bottles and tasting notes in My Shelf.</Text>}
        {query.trim() && !catalog.search(query, 8).length ? <Text style={s.small}>No match yet. Try the distillery name.</Text> : null}
        {catalog.error ? <OnboardingButton secondary label="Retry bottle search" onPress={catalog.retry} /> : null}
      </>}
    </OnboardingFrame>;
  return embedded ? content : <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>{content}</Modal>;
}
