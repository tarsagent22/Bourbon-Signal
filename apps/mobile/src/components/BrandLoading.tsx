import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
export function BrandLoading({label='Opening Bourbon Signal'}:{label?:string}) {
  const pulse=useRef(new Animated.Value(0)).current;const [reduceMotion,setReduceMotion]=useState(true);
  useEffect(()=>{let live=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(live)setReduceMotion(value);}).catch(()=>undefined);const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);return()=>{live=false;listener.remove();};},[]);
  useEffect(()=>{if(reduceMotion)return;const animation=Animated.loop(Animated.sequence([Animated.delay(250),Animated.timing(pulse,{toValue:1,duration:1400,useNativeDriver:true}),Animated.timing(pulse,{toValue:0,duration:0,useNativeDriver:true})]));animation.start();return()=>{animation.stop();pulse.setValue(0);};},[pulse,reduceMotion]);
  return <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.center}>
    <View style={styles.mark}>
      {!reduceMotion ? <Animated.View pointerEvents="none" style={[styles.ring, {
        opacity: pulse.interpolate({inputRange:[0,0.1,1],outputRange:[0,0.3,0]}),
        transform: [{scale:pulse.interpolate({inputRange:[0,1],outputRange:[0.8,1.5]})}],
      }]} /> : null}
      <Image accessible={false} source={require('../../assets/splash-icon.png')} resizeMode="contain" style={styles.logo}/>
    </View>
  </View>;
}
const styles=StyleSheet.create({center:{flex:1,backgroundColor:colors.background,alignItems:'center',justifyContent:'center'},mark:{width:190,height:190,alignItems:'center',justifyContent:'center'},logo:{width:190,height:190},ring:{position:'absolute',width:170,height:170,borderRadius:85,borderColor:colors.accent,borderWidth:1}});
