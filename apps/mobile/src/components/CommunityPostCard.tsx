import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Signal } from "../api/types";
import {
  presentSignal,
  signalAccessibilityLabel,
  signalMemberTagLabel,
  signalFeedCardAppearance,
} from "../api/presentation";
import {
  communityBadgeDescription,
  communityBadgeIcon,
  communityBadges,
  communityPhotoUrl,
} from "./community-post";
import { CellarBottleArtwork } from "./CellarBottleArtwork";
import { reportAge } from "../signals/report-age";
import { colors, fonts, typeScale } from "../theme";

export function CommunityPostCard({
  signal,
  onPress,
  highlighted = false,
  now = new Date(),
}: {
  signal: Signal;
  onPress: () => void;
  highlighted?: boolean;
  now?: Date;
}) {
  const age = reportAge(signal, now);
  const [failed, setFailed] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);
  const photoUrl = communityPhotoUrl(signal);
  const badges = communityBadges(signal);
  const presented = presentSignal(signal);
  const appearance = signalFeedCardAppearance(signal);
  const rarity =
    signal.bottle.scarcity?.nationalLabel ||
    (signal.bottle.rarityPending || !signal.bottle.id
      ? "Rarity pending"
      : appearance.rarityLabel);
  const local = signal.bottle.scarcity;
  const member = signalMemberTagLabel(signal) || "Member";
  const name = signal.source.actor?.displayName || member;
  const note = signal.evidence.summary?.trim();
  useEffect(() => {
    setFailed(false);
    setPhotoOpen(false);
    setBadgesOpen(false);
  }, [signal.id, photoUrl]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={signalAccessibilityLabel(signal, now)}
        accessibilityHint="Opens this community post"
        onPress={onPress}
        style={({ pressed }) => [
          s.card,
          age.older && { opacity: 0.78 },
          highlighted && s.highlighted,
          pressed && s.pressed,
        ]}
      >
        <View style={s.header}>
          <View style={s.identity}>
            <Text numberOfLines={1} style={s.name}>
              {name}
            </Text>
            {name !== member ? (
              <Text numberOfLines={1} style={s.member}>
                {member}
              </Text>
            ) : null}
          </View>
          {badges.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Earned badges: ${badges.join(", ")}. View badge details`}
              onPress={(event) => {
                event.stopPropagation();
                setBadgesOpen(true);
              }}
              style={s.badges}
              hitSlop={6}
            >
              {badges.map((label) => (
                <View
                  key={label}
                  style={[s.badge, / · \d{4}$/.test(label) && s.yearBadge]}
                >
                  <MaterialCommunityIcons
                    name={communityBadgeIcon(label)}
                    size={15}
                    color={colors.accent}
                  />
                </View>
              ))}
            </Pressable>
          ) : null}
          <Text style={s.time}>
            {age.label}
          </Text>
        </View>
        {age.older ? <Text style={s.member}>Older sighting · Availability may have changed</Text> : null}
        <View style={s.bottleRow}>
          <View style={s.thumbnail}>
            {photoUrl && !failed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View full photo of ${signal.bottle.name}`}
                onPress={(event) => {
                  event.stopPropagation();
                  setPhotoOpen(true);
                }}
                style={s.thumbnailPhoto}
              >
                <Image
                  source={{ uri: photoUrl }}
                  resizeMode="contain"
                  style={s.photo}
                  accessibilityLabel="Member photo approved for public display"
                  onError={() => setFailed(true)}
                />
                <View style={s.expand}>
                  <MaterialCommunityIcons
                    name="arrow-expand"
                    size={12}
                    color={colors.text}
                  />
                </View>
              </Pressable>
            ) : (
              <View
                accessible
                accessibilityLabel={`Bottle illustration for ${signal.bottle.name}`}
              >
                <CellarBottleArtwork
                  bottle={{
                    bottleId: signal.bottle.id,
                    bottleName: signal.bottle.name,
                  }}
                  size="feed"
                />
              </View>
            )}
          </View>
          <View style={s.bottleInfo}>
            <View style={s.rarityLine}>
              <View
                style={[s.rarityBadge, { backgroundColor: appearance.keyline }]}
              >
                <Text
                  style={[
                    s.rarityText,
                    {
                      color:
                        rarity === "Rarity pending"
                          ? colors.muted
                          : appearance.accent,
                    },
                  ]}
                >
                  {rarity}
                </Text>
              </View>
            </View>
            <Text style={s.bottle}>
              {signal.bottle.name}
            </Text>
            {local?.localEstablished ? (
              <Text
                numberOfLines={2}
                style={[s.member, { color: colors.accent }]}
              >
                {local.localLabel}
              </Text>
            ) : null}
          </View>
        </View>
        {note ? (
          <Text numberOfLines={2} style={s.note}>
            {note}
          </Text>
        ) : null}
        {presented.storeName || presented.geography ? (
          <View style={s.location}>
            <MaterialCommunityIcons
              name="map-marker-outline"
              size={15}
              color={colors.muted}
            />
            <Text style={s.locationText}>
              {[presented.storeName, presented.geography]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        ) : null}
        <View style={s.footer}>
          {presented.price ? (
            <Text style={s.price}>{presented.price}</Text>
          ) : null}
          {presented.quantity !== "Quantity unknown" ? (
            <Text numberOfLines={1} style={[s.member, { flexShrink: 1 }]}>
              {presented.quantity}
            </Text>
          ) : null}
          <View style={s.helpful}>
            {signal.evidence.helpfulCount > 0 ? <>
              <MaterialCommunityIcons name="hand-heart-outline" size={14} color={colors.muted} />
              <Text style={s.member}>{`${signal.evidence.helpfulCount} helpful`}</Text>
            </> : <MaterialCommunityIcons accessible={false} name="chevron-right" size={20} color={colors.accent} />}
          </View>
        </View>

      </Pressable>
      <Modal
        visible={photoOpen && !!photoUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoOpen(false)}
      >
        <View accessibilityViewIsModal style={s.photoModal}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={() => setPhotoOpen(false)}
            style={s.close}
          >
            <MaterialCommunityIcons
              name="close"
              size={24}
              color={colors.text}
            />
          </Pressable>
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              resizeMode="contain"
              style={s.fullPhoto}
              accessibilityLabel={`Full member photo of ${signal.bottle.name}`}
            />
          ) : null}
        </View>
      </Modal>
      <Modal
        visible={badgesOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBadgesOpen(false)}
      >
        <View accessibilityViewIsModal style={s.scrim}>
          <View style={s.sheet}>
            <Text style={s.name}>{name}’s featured badges</Text>
            <Text style={s.note}>
              Earned achievements this member chose to display.
            </Text>
            {badges.map((label) => (
              <View key={label} style={s.badgeDetail}>
                <MaterialCommunityIcons
                  name={communityBadgeIcon(label)}
                  size={24}
                  color={colors.accent}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.badgeLabel}>{label}</Text>
                  <Text style={s.member}>
                    {communityBadgeDescription(label)}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={s.member}>
              Dated leader badges recognize a completed month or year. They
              remain in the member’s collection.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setBadgesOpen(false)}
              style={s.done}
            >
              <Text style={s.price}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  bottleRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  bottleInfo: { flex: 1, minWidth: 0, gap: 6 },
  thumbnail: { width: 68, height: 104, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbnailPhoto: { width: "100%", height: "100%" },
  rarityLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  rarityBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  rarityText: { fontSize: 10, lineHeight: 13, fontWeight: "800" },
  card: { width: "100%", minWidth: 0, paddingVertical: 12, gap: 7 },
  highlighted: { borderLeftWidth: 2, borderLeftColor: colors.accent, backgroundColor: "rgba(214,154,74,0.10)" },
  pressed: { opacity: 0.86 },
  header: {
    paddingBottom: 4,
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  name: {
    color: colors.text,
    flexShrink: 1,
    fontSize: typeScale.small,
    lineHeight: 18,
    fontWeight: "800",
  },
  member: { color: colors.muted, fontSize: typeScale.micro, lineHeight: 15 },
  time: { color: colors.muted, fontSize: typeScale.micro, lineHeight: 15 },
  badges: { flexDirection: "row", gap: 3, minHeight: 32, alignItems: "center" },
  badge: {
    width: 23,
    height: 23,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  yearBadge: { borderColor: colors.accent },
  photoFrame: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#211C17",
  },
  photo: { width: "100%", height: "100%" },
  photoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  expand: {
    position: "absolute",
    right: 7,
    bottom: 7,
    padding: 5,
    borderRadius: 7,
    backgroundColor: "rgba(11,10,9,0.7)",
  },
  bottle: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: typeScale.subheading,
    lineHeight: 22,
  },
  note: { color: colors.text, fontSize: typeScale.small, lineHeight: 18 },
  location: { flexDirection: "row", gap: 5, alignItems: "center" },
  locationText: {
    flex: 1,
    color: colors.muted,
    fontSize: typeScale.caption,
    lineHeight: 16,
  },
  footer: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 8 },
  price: { color: colors.text, fontSize: typeScale.small, fontWeight: "800" },
  helpful: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: "auto",
  },
  photoModal: { flex: 1, backgroundColor: "#0B0A09", paddingVertical: 70 },
  fullPhoto: { width: "100%", flex: 1 },
  close: {
    position: "absolute",
    top: 45,
    right: 15,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 22,
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 16,
    gap: 14,
    borderColor: colors.border,
    borderWidth: 1,
  },
  badgeDetail: { flexDirection: "row", alignItems: "center", gap: 12 },
  badgeLabel: { color: colors.text, fontSize: typeScale.body, lineHeight: 20 },
  done: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
  },
});
