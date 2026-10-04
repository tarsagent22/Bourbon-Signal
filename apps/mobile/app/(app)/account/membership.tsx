import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { openAppleSubscriptionManagement } from "../../../src/account/subscription-management";
import type { MemberProfile } from "../../../src/api/types";
import { ErrorState } from "../../../src/components/MemberScreen";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { MEMBERSHIP_PLANS, membershipActionFor, type MembershipTier } from "../../../src/membership/membership-plans";
import { usePurchases } from "../../../src/membership/PurchasesProvider";
import { deriveMobileMembershipLifecycle } from "../../../src/membership/membership-lifecycle";
import { productIdFor } from "../../../src/membership/purchases";
import { colors, typeScale, fonts } from "../../../src/theme";

const cards = [
  { tier: "standard" as const, name: "Standard", description: "Stay on top of the bottles you want, in the places you hunt.", features: ["Full state Intel & community feed", "Alerts for 5 areas & 15 bottles", "Unlimited bottles on My Shelf", "Unlimited bottle intelligence"] },
  { tier: "barrel" as const, name: "Barrel Proof", description: "Follow every bottle. Find more through the collection you love.", features: ["Everything in Standard", "Unlimited areas & watched bottles", "Advanced filters & community alerts", "Collection insights & recommendations"] },
];

