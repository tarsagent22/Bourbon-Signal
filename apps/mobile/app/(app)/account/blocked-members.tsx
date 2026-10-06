import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useMobileApi } from '../../../src/hooks/useMobileApi';
import { colors, typeScale } from '../../../src/theme';
export default function BlockedMembersScreen(){
  const api=useMobileApi();
  const [blocks,setBlocks]=useState<Array<{id:string;label:string;createdAt:string}>>([]);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState('');
  const [error,setError]=useState('');
  const load=useCallback(async()=>{setLoading(true);setError('');try{setBlocks((await api.getBlockedMembers()).blocks);}catch(e){setError(e instanceof Error?e.message:'Blocked members could not load.');}finally{setLoading(false);}},[api]);
  useEffect(()=>{void load();},[load]);
  async function unblock(id:string){setWorking(id);setError('');try{await api.saveCommunitySafety({action:'unblock',memberId:id});setBlocks(rows=>rows.filter(row=>row.id!==id));}catch(e){setError(e instanceof Error?e.message:'Your change could not be saved.');}finally{setWorking('');}}
  return <ScrollView contentContainerStyle={{padding:20,gap:16,backgroundColor:colors.background,flexGrow:1}}>
    <Stack.Screen options={{title:'Blocked members'}} />
    <Text style={{color:colors.text,fontSize:typeScale.subheading,fontWeight:'700'}}>Blocked members</Text>
    <Text style={{color:colors.muted,lineHeight:22}}>Blocked members’ posts and future Community alerts are hidden from your account. Unblocking makes their posts available again.</Text>
    {loading?<ActivityIndicator color={colors.accent}/>:null}
    {error?<View><Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load()} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.accent}}>Try again</Text></Pressable></View>:null}
    {!loading&&!error&&!blocks.length?<Text style={{color:colors.muted}}>You haven’t blocked any members.</Text>:null}
    {blocks.map(row=><View key={row.id} style={{padding:16,borderWidth:1,borderColor:colors.border,borderRadius:12,gap:8}}><Text style={{color:colors.text}}>{row.label}</Text><Text style={{color:colors.muted}}>Blocked {new Date(row.createdAt).toLocaleDateString()}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Unblock ${row.label}`} disabled={Boolean(working)} onPress={()=>void unblock(row.id)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.accent}}>{working===row.id?'Saving…':'Unblock member'}</Text></Pressable></View>)}
  </ScrollView>;
}
