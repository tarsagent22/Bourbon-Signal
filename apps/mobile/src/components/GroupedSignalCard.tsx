import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CellarBottleArtwork } from "./CellarBottleArtwork";
import { signalFeedCardAppearance, relativeSignalTime, signalCardStatusLabel } from "../api/presentation";
import type { Signal } from "../api/types";
import { loadedBottleReports, formatBottleReportCounts } from "../signals/feed-report-groups";
import { colors, fonts } from "../theme";
import { useReportClock } from "../hooks/useReportClock";

export function GroupedSignalCard({ reports, expanded, onToggle, onOpen, nearest }: {
  reports: Signal[]; expanded: boolean; onToggle: () => void; onOpen: (report: Signal) => void; nearest?: number;
}) {
  const now = useReportClock();
  const [first] = reports;
  const appearance = signalFeedCardAppearance(first);
  const visible = loadedBottleReports(reports);
  const summary = reports.find(report => report.groupSummary)?.groupSummary;
  const shipment = Boolean(summary?.shipments || first.shipment);
  const grouped = visible.length > 1 || (summary && summary.stores + summary.shipments + summary.otherReports > 1);
  const age = relativeSignalTime(summary?.latestAt || first.shipment?.reportedAt || first.timing.lastCheckedAt || first.timing.displayAt, now);
  const meta = [
    summary ? formatBottleReportCounts(summary) : first.shipment ? "ABC shipment" : first.location.store?.name || first.location.label,
    nearest != null && summary?.stores ? "nearest mapped " + Math.round(nearest) + " mi" : "",
    !grouped && first.availability?.price != null ? "$" + first.availability.price.toFixed(2) : "",
    age,
  ].filter(Boolean).join(" · ");
  const confidence = shipment
    ? summary?.stores ? "Shipment receiving stores unconfirmed" : "Receiving stores unconfirmed"
    : !grouped ? signalCardStatusLabel(first, now) : "";
  return <View>
    <Pressable accessibilityRole="button" accessibilityState={grouped ? { expanded } : undefined}
      onPress={grouped ? onToggle : () => onOpen(first)} style={styles.row}>
      <CellarBottleArtwork bottle={{ bottleId: first.bottle.id, bottleName: first.bottle.name }} size="feed" hidePlaceholderLabel />
      <View style={styles.copy}>
        <Text style={[styles.tier, { color: appearance.accent, backgroundColor: appearance.keyline }]}>{appearance.rarityLabel}</Text>
        <Text style={styles.title}>{first.bottle.name}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {confidence ? <Text style={styles.meta}>{confidence}</Text> : null}
      </View>
      <MaterialCommunityIcons name={grouped ? expanded ? "chevron-up" : "chevron-down" : "chevron-right"} size={20} color={colors.accent} />
    </Pressable>
    {grouped && expanded ? <View style={styles.children}>
      {visible.map(report => {
        const name = report.location.store?.name || report.location.label || report.location.state || "View report";
        const units = report.shipment?.quantity;
        const count = units ? units + " units" : report.availability?.quantityLabel;
        const age = relativeSignalTime(report.shipment?.reportedAt || report.timing.lastCheckedAt || report.timing.displayAt, now);
        return <Pressable key={report.id} accessibilityRole="button" onPress={() => onOpen(report)} style={styles.child}>
          <Text style={styles.meta} numberOfLines={1}>{[name, count, age].filter(Boolean).join(" · ")}</Text>
        </Pressable>;
      })}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 104, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  tier: { alignSelf: "flex-start", fontSize: 11, fontWeight: "800", borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  title: { fontFamily: fonts.heading, color: colors.text, fontSize: 20, lineHeight: 24 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  children: { paddingLeft: 12, marginLeft: 68, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  child: { minHeight: 44, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