export default function MembershipScreen() {
  const api = useMobileApi();
  const router = useRouter();
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const isWelcome = welcome === "1";
  const purchases = usePurchases();
  const refreshPurchases = purchases.refresh;
  useEffect(() => { void refreshPurchases(); }, [refreshPurchases]);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const operationLock = useRef(false);
  const [selected, setSelected] = useState(0);
  const carousel = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width, 520);
  const cardWidth = pageWidth - 62;
  const stride = cardWidth + 12;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => { carousel.current?.scrollTo({ x: selectedRef.current * stride, animated: false }); }, [stride]);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    try { const response = await api.getMemberProfile({ fresh }); setProfile(response.profile); setError(""); }
    catch { setProfile(null); setError("We couldn’t load your membership. Please try again."); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (purchases.profile) setProfile(purchases.profile); }, [purchases.profile]);
  const currentTier = profile ? profile.membership.tier as MembershipTier : null;
  const lifecycle = profile ? deriveMobileMembershipLifecycle({ profile, purchaseStatus: purchases.status, appleMembership: purchases.membership }) : null;
  const busy = operationBusy || ["configuring", "purchasing", "restoring"].includes(purchases.status);
  const showLifecycle = lifecycle && !["free", "active", "founder", "provider_unavailable"].includes(lifecycle.state);

  async function run(action: () => Promise<void>) {
    if (operationLock.current) return;
    operationLock.current = true;
    setOperationBusy(true); setError("");
    try { await action(); } catch { setError("That couldn’t be completed. Please try again."); }
    finally { operationLock.current = false; setOperationBusy(false); }
  }
  async function choose(tier: "standard" | "barrel") {
    const productId = productIdFor(tier, "monthly");
    const action = profile ? membershipActionFor(profile.membership.tier as MembershipTier, tier) : null;
    if (busy || !productId || action?.kind !== "upgrade" || Platform.OS !== "ios") return;
    setAttempted(true);
    await run(async () => {
      if (purchases.status !== "ready" || !purchases.products.some(p => p.productId === productId) || !purchases.eligibleProductIds.includes(productId)) {
        await refreshPurchases();
        return;
      }
      await purchases.purchase(productId);
    });
  }
  async function restore() {
    if (busy || Platform.OS !== "ios") return;
    setAttempted(true);
    await run(async () => {
      if (purchases.status !== "ready" || !purchases.restoreAvailable) { await refreshPurchases(); return; }
      await purchases.restore();
    });
  }
  const statusText = purchases.status === "pending" ? "Apple is processing your purchase. Your current access is unchanged."
    : purchases.status === "cancelled" ? "Purchase canceled. You haven’t been charged."
      : attempted && !busy && purchases.status !== "ready" ? "We couldn’t load purchase options. Try again in a moment."
        : "";

  return <View style={styles.screen}>
    <Stack.Screen options={{ title: "Bourbon Signal", headerBackTitle: "Account", ...(isWelcome ? { headerBackVisible: false, gestureEnabled: false } : {}) }} />
    <ScrollView contentContainerStyle={[styles.content, { width: pageWidth }]}>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.title}>Find your next bottle.</Text>
        <Text style={styles.subtitle}>A little more signal.{"\n"}A lot more possibility.</Text>
        {!isWelcome && currentTier ? <Text style={styles.current}>YOUR MEMBERSHIP · {MEMBERSHIP_PLANS.find(p => p.tier === currentTier)?.name}</Text> : null}
      </View>
      {loading && !profile ? <ActivityIndicator accessibilityLabel="Loading membership" color={colors.accent} /> : null}
      <View style={styles.tabs} accessibilityRole="tablist">
        {cards.map((card, index) => <Pressable key={card.tier} accessibilityRole="tab" accessibilityState={{ selected: index === selected }} accessibilityLabel={card.name}
          onPress={() => { setSelected(index); carousel.current?.scrollTo({ x: index * stride, animated: false }); }} style={[styles.tab, index === selected && styles.tabSelected]}>
          <Text style={[styles.tabText, index === selected && styles.tabTextSelected]}>{card.name}</Text>
        </Pressable>)}
      </View>
      <ScrollView ref={carousel} horizontal showsHorizontalScrollIndicator={false} snapToInterval={stride} decelerationRate="fast" disableIntervalMomentum
        contentContainerStyle={styles.track} scrollEventThrottle={16}
        onScroll={event => setSelected(Math.max(0, Math.min(1, Math.round(event.nativeEvent.contentOffset.x / stride))))}>
        {cards.map((card, index) => {
          const productId = productIdFor(card.tier, "monthly");
          const product = purchases.products.find(p => p.productId === productId);
          const action = profile ? membershipActionFor(profile.membership.tier as MembershipTier, card.tier) : null;
          const included = action?.kind === "current" || action?.kind === "included";
          const disabled = busy || !profile || included || Platform.OS !== "ios";
          const ready = purchases.status === "ready" && Boolean(product && productId && purchases.eligibleProductIds.includes(productId));
          const label = included ? action?.label : busy ? "Please wait…" : ready ? `Choose ${card.name}` : Platform.OS === "ios" ? "Check purchase options" : "Available on iPhone";
          return <View key={card.tier} style={[styles.card, { width: cardWidth }, index === 1 && styles.premium]}
            accessibilityElementsHidden={selected !== index} importantForAccessibility={selected !== index ? "no-hide-descendants" : "auto"}>
            <View style={styles.cardHeading}><Text accessibilityRole="header" style={styles.cardTitle}>{card.name}</Text><View style={styles.medallion} accessible={false}><View style={styles.glassBowl} /><View style={styles.glassStem} /><View style={styles.glassFoot} /></View></View>
            <Text style={styles.cardDescription}>{card.description}</Text>
            <View style={styles.priceRow}>{product ? <><Text style={styles.price}>{product.localizedPrice}</Text><Text style={styles.period}>/ {product.localizedPeriod}</Text></> : <Text style={styles.pricePlaceholder}>Monthly membership</Text>}</View>
            <Text style={styles.billing}>Billed monthly. Cancel anytime.</Text>
            <View style={styles.divider} />
            <View style={styles.features}>{card.features.map(feature => <View key={feature} style={styles.featureRow}><View style={[styles.checkCircle, index === 1 && styles.goldCheck]}><Text accessible={false} style={[styles.check, index === 1 && styles.goldCheckText]}>✓</Text></View><Text style={styles.feature}>{feature}</Text></View>)}</View>
            <Pressable accessibilityRole="button" accessibilityLabel={ready && !included ? `Purchase ${card.name} for ${product?.localizedPrice} per ${product?.localizedPeriod}` : label}
              accessibilityState={{ disabled, busy }} disabled={disabled} onPress={() => void choose(card.tier)}
              style={({ pressed }) => [styles.subscribe, index === 1 && styles.subscribeGold, disabled && styles.disabled, pressed && styles.pressed]}>
              <Text style={[styles.subscribeText, index === 1 && styles.subscribeGoldText]}>{label}</Text>
            </Pressable>
          </View>;
        })}
      </ScrollView>
      <View style={styles.dots} accessible={false}>{cards.map((card,index) => <View key={card.tier} style={[styles.dot, index === selected && styles.dotSelected]} />)}</View>
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/(app)/(tabs)")} style={styles.freeButton}><Text style={styles.freeText}>{currentTier && currentTier !== "free" ? "Continue to Bourbon Signal" : "Continue with Free"} <Text style={styles.gold}> →</Text></Text></Pressable>
        <Text style={styles.fine}>Subscriptions renew automatically until canceled.{"\n"}{Platform.OS === "ios" ? "Payment is charged to your Apple Account at confirmation." : "Apple subscriptions are available in the iOS app."}</Text>
        <View style={styles.links}>
          {Platform.OS === "ios" ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restore()} style={styles.link}><Text style={styles.linkText}>{purchases.status === "restoring" ? "Restoring…" : "Restore purchases"}</Text></Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Terms of Service" onPress={() => router.push("/(app)/account/terms")} style={styles.link}><Text style={styles.linkText}>Terms</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/privacy")} style={styles.link}><Text style={styles.linkText}>Privacy</Text></Pressable>
        </View>
        {statusText ? <Text accessibilityRole="alert" style={styles.status}>{statusText}</Text> : null}
        {error ? <ErrorState message={error} onRetry={() => void run(async () => { await load(); await refreshPurchases(); })} /> : null}
        {showLifecycle ? <View style={styles.lifecycle}><Text style={styles.freeText}>{lifecycle.title}</Text><Text style={styles.status}>{lifecycle.detail}</Text></View> : null}
        {currentTier === "bottled-in-bond" ? <Text style={styles.status}>Your Founder membership includes all Barrel Proof benefits for life.</Text> : null}
        <View style={styles.links}>
          {Platform.OS === "ios" && lifecycle?.manageSubscriptions ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(() => openAppleSubscriptionManagement(Linking.openURL))} style={styles.link}><Text style={styles.linkText}>Manage subscriptions in the App Store</Text></Pressable> : null}
          <Pressable accessibilityRole="button" onPress={() => router.push("/(app)/account/support")} style={styles.link}><Text style={styles.linkText}>Membership support</Text></Pressable>
        </View>
      </View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.background},content:{alignSelf:"center",paddingTop:14,paddingBottom:28},
  hero:{paddingHorizontal:20,alignItems:"center",gap:8},title: {fontFamily: fonts.heading, fontSize: typeScale.title,lineHeight: 40,fontWeight: "700",letterSpacing:-1,color:colors.text,textAlign:"center"},subtitle:{fontSize: typeScale.small,lineHeight:20,color:colors.muted,textAlign:"center"},current:{fontSize: typeScale.caption,color:colors.muted,marginTop:2},
  tabs:{marginHorizontal:24,marginTop:15,marginBottom:16,padding:4,flexDirection:"row",gap:4,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:"#12100e"},tab:{flex:1,minHeight:40,justifyContent:"center",alignItems:"center",borderRadius:8,padding:4},tabSelected:{backgroundColor:"#31281f"},tabText:{fontSize: typeScale.small,fontWeight:"600",color:colors.muted},tabTextSelected:{color:colors.text},
  track:{paddingLeft:24,paddingRight:38,gap:12,paddingBottom:8},card:{borderRadius:22,borderWidth:1,borderColor:"#493b2f",padding:23,minHeight:416,backgroundColor:"#1c1713"},premium:{borderColor:colors.accent,backgroundColor:"#241c13"},cardHeading:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},cardTitle:{fontSize:23,lineHeight:29,fontWeight:"600",letterSpacing:-0.6,color:colors.text,flexShrink:1},medallion:{width:29,height:29,borderRadius:9,borderWidth:1,borderColor:"#62503a",alignItems:"center",justifyContent:"center"},glassBowl:{width:11,height:12,borderWidth:1,borderColor:colors.accent,borderBottomLeftRadius:6,borderBottomRightRadius:6},glassStem:{width:1,height:4,backgroundColor:colors.accent},glassFoot:{width:9,height:1,backgroundColor:colors.accent},cardDescription:{fontSize: typeScale.small,lineHeight:19,color:colors.muted,marginTop:10,marginBottom:12,minHeight:38},
  priceRow:{flexDirection:"row",alignItems:"baseline",flexWrap:"wrap",minHeight:64},price:{fontSize:56,lineHeight:64,fontWeight:"600",letterSpacing:-2,color:colors.text},period:{fontSize: typeScale.small,color:colors.muted,marginLeft:6},pricePlaceholder:{fontSize:24,lineHeight:34,color:colors.text},billing:{fontSize: typeScale.caption,lineHeight:16,color:colors.muted,marginTop:7},divider:{height:1,backgroundColor:"#55443266",marginTop:14,marginBottom:14},features:{gap:10,marginBottom:18},featureRow:{flexDirection:"row",alignItems:"flex-start",gap:9},checkCircle:{height:16,width:16,borderRadius:8,backgroundColor:"#51443688",alignItems:"center",justifyContent:"center",marginTop:1},goldCheck:{backgroundColor:colors.accent},check:{fontSize: typeScale.caption,color:"#cfb89b"},goldCheckText:{color:"#1b130a"},feature:{flex:1,fontSize: typeScale.small,lineHeight:18,color:"#e4dace"},subscribe:{marginTop:"auto",minHeight:47,padding:10,borderWidth:1,borderColor:"#816342",borderRadius:12,backgroundColor:"#30261c",alignItems:"center",justifyContent:"center"},subscribeGold:{backgroundColor:colors.accent,borderColor:"#e1ad68"},subscribeText:{fontSize: typeScale.small,lineHeight:18,fontWeight:"600",color:colors.text,textAlign:"center"},subscribeGoldText:{color:"#21160a"},disabled:{opacity:0.5},pressed:{opacity:0.75},
  dots:{flexDirection:"row",justifyContent:"center",gap:6,paddingTop:1,paddingBottom:7},dot:{height:5,width:5,borderRadius:5,backgroundColor:"#5a4b3a"},dotSelected:{width:17,backgroundColor:colors.accent},footer:{paddingHorizontal:21,alignItems:"center"},freeButton:{minHeight:44,justifyContent:"center",paddingHorizontal:12},freeText:{fontSize: typeScale.small,fontWeight:"600",color:colors.text,textAlign:"center"},gold:{color:colors.accent},fine:{fontSize: typeScale.caption,lineHeight:16,color:colors.muted,textAlign:"center",marginTop:2,marginBottom:3},links:{flexDirection:"row",justifyContent:"center",flexWrap:"wrap",columnGap:19},link:{minHeight:44,justifyContent:"center"},linkText:{fontSize: typeScale.caption,color:"#bfa785",textAlign:"center"},status:{fontSize: typeScale.small,lineHeight:18,color:colors.muted,textAlign:"center",marginVertical:8},lifecycle:{padding:12,borderRadius:12,backgroundColor:colors.surfaceRaised},
});
