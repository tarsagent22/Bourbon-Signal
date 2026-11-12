import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, View } from 'react-native';

// Unreviewed entries remain explicit. A generic bottle must not masquerade as
// the product's verified image, including newly discovered inventory titles.
export function CellarBottleSilhouette({ size = 'grid', quiet = false }: { quiet?: boolean; size?: 'grid' | 'list' | 'detail' | 'showcase' | 'feed' }) {
  const width = size === 'detail' ? 180 : size === 'feed' ? 64 : size === 'showcase' ? 88 : size === 'grid' ? 80 : 44;
  const height = size === 'detail' ? 270 : size === 'feed' ? 102 : size === 'showcase' ? 148 : size === 'grid' ? 116 : 62;
  if (quiet) return <View accessible={false} style={{ width, height, justifyContent: 'center', alignItems: 'center' }}><MaterialCommunityIcons name="bottle-wine-outline" color="#716253" size={28} /></View>;
  return <View accessible accessibilityRole="text" accessibilityLabel="Bottle image awaiting verification"
    style={{width, height, alignItems:'center', justifyContent:'center', paddingHorizontal:4, borderWidth:1, borderStyle:'dashed', borderColor:'#504334', borderRadius:8}}>
    <Text maxFontSizeMultiplier={1.3} style={{color:'#A69D93', fontSize:size === 'detail' ? 14 : 10, lineHeight:size === 'detail' ? 20 : 14, textAlign:'center'}}>Image pending</Text>
  </View>;
}
