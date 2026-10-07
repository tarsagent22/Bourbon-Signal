import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Responsive} from '../cohesion-preview/native';
import Home from '../../app/(app)/(tabs)/index';
import {state} from './mocks';
function Preview(){const [epoch,remount]=useState(0);const [width,setWidth]=useState(390);return <><nav><button onClick={()=>setWidth(320)}>320px</button><button onClick={()=>setWidth(390)}>390px</button><button onClick={()=>{state.slow=!state.slow;document.getElementById('network').textContent=state.slow?'Network delay: 8 seconds':'Network delay: 50ms';}}>Toggle slow network</button><button onClick={()=>{state.offline=!state.offline;document.getElementById('offline').textContent=state.offline?'Offline':'Online';}}>Toggle offline</button><button onClick={()=>remount(v=>v+1)}>Reopen feed</button><button onClick={()=>{state.owner=state.owner==='user_preview_A'?'user_preview_B':'user_preview_A';remount(v=>v+1);}}>Switch account</button></nav><p id="network">Network delay: 50ms</p><p id="offline">Online</p><p>Actual Home screen with synthetic signals and an 8-second profile delay.</p><div style={{width,maxWidth:'100%',height:844,margin:'auto',display:'flex'}}><Responsive.Provider value={{width,fontScale:1}}><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><Home key={epoch}/></SafeAreaProvider></Responsive.Provider></div></>}
createRoot(document.getElementById('root')).render(<Preview/>);
