import { Text, View } from 'react-native';
import { colors } from '../theme';
import type { ScannerProps } from './scanner-types';

export function NativeBottleScanner(_props: ScannerProps) {
  return <View style={{ minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.surface, borderRadius: 24 }}><Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 22 }}>Live scanning is available in the iPhone and Android app. You can search by name here.</Text></View>;
}
