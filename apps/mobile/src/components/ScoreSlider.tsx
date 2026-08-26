import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { colors } from "../theme";
import { classifyScoreSliderGesture, type ScoreSliderGestureIntent } from "./score-slider-gesture";

interface ScoreSliderProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

function clampScore(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

export function ScoreSlider({ value, onChange, label = "My rating" }: ScoreSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const score = clampScore(value);
  const [entry, setEntry] = useState((score / 10).toFixed(1));
  const editingEntry = useRef(false);
  const gesture = useRef({ grantX: 0, grantY: 0, intent: "pending" as ScoreSliderGestureIntent });

  useEffect(() => {
    if (!editingEntry.current) setEntry((score / 10).toFixed(1));
  }, [score]);

  const setFromResponder = (event: GestureResponderEvent) => {
    if (!trackWidth) return;
    const locationX = Math.max(0, Math.min(trackWidth, event.nativeEvent.locationX));
    onChange(clampScore((locationX / trackWidth) * 100));
  };
  const resetGesture = () => {
    gesture.current = { grantX: 0, grantY: 0, intent: "pending" };
  };
  const adjust = (delta: number) => onChange(clampScore(score + delta));
  const onLayout = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);
  const commitEntry = () => {
    if (!editingEntry.current) return;
    editingEntry.current = false;
    const parsed = Number(entry.trim());
    if (!Number.isFinite(parsed)) {
      setEntry((score / 10).toFixed(1));
      return;
    }
    const nextScore = clampScore(Math.max(0, Math.min(10, parsed)) * 10);
    setEntry((nextScore / 10).toFixed(1));
    if (nextScore !== score) onChange(nextScore);
  };

  return (
    <View style={styles.root}>
      <View style={styles.readoutRow}>
        <Text style={styles.caption}>{label.toUpperCase()}</Text>
        <TextInput
          accessibilityLabel={`${label} direct entry`}
          keyboardType="decimal-pad"
          maxLength={4}
          onBlur={commitEntry}
          onChangeText={setEntry}
          onFocus={() => {
            editingEntry.current = true;
            setEntry((score / 10).toFixed(1));
          }}
          onSubmitEditing={commitEntry}
          selectTextOnFocus
          submitBehavior="blurAndSubmit"
          style={styles.readout}
          value={entry}
        />
      </View>
      <View
        accessible
        accessibilityActions={[{ name: "increment", label: "Increase by 0.1" }, { name: "decrement", label: "Decrease by 0.1" }]}
        accessibilityLabel={`${label} slider`}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 10, now: score / 10, text: `${(score / 10).toFixed(1)} out of 10` }}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") adjust(1);
          if (event.nativeEvent.actionName === "decrement") adjust(-1);
        }}
        onLayout={onLayout}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          gesture.current = { grantX: event.nativeEvent.pageX, grantY: event.nativeEvent.pageY, intent: "pending" };
        }}
        onResponderMove={(event) => {
          if (gesture.current.intent === "pending") {
            gesture.current.intent = classifyScoreSliderGesture(
              event.nativeEvent.pageX - gesture.current.grantX,
              event.nativeEvent.pageY - gesture.current.grantY,
            );
          }
          if (gesture.current.intent === "horizontal") setFromResponder(event);
        }}
        onResponderRelease={(event) => {
          if (gesture.current.intent !== "vertical") setFromResponder(event);
          resetGesture();
        }}
        onResponderTerminate={resetGesture}
        onResponderTerminationRequest={() => gesture.current.intent !== "horizontal"}
        onStartShouldSetResponder={() => true}
        style={styles.touchTrack}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${score}%` }]} />
          <View style={[styles.thumb, { left: `${score}%` }]} />
        </View>
      </View>
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
  readoutRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  caption: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  readout: { minWidth: 76, minHeight: 44, paddingHorizontal: 10, paddingVertical: 0, textAlign: "right", color: colors.accent, fontSize: 28, fontWeight: "800", borderColor: colors.border, borderWidth: 1, borderRadius: 10, backgroundColor: colors.surface },
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
