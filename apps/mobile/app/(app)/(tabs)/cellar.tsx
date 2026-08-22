import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileApiError } from "../../../src/api/client";
import type { MemberCollectionBottle, MemberPreferences } from "../../../src/api/types";
import { EmptyState, ErrorState, LoadingState, MemberCard, ScreenIntro, SectionTitle, memberScreenStyles } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { colors } from "../../../src/theme";

export default function CellarScreen() {
  const api = useMobileApi();

  const [preferences, setPreferences] = useState<MemberPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPreferences(await api.getMemberPreferences());
    } catch (caught) {
      setError(caught instanceof MobileApiError && caught.status === 401 ? "Your session could not be verified. Return to Signals and retry." : caught instanceof Error ? caught.message : "Your Cellar is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);
  const canUseCollection = preferences?.entitlements?.canUseCollection === true;
  const bottles = useMemo(() => [...(preferences?.collectionPreferences.bottles || [])].sort((a, b) => b.rating - a.rating || a.bottleName.localeCompare(b.bottleName)), [preferences]);

  return (
    <ScrollView
      contentContainerStyle={memberScreenStyles.content}
      refreshControl={<RefreshControl refreshing={loading && Boolean(preferences)} onRefresh={load} tintColor={colors.accent} />}
      style={memberScreenStyles.screen}
    >
      <ScreenIntro eyebrow="Your bottles" title="Cellar" description="A personal collection—not another alert dashboard. Ratings, notes, and taste tags stay attached to the bottles you saved." />
      {loading && !preferences ? <LoadingState label="Opening your Cellar…" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {preferences && !canUseCollection ? <EmptyState title="Cellar is not included with this membership" detail="HQ shows the membership recognized by the app. Saved collection data remains private and is not displayed without collection access." /> : null}
      {preferences && canUseCollection ? <View style={memberScreenStyles.section}>
        <SectionTitle detail={`${bottles.length} ${bottles.length === 1 ? "bottle" : "bottles"}`}>Collection</SectionTitle>
        {bottles.length ? bottles.map((bottle) => <BottleCard bottle={bottle} key={bottle.canonicalKey} />)
          : <EmptyState title="Your Cellar is empty" detail="Bottles you save to your collection on Bourbon Signal will appear here under the same member account." />}
      </View> : null}
    </ScrollView>
  );
}

function BottleCard({ bottle }: { bottle: MemberCollectionBottle }) {
  const tags = bottle.tasteTags?.filter(Boolean).slice(0, 4) || [];
  return (
    <MemberCard>
      <View style={styles.heading}>
        <View style={styles.copy}><Text style={styles.name}>{bottle.bottleName}</Text><Text style={styles.added}>Added {new Date(bottle.addedAt).toLocaleDateString()}</Text></View>
        <View style={styles.rating}><Text style={styles.ratingValue}>{bottle.rating || "—"}</Text><Text style={styles.ratingLabel}>RATING</Text></View>
      </View>
      {tags.length ? <View style={styles.tags}>{tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View> : null}
      {bottle.notes ? <Text style={styles.notes}>{bottle.notes}</Text> : null}
      <Text style={styles.buyAgain}>{bottle.wouldBuyAgain ? "Would buy again" : "Not marked to buy again"}</Text>
    </MemberCard>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  copy: { flex: 1, gap: 4 },
  name: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "700" },
  added: { color: colors.muted, fontSize: 12 },
  rating: { minWidth: 52, alignItems: "center", borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 13 },
  ratingValue: { color: colors.accent, fontSize: 22, fontWeight: "800" },
  ratingLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tag: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  tagText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  notes: { color: colors.text, fontSize: 13, lineHeight: 19 },
  buyAgain: { color: colors.muted, fontSize: 12 },
});
