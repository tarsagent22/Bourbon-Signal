import React from 'react';
import {Text} from 'react-native-web';
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';
export function MaterialCommunityIcons({size=18,color,name}){return <Text aria-hidden style={{fontFamily:'MaterialCommunityIcons',fontSize:size,lineHeight:size+2,color}}>{String.fromCodePoint(glyphs[name] || glyphs['medal-outline'])}</Text>;}
export default MaterialCommunityIcons;
