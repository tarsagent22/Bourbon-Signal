import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BoardMember } from "../../../../shared/nearby";
import { mappedBoardMemberDistance } from "../nearby/map-feed";
import { storeContact } from "../signals/store-contact";
import { colors } from "../theme";

export function BoardStoreLinks({ stores, boardId, owner, onDirections }: { stores: BoardMember[]; boardId: string; owner: object; onDirections: (destination: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const rows = stores.map(store => ({
    store, ...storeContact(store), distance: mappedBoardMemberDistance(owner, boardId, store.id),
  })).sort((left, right) => (left.distance ?? Infinity) - (right.distance ?? Infinity));
  if (!rows.length) return null;
  return <View>
    <Text accessibilityRole="header" style={s.heading}>Stores in this ABC area</Text>
    {(expanded ? rows : rows.slice(0, 3)).map(({ store, address, destination, distance }) => <View key={store.id} style={s.row}>
      <View style={s.copy}>
        <Text style={s.street}>{store.address || store.name}</Text>
        <Text style={s.detail}>{[store.city && [store.city, store.state].filter(Boolean).join(", "), distance != null ? distance.toFixed(1) + " mi" : "", !store.city ? address : ""].filter(Boolean).join(" · ")}</Text>
      </View>
      {destination ? <Pressable accessibilityRole="button" accessibilityLabel={"Directions to " + address} onPress={() => onDirections(destination)} style={s.action}>
        <MaterialCommunityIcons name="directions" color={colors.accent} size={20} /><Text style={s.link}>Directions</Text>
      </Pressable> : null}
    </View>)}
    {rows.length > 3 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={s.action}>
      <Text style={s.link}>{expanded ? "Show fewer stores" : "Show all " + rows.length + " stores"}</Text>
    </Pressable> : null}
  </View>;
}

const s = StyleSheet.create({
  heading: { color: colors.text, fontSize: 16, fontWeight: "800", marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 54, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  copy: { flex: 1, minWidth: 0 },
  street: { color: colors.text, fontSize: 14, fontWeight: "700" },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  action: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 },
  link: { color: colors.accent, fontSize: 13, fontWeight: "800" },
});
