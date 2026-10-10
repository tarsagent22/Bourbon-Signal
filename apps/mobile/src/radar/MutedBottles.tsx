import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MemberPreferences, RadarBottleOption } from "../api/types";
import { canonicalBottleKey } from "../interactions/member-interactions";
import { colors, fonts, typeScale } from "../theme";

export type MuteBottle = { bottleId?: string; bottleName: string };
export function MutedBottles({ state, saving, search, onChange }: {
  state: MemberPreferences["mutedBottles"]; saving: boolean;
  search: (query: string, limit?: number) => RadarBottleOption[];
  onChange: (bottle: MuteBottle, muted: boolean) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  async function change(bottle: MuteBottle, muted: boolean) { setError(""); if (!await onChange(bottle, muted)) setError("This bottle preference couldn’t save. Try again."); }
  const bottles = [...(state?.bottles || [])].sort((a, b) => a.bottleName.localeCompare(b.bottleName));
  const filtered = bottles.filter(b => canonicalBottleKey(b.bottleName).includes(canonicalBottleKey(query)));
  const results = search(query, 30);
  const action = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={s.actionButton}><Text style={[s.action, disabled && s.disabled]}>{label}</Text></Pressable>;
  return <View style={s.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${bottles.length} muted bottles`} onPress={() => { setQuery(""); setAdding(false); setError(""); setOpen(true); }} style={s.summary}>
      <View style={s.flex}><Text style={s.title}>Muted bottles</Text><Text style={s.detail}>{bottles.length ? `${bottles.length} excluded from alerts` : "Choose bottles you don’t want alerts for"}</Text></View><Text style={s.action}>Manage ›</Text>
    </Pressable>
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
      <SafeAreaView edges={["top", "bottom"]} style={s.screen}>
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.header}><Text accessibilityRole="header" style={s.heading}>{adding ? "Mute a bottle" : "Muted bottles"}</Text>{action("Done", () => setOpen(false))}</View>
          <View style={s.search}><TextInput accessibilityLabel={adding ? "Search bottles to mute" : "Search muted bottles"} value={query} onChangeText={setQuery} placeholder={adding ? "Search bottle catalog" : "Search muted bottles"} placeholderTextColor={colors.muted} autoCorrect={false} clearButtonMode="while-editing" style={s.input} />{action(adding ? "Back to list" : "Add bottle", () => { setAdding(v => !v); setQuery(""); })}</View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.list}>
            {adding ? (query.trim() ? results.length ? results.map(bottle => {
              const muted = bottles.some(b => b.bottleId ? b.bottleId === bottle.id : canonicalBottleKey(b.bottleName) === canonicalBottleKey(bottle.name));
              return <View style={s.row} key={bottle.id}><Text style={s.name}>{bottle.name}</Text>{action(muted ? "Muted" : "Mute", () => void change({ bottleId: bottle.id, bottleName: bottle.name }, true), saving || muted)}</View>;
            }) : <Text style={s.detail}>No bottles match that search.</Text> : <Text style={s.detail}>Search for a bottle to stop its future alerts.</Text>) : filtered.length ? filtered.map(bottle => <View key={bottle.bottleId || bottle.bottleName} style={s.row}><Text style={s.name}>{bottle.bottleName}</Text>{action("Allow alerts", () => void change(bottle, false), saving)}</View>) : <Text style={s.detail}>{bottles.length ? "No muted bottles match that search." : "No muted bottles. Your alert preferences apply to every matching bottle."}</Text>}
            {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, paddingTop: 12 }}>{error}</Text> : null}
            <Text style={s.explanation}>Muted bottles stay visible in Home and My Shelf. Muting overrides your watched bottles and applies to phone alerts and Community sightings.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, section: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 },
  summary: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12 }, title: { color: colors.text, fontSize: typeScale.subheading, fontWeight: "700" }, detail: { color: colors.muted, fontSize: typeScale.small, lineHeight: 19, marginTop: 4 },
  header: { paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, heading: { flex: 1, color: colors.text, fontFamily: fonts.heading, fontSize: typeScale.section },
  search: { padding: 18, gap: 4 }, input: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.text, fontSize: typeScale.input }, list: { paddingHorizontal: 18, paddingBottom: 28 },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, name: { flex: 1, color: colors.text, fontSize: typeScale.body, lineHeight: 20 }, actionButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }, action: { color: colors.accent, fontSize: typeScale.small, fontWeight: "700" }, disabled: { opacity: 0.5 }, explanation: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 18, paddingTop: 24 },
});
