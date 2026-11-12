import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { colors } from '../theme';

export function ProfileBackButton() {
  const router = useRouter();
  return <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
    <MaterialCommunityIcons name="chevron-left" color={colors.text} size={27} />
  </Pressable>;
}
