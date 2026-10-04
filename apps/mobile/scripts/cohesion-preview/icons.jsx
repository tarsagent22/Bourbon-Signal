import React from 'react';
import {Text} from 'react-native-web';
export function MaterialCommunityIcons({size=18,color,name}){return <Text aria-hidden style={{fontSize:size,color}}>{name?.includes('search')||name?.includes('magnify')?'⌕':name?.includes('chevron')?'›':name?.includes('close')?'×':'◇'}</Text>;}
export default MaterialCommunityIcons;
