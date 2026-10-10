import React from 'react';
import {Pressable,Text,View} from './native';
import {MaterialCommunityIcons} from './icons';
import {BrandTitle,AlertInboxButton,PostTabButton} from '../../app/(app)/(tabs)/_layout';
import {MEMBER_TABS} from '../../src/navigation/member-tabs';
import {colors} from '../../src/theme';
import {setRoute} from './mocks';

// Only navigator chrome is simulated; titles, actions, icons and screens are real.
export function HomeChrome(){return <>
 <View style={{position:'absolute',top:6,left:16,right:10,height:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><BrandTitle/><AlertInboxButton/></View>
 <View style={{position:'absolute',bottom:0,left:0,right:0,height:76,paddingTop:6,paddingBottom:8,flexDirection:'row',backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.border}}>
 {MEMBER_TABS.map(tab=>tab.key==='post'?<PostTabButton key={tab.key} onPress={()=>setRoute('Post')}/>:<Pressable key={tab.key} accessibilityRole="button" accessibilityLabel={`Preview tab ${tab.label}`} onPress={()=>setRoute(tab.label)} style={{flex:1,alignItems:'center',gap:4,justifyContent:'center'}}><MaterialCommunityIcons name={tab.icon} color={tab.key==='home'?colors.accent:colors.muted} size={24}/><Text style={{fontSize:12,color:tab.key==='home'?colors.accent:colors.muted}}>{tab.label}</Text></Pressable>)}
 </View>
 </>;}
