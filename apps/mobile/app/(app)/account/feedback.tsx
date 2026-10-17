import {useRef,useState} from 'react';
import {KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams} from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as Crypto from 'expo-crypto';
import {Action,workspaceStyles as s} from '../../../src/components/WorkspaceUI';
import {useMobileApi} from '../../../src/hooks/useMobileApi';
import {feedbackInput,type FeedbackKind} from '../../../../../shared/member-feedback';
import { routeText } from '../../../src/continuity/bottle-handoff';
export default function FeedbackScreen(){
 const api=useMobileApi(),params=useLocalSearchParams<{kind?:string;screen?:string;context?:string}>();
 const [kind,setKind]=useState<FeedbackKind>(params.kind==='suggestion'?'suggestion':'problem');
 const [message,setMessage]=useState(''),[steps,setSteps]=useState(typeof params.context==='string'?params.context.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,1500):''),[screen,setScreen]=useState(routeText(params.screen,100));
 const [error,setError]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false);
 const pending=useRef<{key:string;id:string}|null>(null),locked=useRef(false);
 async function submit(){
  if(locked.current)return;setError('');
  const key=JSON.stringify({kind,message,steps,screen});if(pending.current?.key!==key)pending.current={key,id:Crypto.randomUUID()};
  const input=feedbackInput({id:pending.current.id,kind,message,steps,screen,context:{platform:Platform.OS,version:Constants.nativeAppVersion||Constants.expoConfig?.version||'unknown',build:Constants.nativeBuildVersion||'unknown',runtime:Updates.runtimeVersion||'embedded',update:Updates.updateId||'embedded'}});
  if(!input){setError('Please describe your feedback in at least 10 characters.');return;}
  locked.current=true;setBusy(true);
  try{await api.submitFeedback(input);setSent(true);setMessage('');setSteps('');setScreen('');pending.current=null;}
  catch(e){setError(e instanceof Error?e.message:'Could not send. Your message is still here; please retry.');}
  finally{locked.current=false;setBusy(false);}
 }
 return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
  <Text accessibilityRole="header" style={s.title}>Feedback & Support</Text>
  {sent?<View style={s.card}><Text accessibilityLiveRegion="polite" style={s.heading}>Thank you—your feedback was sent.</Text><Text style={s.copy}>The admin team can review your message. For urgent account or billing help, email support@bourbonsignal.com.</Text><Action label="Send another message" onPress={()=>{setSent(false);setError('');}}/></View>:<>
   <Text style={s.copy}>Tell us what went wrong or what would make Bourbon Signal better.</Text>
   <View style={s.wrap}><Action label="Report a problem" selected={kind==='problem'} disabled={busy} onPress={()=>setKind('problem')}/><Action label="Suggest an improvement" selected={kind==='suggestion'} disabled={busy} onPress={()=>setKind('suggestion')}/></View>
   <Text style={s.label}>{kind==='problem'?'What happened?':'What would you like to see?'}</Text>
   <TextInput accessibilityLabel={kind==='problem'?'Problem description':'Suggestion'} multiline maxLength={2000} editable={!busy} value={message} onChangeText={setMessage} style={[s.input,{minHeight:150,textAlignVertical:'top'}]} placeholderTextColor="#a99e8e" placeholder={kind==='problem'?'Describe the problem…':'Describe your idea…'}/>
   <Text style={s.copy}>{message.length}/2,000 characters</Text>
   <Text style={s.label}>Where in the app? (optional)</Text><TextInput accessibilityLabel="Screen or feature" maxLength={100} editable={!busy} value={screen} onChangeText={setScreen} style={s.input}/>
   {kind==='problem'||steps?<><Text style={s.label}>{params.context?'Related details & steps (editable)':kind==='problem'?'Steps to reproduce (optional)':'Related details (optional)'}</Text><TextInput accessibilityLabel="Steps to reproduce" multiline maxLength={1500} editable={!busy} value={steps} onChangeText={setSteps} style={[s.input,{minHeight:100,textAlignVertical:'top'}]}/></>:null}
   <Text style={s.copy}>Private feedback includes your account and app/build information so we can investigate. Do not include passwords, verification codes or payment details.</Text>
   {error?<Text accessibilityRole="alert" style={s.copy}>{error}</Text>:null}
   <Action label={busy?'Sending…':'Send feedback'} disabled={busy||Array.from(message.trim()).length<10} onPress={()=>void submit()}/>
  </>}
 </ScrollView></KeyboardAvoidingView>;
}
