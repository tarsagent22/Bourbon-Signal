import { useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MemberCollectionBottle } from '../api/types';
import { collectionInventoryLabel, formatCollectionRating, type collectionStatistics } from '../interactions/member-interactions';
import { colors } from '../theme';

type Statistics = ReturnType<typeof collectionStatistics>;
export function CollectionStatisticsSheet({ visible, statistics, ranked, onClose, onDismiss }: {
  visible: boolean; statistics: Statistics; ranked: readonly MemberCollectionBottle[]; onClose: () => void; onDismiss: () => void;
}) {
  const heading = useRef<Text>(null);
  const focusHeading = () => {
    if (Platform.OS === 'web') { (heading.current as unknown as {focus?: () => void})?.focus?.(); return; }
    const node = findNodeHandle(heading.current);
    if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
  };
  const s = statistics;
  return <Modal visible={visible} animationType="none" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onDismiss} onShow={focusHeading}>
    <SafeAreaView style={styles.frame} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <View style={styles.header}><Text ref={heading} accessible accessibilityRole="header" style={styles.title}>Collection Statistics</Text><Pressable accessibilityRole="button" accessibilityLabel="Close collection statistics" onPress={onClose} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.copy}>Your whole collection, regardless of search or filters.</Text>
        <Stat label="Bottles on hand" value={String(s.ownedBottleCount)} detail={`${s.ownedWhiskeyCount} unique owned entries`} />
        <Stat label="Sealed bottles" value={String(s.sealedBottleCount)} />
        <Stat label="Open bottles" value={String(s.openBottleCount)} />
        <Stat label="Tasted only" value={String(s.tastedOnlyCount)} detail="Saved entries with no bottles on hand" />
        <Stat label="Your average rating" value={s.averageRating == null ? 'Not rated yet' : `${(s.averageRating / 10).toFixed(1)} / 10`} detail={`${s.ratedCount} rated entries across owned and tasted only. Each entry counts once, including a rating of zero; unrated entries do not count.`} />
        <Stat label="Most-represented distillery" value="Unavailable" detail="No verified distillery data is attached to your collection. Brands and bottlers are not counted as distilleries." />
        <Stat label="Highest personally rated owned" value={s.highestRatedOwned ? `${formatCollectionRating(s.highestRatedOwned)} / 10` : 'Not rated yet'} detail={s.highestRatedOwned ? `${s.highestRatedOwned.bottleName}. Ties retain collection order; up to 20 entries are listed in Top Rated below.` : 'Rate a bottle you own to see it here.'} />
        <Stat label="Collection worth" value="Coming later" />
        <Text accessibilityRole="header" style={styles.sectionTitle}>Top Rated</Text>
        <Text style={styles.copy}>Your top 20 personally rated owned entries. Full bottle names and inventory, in shelf order.</Text>
        {ranked.length ? ranked.map((bottle, index) => <View key={bottle.bottleId || `${bottle.canonicalKey}:${bottle.bottleName}`} accessible style={styles.row}>
          <Text style={styles.label}>{index + 1}. {bottle.bottleName}</Text>
          <Text style={styles.value}>{formatCollectionRating(bottle)} / 10</Text>
          <Text style={styles.copy}>{collectionInventoryLabel(bottle)}</Text>
        </View>) : <Text style={styles.copy}>No personally rated owned bottles yet.</Text>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
function Stat({label,value,detail}:{label:string;value:string;detail?:string}) {
  return <View accessible style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text>{detail ? <Text style={styles.copy}>{detail}</Text> : null}</View>;
}
const styles=StyleSheet.create({
  frame:{flex:1,backgroundColor:colors.background},header:{paddingHorizontal:20,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:12},title:{flex:1,color:colors.text,fontSize:21,fontWeight:'600'},close:{minHeight:44,minWidth:44,justifyContent:'center'},closeText:{color:colors.accent,fontSize:16},content:{paddingHorizontal:20,paddingBottom:32,gap:16},row:{gap:5,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},label:{color:colors.text,fontSize:16,fontWeight:'500'},value:{color:colors.accent,fontSize:22},copy:{color:colors.muted,fontSize:14,lineHeight:21},sectionTitle:{color:colors.text,fontSize:22,fontWeight:'600',paddingTop:12},
});
