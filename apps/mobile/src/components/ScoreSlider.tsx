import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { colors } from "../theme";

interface ScoreSliderProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function ScoreSlider({ value, onChange, label = "My rating" }: ScoreSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const score = clampScore(value);
  const setFromTouch = (event: GestureResponderEvent) => {
    if (!trackWidth) return;
    onChange(clampScore((event.nativeEvent.locationX / trackWidth) * 100));
  };
  const adjust = (delta: number) => onChange(clampScore(score + delta));
  const onLayout = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);

  return (
    <View style={styles.root}>
      <View style={styles.readoutRow}>
        <Text style={styles.caption}>{label.toUpperCase()}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.readout}>{(score / 10).toFixed(1)}</Text>
      </View>
      <Pressable
        accessibilityActions={[{ name: "increment", label: "Increase by 0.1" }, { name: "decrement", label: "Decrease by 0.1" }]}
        accessibilityLabel={`${label} slider`}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 10, now: score / 10, text: `${(score / 10).toFixed(1)} out of 10` }}
        onAccessibilityAction={(event) => adjust(event.nativeEvent.actionName === "increment" ? 1 : -1)}
        onLayout={onLayout}
        onPress={setFromTouch}
        onTouchMove={setFromTouch}
        style={styles.touchTrack}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${score}%` }]} />
          <View style={[styles.thumb, { left: `${score}%` }]} />
        </View>
      </Pressable>
      <View style={styles.stepRow}>
        <Pressable accessibilityLabel="Decrease rating by 0.1" accessibilityRole="button" onPress={() => adjust(-1)} style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}><Text style={styles.stepText}>−0.1</Text></Pressable>
        <Text style={styles.range}>0.0–10.0</Text>
        <Pressable accessibilityLabel="Increase rating by 0.1" accessibilityRole="button" onPress={() => adjust(1)} style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}><Text style={styles.stepText}>+0.1</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 7 },
  readoutRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  caption: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  readout: { color: colors.accent, fontSize: 30, fontWeight: "800" },
  touchTrack: { minHeight: 44, justifyContent: "center" },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.border, position: "relative" },
  fill: { height: 8, borderRadius: 999, backgroundColor: colors.accent },
  thumb: { position: "absolute", top: -8, width: 24, height: 24, marginLeft: -12, borderRadius: 12, borderColor: colors.background, borderWidth: 3, backgroundColor: colors.accent },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stepButton: { minWidth: 64, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 999, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface },
  stepText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  range: { color: colors.muted, fontSize: 11 },
  pressed: { opacity: 0.72 },
});
