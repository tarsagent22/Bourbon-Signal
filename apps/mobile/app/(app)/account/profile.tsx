import { useCallback, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  View,
  Pressable,
  StyleSheet,
} from "react-native";
import type { MemberProfile } from "../../../src/api/types";
import { useMobileApi } from "../../../src/hooks/useMobileApi";
import { useScreenRevalidation } from "../../../src/hooks/useScreenRevalidation";
import { useAccessibleStatus } from "../../../src/hooks/useAccessibleStatus";
import {
  ErrorState,
  LoadingState,
  MemberCard,
  memberScreenStyles,
} from "../../../src/components/MemberScreen";
import { colors } from "../../../src/theme";
export default function ProfileScreen() {
  const api = useMobileApi();
  const sequence = useRef(0);
  const [profile, setProfile] = useState<MemberProfile["profile"] | null>(null);
  const [error, setError] = useState("");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameError, setDisplayNameError] = useState("");
  const [displayNameSuccess, setDisplayNameSuccess] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(true);
  useAccessibleStatus(displayNameError || displayNameSuccess);
  const load = useCallback(async (fresh = false) => {
    const id = ++sequence.current;
    try {
      const result = await api.getMemberProfile({ fresh });
      if (id !== sequence.current) return;
      setProfile(result.profile);
      setDisplayNameDraft(result.profile.customDisplayName || "");
      setError("");
    } catch (e) {
      if (id === sequence.current)
        setError(e instanceof Error ? e.message : "Profile unavailable.");
    }
  }, [api]);
  useScreenRevalidation(load);
  const trimmedDisplayName = displayNameDraft.trim();
  const displayNameDirty =
    trimmedDisplayName !== (profile?.customDisplayName || "") &&
    trimmedDisplayName.length > 0;
  async function saveDisplayName(displayName: string | null) {
    setSavingDisplayName(true);
    setDisplayNameError("");
    setDisplayNameSuccess("");
    try {
      const next = await api.updateMemberProfile({ displayName });
      setProfile(next.profile);
      setDisplayNameDraft(next.profile.customDisplayName || "");
      setDisplayNameSuccess(
        displayName === null
          ? "Display name removed. Your member tag is unchanged."
          : "Display name saved.",
      );
      setEditingDisplayName(false);
    } catch (caught) {
      setDisplayNameError(
        caught instanceof Error
          ? caught.message
          : "Public name could not be saved.",
      );
    } finally {
      setSavingDisplayName(false);
    }
  }

  return (
    <ScrollView
      style={memberScreenStyles.screen}
      contentContainerStyle={memberScreenStyles.content}
    >
      {error ? (
        <ErrorState message={error} onRetry={() => void load(true)} />
      ) : !profile ? (
        <LoadingState />
      ) : (
        ""
      )}
      {profile ? (
        <MemberCard>
          <View style={styles.settingSummary}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingLabel}>Display name</Text>
              <Text style={styles.settingValue}>
                {profile.customDisplayName || "No display name set"}
              </Text>
              <Text style={styles.muted}>
                Shown beside {profile.identity?.label || "your member tag"} on
                Community sightings. The tag never changes.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (editingDisplayName)
                  setDisplayNameDraft(profile.customDisplayName || "");
                setEditingDisplayName((value) => !value);
                setDisplayNameError("");
                setDisplayNameSuccess("");
              }}
              style={({ pressed }) => [
                styles.editButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.editButtonText}>
                {editingDisplayName ? "Cancel" : "Edit"}
              </Text>
            </Pressable>
          </View>
          {editingDisplayName ? (
            <View style={styles.nameEditor}>
              <TextInput
                accessibilityLabel="Display name"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!savingDisplayName}
                maxLength={32}
                onChangeText={(value) => {
                  setDisplayNameDraft(value);
                  setDisplayNameError("");
                  setDisplayNameSuccess("");
                }}
                placeholder="Choose a display name"
                placeholderTextColor={colors.muted}
                style={styles.displayNameInput}
                value={displayNameDraft}
              />
              <Text style={styles.characterCount}>
                {displayNameDraft.length}/32
              </Text>
              {displayNameError ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {displayNameError}
                </Text>
              ) : null}
              <View style={styles.nameActions}>
                {profile.customDisplayName ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={savingDisplayName}
                    onPress={() => void saveDisplayName(null)}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>
                      Remove display name
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={!displayNameDirty || savingDisplayName}
                  onPress={() => void saveDisplayName(trimmedDisplayName)}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryPressed,
                    (!displayNameDirty || savingDisplayName) && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>
                    {savingDisplayName ? "Saving…" : "Save name"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {displayNameSuccess ? (
            <Text accessibilityRole="alert" style={styles.success}>
              {displayNameSuccess}
            </Text>
          ) : null}
        </MemberCard>
      ) : null}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  settingSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  settingCopy: { flex: 1, gap: 3 },
  settingLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  settingValue: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },
  editButton: {
    minHeight: 44,
    minWidth: 56,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  editButtonText: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  nameEditor: {
    gap: 9,
    paddingTop: 8,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  displayNameInput: {
    minHeight: 48,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.background,
    color: colors.text,
    paddingHorizontal: 13,
    fontSize: 16,
  },
  characterCount: { color: colors.muted, fontSize: 12, textAlign: "right" },
  nameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  primaryButton: {
    minHeight: 44,
    backgroundColor: colors.accent,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 10,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  success: { color: colors.success, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.72 },
  primaryPressed: { backgroundColor: colors.accentPressed },
  disabled: { opacity: 0.45 },
});
