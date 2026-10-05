import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useMobileApi } from '../../../src/hooks/useMobileApi';
import { ErrorState, LoadingState } from '../../../src/components/MemberScreen';
import { colors } from '../../../src/theme';
import { workspaceStyles as s, Action } from '../../../src/components/WorkspaceUI';
import { coverageStatusLabels, type CoverageRequestItem } from '../../../../../shared/coverage-requests';
import { COVERAGE_STATES } from '../../../../../shared/coverage-states';
export default function CoverageRequestsScreen() {
  const api=useMobileApi(); const params=useLocalSearchParams<{state?:string}>();
  const [state,setState]=useState(typeof params.state==='string'?params.state:'');const [picker,setPicker]=useState(false);
  const [kind,setKind]=useState<'state'|'city'|'county'|'store'>('city');const [area,setArea]=useState('');const [store,setStore]=useState('');const [address,setAddress]=useState('');
  const [requests,setRequests]=useState<CoverageRequestItem[]>([]);const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{try{setRequests((await api.getCoverageRequests()).requests);}catch{setError('Your requests could not be loaded. Try again.');}finally{setLoading(false);}},[api]);
  useEffect(()=>{void load();},[load]);
  async function submit(){if(busy)return;setBusy(true);setError('');setMessage('');try{await api.submitCoverageRequest({targetType:kind,stateCode:state,manualCity:area,manualCounty:area,manualStoreName:store,manualAddress:address,notificationEnabled:false});setMessage('Request received. Follow its progress below.');await load();}catch(e){setError(e instanceof Error?e.message:'Request could not be saved.');}finally{setBusy(false);}}
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={s.title}>Request coverage</Text><Text style={s.copy}>Tell us where you hunt. Requests help us decide which areas and stores to cover next.</Text>
    <View style={s.card}><Text style={s.label}>State</Text><Action label={COVERAGE_STATES.find(x=>x.code===state)?.name || 'Choose a state'} onPress={()=>setPicker(true)}/>
      <Text style={s.label}>What should we cover?</Text><View style={s.wrap}>{(['city','county','store','state'] as const).map(k=><Action key={k} label={k==='state'?'Entire state':k[0].toUpperCase()+k.slice(1)} selected={kind===k} onPress={()=>setKind(k)}/>)}</View>
      {kind!=='state'?<><Text style={s.label}>{kind==='county'?'County':'City'}</Text><TextInput accessibilityLabel={kind==='county'?'County':'City'} style={s.input} value={area} onChangeText={setArea} maxLength={120}/></>:null}
      {kind==='store'?<><Text style={s.label}>Store name</Text><TextInput accessibilityLabel="Store name" style={s.input} value={store} onChangeText={setStore} maxLength={180}/><Text style={s.label}>Address (optional)</Text><TextInput accessibilityLabel="Store address" style={s.input} value={address} onChangeText={setAddress} maxLength={220}/></>:null}
      <Action label={busy?'Submitting…':'Submit request'} disabled={busy || !state || (kind!=='state'&&!area.trim()) || (kind==='store'&&!store.trim())} onPress={()=>void submit()}/>
      <Text style={s.copy}>We’ll show updates here. A request doesn’t guarantee coverage or a launch date.</Text>
    </View>
    {error?<ErrorState message={error} onRetry={()=>{setError('');void load();}}/>:null}{message?<Text accessibilityRole="alert" style={s.success}>{message}</Text>:null}
    <Text accessibilityRole="header" style={s.heading}>My coverage requests</Text>{loading?<LoadingState label="Loading requests…"/>:requests.length===0?<Text style={s.copy}>Your requests will appear here.</Text>:requests.map(r=><View key={r.id} style={s.card}><Text style={s.heading}>{r.storeName || r.areaLabel}, {r.stateCode}</Text><Text style={s.success}>{coverageStatusLabels[r.status]}</Text>{r.memberUpdate?<Text style={s.copy}>{r.memberUpdate}</Text>:null}<Text style={s.copy}>Updated {r.updatedAt.slice(0,10)}</Text></View>)}
    <Modal visible={picker} onRequestClose={()=>setPicker(false)} animationType="fade"><ScrollView style={s.screen} contentContainerStyle={s.content}><Text style={s.title}>Choose a state</Text><Action label="Close" onPress={()=>setPicker(false)}/>{COVERAGE_STATES.map(st=><Action key={st.code} label={st.name} onPress={()=>{setState(st.code);setPicker(false);}}/>)}</ScrollView></Modal>
  </ScrollView>;
}
