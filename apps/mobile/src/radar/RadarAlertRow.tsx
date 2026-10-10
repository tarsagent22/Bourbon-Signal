import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MemberAlert } from "../api/types";
import { relativeSignalTime } from "../api/presentation";
import { signalRouteForRequestedAlert } from "../push/push-navigation";
import { alertIsStale, memberAlertBottleNames } from "./radar-preferences";
import { colors, fonts, typeScale } from "../theme";
import { radarSwipeDestination, radarSwipeShouldStart } from "./radar-row-gesture";

export function RadarAlertRow({ alert, saving, watchedNames, onMutate, onMute, isMuted }: {
  alert: MemberAlert; saving: boolean; watchedNames: string[];
  onMutate?: (action: "mark_read" | "archive", id: string) => Promise<void>;
  onMute: (name: string, muted: boolean) => Promise<boolean>;
  isMuted: (name: string) => boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [chooseBottles, setChooseBottles] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [muteError, setMuteError] = useState("");
  const offset = useRef(0);
  const x = useRef(new Animated.Value(0)).current;
  const bottles = memberAlertBottleNames(alert, watchedNames);
  const stale = alertIsStale(alert);
  const unread = !alert.readAt && !stale;
  const route = signalRouteForRequestedAlert([alert], alert.id);
  const closeSwipe = () => { offset.current = 0; setRevealed(false); Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(); };
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Boolean(onMutate) && !saving && radarSwipeShouldStart(g.dx, g.dy),
    onPanResponderMove: (_, g) => x.setValue(Math.max(-144, Math.min(0, offset.current + g.dx))),
    onPanResponderRelease: (_, g) => { offset.current = radarSwipeDestination(offset.current + g.dx); setRevealed(offset.current !== 0); Animated.spring(x, { toValue: offset.current, useNativeDriver: true, bounciness: 0 }).start(); },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: closeSwipe,
  }), [onMutate, saving, x]);
  async function mutate(action: "mark_read" | "archive") { setMenu(false); closeSwipe(); await onMutate?.(action, alert.id); }
  async function mute(name: string) { setMuteError(""); if (await onMute(name, !isMuted(name))) { setMenu(false); setChooseBottles(false); } else setMuteError("This bottle preference couldn’t save. Try again."); }
  return <View style={s.shell}>
    {onMutate ? <View aria-hidden={!revealed} pointerEvents={revealed ? "auto" : "none"} importantForAccessibility={revealed ? "auto" : "no-hide-descendants"} accessibilityElementsHidden={!revealed} style={s.swipeActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${bottles[0]} read`} disabled={saving || !!alert.readAt} onPress={() => void mutate("mark_read")} style={s.swipeAction}><MaterialCommunityIcons name="check" color={colors.text} size={20} /><Text style={s.actionCaption}>Read</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Archive ${bottles[0]} alert`} disabled={saving} onPress={() => void mutate("archive")} style={[s.swipeAction, s.archive]}><MaterialCommunityIcons name="archive-outline" color={colors.text} size={20} /><Text style={s.actionCaption}>Archive</Text></Pressable>
    </View> : null}
    <Animated.View style={[s.foreground, { transform: [{ translateX: x }] }]}>
      <View style={s.row} {...responder.panHandlers}>
        <View style={[s.dot, unread && s.unread]} />
        <Pressable accessibilityRole="button" accessibilityLabel={`${bottles.join(", ")}, ${alert.storeLabel}, ${unread ? "unread, " : ""}View details`} accessibilityState={{ expanded }} accessibilityHint="Expands this alert. Swipe left for read and archive actions." onPress={() => { closeSwipe(); setExpanded(v => !v); }} style={s.copy}>
          <Text style={s.bottle}>{bottles.length > 1 ? `${bottles[0]} +${bottles.length - 1}` : bottles[0]}</Text>
          <Text style={s.location}>{[alert.storeLabel, alert.matchedArea || alert.state].filter(Boolean).join(" · ")}</Text>
          <Text style={s.meta}>{stale ? "Past report" : alert.sourceType === "community" ? "Community sighting" : "Bottle report"} · {relativeSignalTime(alert.signalAt || alert.createdAt)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${bottles[0]}`} disabled={saving} onPress={() => { closeSwipe(); setMuteError(""); setChooseBottles(false); setMenu(true); }} style={s.menuButton}><MaterialCommunityIcons name="dots-horizontal" color={colors.muted} size={22} /></Pressable>
      </View>
      {expanded ? <View style={s.details}>
        {bottles.length > 1 ? <Text style={s.detailText}>{bottles.join("\n")}</Text> : null}
        <Text style={s.detailText}>{alert.sourceLabel || (alert.sourceType === "community" ? "Community" : "Bourbon Signal")} · {new Date(alert.signalAt || alert.createdAt).toLocaleString()}</Text>
        <Text style={s.detailText}>{alert.quantity !== null ? `Reported quantity: ${alert.quantity} · ` : ""}availability unconfirmed</Text>
        {route ? <Pressable accessibilityRole="button" onPress={() => router.push(route)} style={s.menuItem}><Text style={s.action}>Open report</Text><MaterialCommunityIcons name="arrow-top-right" color={colors.accent} size={18} /></Pressable> : null}
      </View> : null}
    </Animated.View>
    <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
      <View style={s.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close alert actions" onPress={() => setMenu(false)} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={["bottom"]} accessibilityViewIsModal style={s.sheet}>
          <Text accessibilityRole="header" style={s.sheetTitle}>{chooseBottles ? "Choose a bottle" : "Alert actions"}</Text>
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {chooseBottles ? bottles.map(name => <Pressable key={name} accessibilityRole="button" disabled={saving} onPress={() => void mute(name)} style={s.menuItem}><Text style={s.itemLabel}>{name}</Text><Text style={s.action}>{isMuted(name) ? "Allow alerts" : "Mute"}</Text></Pressable>) : <>
            {onMutate && !alert.readAt ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void mutate("mark_read")} style={s.menuItem}><Text style={s.itemLabel}>Mark read</Text></Pressable> : null}
            {onMutate ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void mutate("archive")} style={s.menuItem}><Text style={s.itemLabel}>Archive</Text></Pressable> : null}
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => bottles.length > 1 ? setChooseBottles(true) : void mute(bottles[0])} style={s.menuItem}><Text style={s.itemLabel}>{bottles.length > 1 ? "Stop alerts for a bottle…" : isMuted(bottles[0]) ? "Allow alerts for this bottle" : "Stop getting alerts for this bottle"}</Text></Pressable>
          </>}
          </ScrollView>
          {muteError ? <Text accessibilityRole="alert" style={{ color: colors.danger, paddingTop: 10 }}>{muteError}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => setMenu(false)} style={s.menuItem}><Text style={s.action}>Done</Text></Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  shell: { overflow: "hidden", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  foreground: { backgroundColor: colors.background }, row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13 },
  copy: { flex: 1, minWidth: 0, gap: 4 }, bottle: { color: colors.text, fontFamily: fonts.bottle, fontSize: typeScale.subheading, lineHeight: 23 },
  location: { color: colors.text, fontSize: typeScale.small, lineHeight: 18 }, meta: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 16 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "transparent" }, unread: { backgroundColor: colors.accent },
  menuButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  details: { marginLeft: 15, paddingBottom: 12, gap: 8 }, detailText: { color: colors.muted, fontSize: typeScale.small, lineHeight: 19 },
  swipeActions: { position: "absolute", right: 0, top: 0, bottom: 0, flexDirection: "row", width: 144 }, swipeAction: { width: 72, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", gap: 5 }, archive: { backgroundColor: "#35281C" }, actionCaption: { color: colors.text, fontSize: typeScale.caption },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }, sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  sheetTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: typeScale.section, marginBottom: 10 }, menuItem: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, itemLabel: { flex: 1, color: colors.text, fontSize: typeScale.body, lineHeight: 20 }, action: { color: colors.accent, fontSize: typeScale.small, fontWeight: "700" },
});
