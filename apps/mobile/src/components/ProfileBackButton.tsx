import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

export function ProfileHeader() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  return <View style={[styles.bar, { paddingTop: top }]}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/(tabs)");
      }} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="chevron-left" size={27} color={colors.accent} />
      </Pressable>
      <Text style={styles.title}>Bottle Profile</Text>
      <View style={styles.balance} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  bar: { backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  back: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  pressed: { backgroundColor: colors.surfaceRaised },
  balance: { width: 44 },
  title: { flex: 1, textAlign: "center", color: colors.text, fontSize: 15, fontWeight: "700" },
});
