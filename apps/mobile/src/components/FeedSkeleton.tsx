import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "../theme";

// Each shape clips the same moving light, so a single sweep crosses the row.
function Shape({ sweep, left, style }: { sweep: Animated.AnimatedInterpolation<number>; left: number; style: ViewStyle }) {
  return <View style={[styles.shape, style]}>
    <Animated.View style={[styles.light, { left: -left, transform: [{ translateX: sweep }] }]}>
      {[0.025, 0.045, 0.07, 0.1, 0.07, 0.045, 0.025].map((opacity, index) =>
        <View key={index} style={{ width: 14, height: "100%", backgroundColor: colors.accent, opacity }} />)}
    </Animated.View>
  </View>;
}

export function FeedSkeleton({ community = false }: { community?: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(320);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    let live = true;
    let changed = false;
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", value => { changed = true; setReduceMotion(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live && !changed) setReduceMotion(value); }).catch(() => undefined);
    const app = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => { live = false; motion.remove(); app.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion || !active) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true, isInteraction: false }),
      Animated.delay(600),
    ]));
    animation.start();
    return () => { animation.stop(); progress.setValue(0); };
  }, [active, progress, reduceMotion]);

  const sweep = progress.interpolate({ inputRange: [0, 1], outputRange: [-110, width + 110] });
  const copyLeft = community ? 48 : 78;
  const copyWidth = Math.max(40, width - copyLeft - 22);
  const summaryWidth = Math.min(100, Math.max(20, copyWidth - 80));
  const summaryLeft = copyLeft + copyWidth - summaryWidth;
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={community ? "Loading Community" : "Loading Intel"} accessibilityState={{ busy: true }}
    onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none">
      {[0, 1, 2].map(item => <View key={item} style={[styles.row, community && styles.communityRow]}>
        {community ? <Shape sweep={sweep} left={0} style={{ left: 0, top: 12, width: 34, height: 34, borderRadius: 17 }} /> : <>
          <Shape sweep={sweep} left={27} style={{ left: 27, top: 35, width: 14, height: 28, borderRadius: 3 }} />
          <Shape sweep={sweep} left={20} style={{ left: 20, top: 61, width: 28, height: 76, borderRadius: 7 }} />
        </>}
        <Shape sweep={sweep} left={copyLeft} style={{ left: copyLeft, top: 12, width: 74, height: 16, borderRadius: 8 }} />
        {!community ? <Shape sweep={sweep} left={summaryLeft} style={{ left: summaryLeft, top: 14, width: summaryWidth, height: 11, borderRadius: 4 }} /> : null}
        <Shape sweep={sweep} left={copyLeft} style={{ left: copyLeft, top: 37, width: copyWidth * 0.91, height: 20, borderRadius: 4 }} />
        <Shape sweep={sweep} left={copyLeft} style={{ left: copyLeft, top: 67, width: copyWidth * 0.76, height: 12, borderRadius: 4 }} />
        <Shape sweep={sweep} left={copyLeft} style={{ left: copyLeft, top: 88, width: copyWidth * 0.37, height: 11, borderRadius: 4 }} />
        <Shape sweep={sweep} left={copyLeft} style={{ left: copyLeft, top: 111, width: copyWidth * 0.85, height: 13, borderRadius: 4 }} />
        <Shape sweep={sweep} left={copyLeft} style={{ left: copyLeft, top: 134, width: copyWidth * 0.58, height: 10, borderRadius: 4 }} />
        {item < 2 ? <View style={[styles.separator, { left: copyLeft }]} /> : null}
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { height: 156 },
  communityRow: { height: 174 },
  shape: { position: "absolute", overflow: "hidden", backgroundColor: "rgba(185,170,152,0.075)" },
  light: { position: "absolute", top: 0, bottom: 0, width: 98, flexDirection: "row" },
  separator: { position: "absolute", right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(185,170,152,0.12)" },
});
