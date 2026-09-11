import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { colors } from "../theme";
import { scoreFromTrackPageX } from "./score-slider-gesture";

interface ScoreSliderProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  onInteractionStart?: () => void;
  onDraggingChange?: (dragging: boolean) => void;
}

function clampScore(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

export function ScoreSlider({ value, onChange, label = "My rating", onInteractionStart, onDraggingChange }: ScoreSliderProps) {
  const trackRef = useRef<View>(null);
  const trackBounds = useRef({ left: 0, width: 0 });
  const score = clampScore(value);
  const [entry, setEntry] = useState((score / 10).toFixed(1));
  const editingEntry = useRef(false);
  const callbacks = useRef({ onChange, onDraggingChange });
  callbacks.current = { onChange, onDraggingChange };
  const gesture = useRef({ active: false, pendingX: null as number | null, generation: 0 });
  const measurementPending = useRef(false);

  useEffect(() => () => {
    gesture.current.generation++;
    gesture.current.pendingX = null;
    if (gesture.current.active) callbacks.current.onDraggingChange?.(false);
  }, []);

  useEffect(() => {
    if (!editingEntry.current) setEntry((score / 10).toFixed(1));
  }, [score]);

  const beginInteraction = useCallback(() => {
    Keyboard.dismiss();
    onInteractionStart?.();
  }, [onInteractionStart]);
  const setFromPageX = useCallback((pageX: number) => {
    const next = scoreFromTrackPageX(pageX, trackBounds.current.left, trackBounds.current.width);
    if (next !== null) callbacks.current.onChange(next);
  }, []);
  const measureTrack = useCallback(() => {
    const generation = gesture.current.generation;
    measurementPending.current = true;
    trackRef.current?.measureInWindow((left, _top, width) => {
      if (generation !== gesture.current.generation || !Number.isFinite(left) || !(width > 0)) return;
      measurementPending.current = false;
      trackBounds.current = { left, width };
      // Native measurement is asynchronous. Replay the latest point (including
      // a release), never the captured grant or an earlier gesture's coordinate.
      if (gesture.current.pendingX !== null) {
        setFromPageX(gesture.current.pendingX);
        if (!gesture.current.active) gesture.current.pendingX = null;
      }
    });
  }, [setFromPageX]);
  const handleResponderGrant = (event: GestureResponderEvent) => {
    const pageX = event.nativeEvent.pageX;
    gesture.current = { active: true, pendingX: pageX, generation: gesture.current.generation + 1 };
    callbacks.current.onDraggingChange?.(true);
    beginInteraction();
    measureTrack();
    setFromPageX(pageX);
  };
  const handleResponderMove = (event: GestureResponderEvent) => {
    if (!gesture.current.active) return;
    gesture.current.pendingX = event.nativeEvent.pageX;
    setFromPageX(event.nativeEvent.pageX);
  };
  const handleResponderRelease = (event: GestureResponderEvent) => {
    if (!gesture.current.active) return;
    gesture.current.pendingX = event.nativeEvent.pageX;
    setFromPageX(event.nativeEvent.pageX);
    gesture.current.active = false;
    if (!measurementPending.current) gesture.current.pendingX = null;
    callbacks.current.onDraggingChange?.(false);
  };
  const handleResponderTerminate = () => {
    gesture.current = { active: false, pendingX: null, generation: gesture.current.generation + 1 };
    callbacks.current.onDraggingChange?.(false);
  };
  const adjust = (delta: number) => {
    gesture.current.generation++;
    gesture.current.pendingX = null;
    measurementPending.current = false;
    beginInteraction();
    onChange(clampScore(score + delta));
  };
  const onLayout = (_event: LayoutChangeEvent) => measureTrack();
  const commitEntry = () => {
    if (!editingEntry.current) return;
    gesture.current.generation++;
    gesture.current.pendingX = null;
    measurementPending.current = false;
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
        collapsable={false}
        accessibilityActions={[{ name: "increment", label: "Increase by 0.1" }, { name: "decrement", label: "Decrease by 0.1" }]}
        accessibilityLabel={`${label} slider`}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 10, now: score / 10, text: `${(score / 10).toFixed(1)} out of 10` }}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") adjust(1);
          if (event.nativeEvent.actionName === "decrement") adjust(-1);
        }}
        onLayout={onLayout}
        onResponderGrant={handleResponderGrant}
        onResponderMove={handleResponderMove}
        onResponderRelease={handleResponderRelease}
        onResponderTerminate={handleResponderTerminate}
        onResponderTerminationRequest={() => false}
        onStartShouldSetResponder={() => true}
        ref={trackRef}
        style={styles.touchTrack}
      >
        <View pointerEvents="none" style={styles.track}>
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
