import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Responsive} from './native';
import {fixture,setRoute} from './mocks';
import Home from '../../app/(app)/(tabs)/index';
import Shelf from '../../app/(app)/(tabs)/cellar';
import Radar from '../../app/(app)/(tabs)/radar';
import Post from '../../app/(app)/(tabs)/post';
import Add from '../../app/(app)/cellar/add';
import Detail from '../../app/(app)/signal/[id]';
import Account from '../../app/(app)/(tabs)/hq';
import Profile from '../../app/(app)/account/profile';
import Welcome from '../../app/(auth)/sign-up';
import SignIn from '../../app/(auth)/sign-in';
import Blocked from '../../app/(app)/account/blocked-members';
import {PostTabButton} from '../../app/(app)/(tabs)/_layout';
import Membership from '../../app/(app)/account/membership';
import Rewards from '../../app/(app)/account/rewards';
import {StartupErrorBoundary} from '../../src/startup/StartupErrorBoundary';
import Admin from '../../app/(app)/account/admin';
import Coverage from '../../app/(app)/account/coverage';
import Feedback from '../../app/(app)/account/feedback';
import Support from '../../app/(app)/account/support';
import Privacy from '../../app/(app)/account/privacy';
import Terms from '../../app/(app)/account/terms';
import {BrandLoading} from '../../src/components/BrandLoading';
const screens={Home,'My Shelf':Shelf,Radar,Post,'Post button':()=> <div style={{width:'100%',background:'#19120f',paddingTop:80}}><PostTabButton onPress={()=>setRoute('Post')}/></div>,'Blocked members':Blocked,'Add bottle':Add,'Bottle Profile':Detail,Account,'Edit profile':Profile,Welcome,'Sign in':SignIn,Membership,Rewards,Admin,Coverage,Support,Feedback,Privacy,Terms,Loading:BrandLoading};
function Crash(){throw new Error('Synthetic preview error');}
function Preview(){
 const [route,routeState]=useState('Home');const [width,setWidth]=useState(390);const [fontScale,setScale]=useState(1);const [epoch,setEpoch]=useState(0);const [crash,setCrash]=useState(false);
 useEffect(()=>{const changed=()=>routeState(fixture.route);window.addEventListener('fixture-route',changed);return()=>window.removeEventListener('fixture-route',changed);},[]);
 const Screen=screens[route];
 return <><nav>{Object.keys(screens).map(name=><button key={name} onClick={()=>{setCrash(false);setRoute(name);}}>{name}</button>)}<button onClick={()=>setCrash(true)}>Crash screen</button></nav><nav>{["free","standard","barrel","bottled-in-bond"].map(tier=><button key={tier} onClick={()=>{fixture.tier=tier;setEpoch(v=>v+1);}}>{tier}</button>)}<button onClick={()=>{setWidth(320);setScale(1);}}>320px</button><button onClick={()=>{setWidth(390);setScale(1);}}>390px</button><button onClick={()=>{setWidth(390);setScale(1.3);}}>Large text</button><button onClick={()=>setEpoch(v=>v+1)}>Remount screen</button>{['empty','expired','catalogFailed','storeFailed','detailFailed','alertsFailed','admin','community'].map(key=><label key={key} style={{color:'#b9aa98',font:'12px system-ui'}}><input type="checkbox" onChange={e=>{fixture[key]=e.target.checked;if(key==="empty"||key==="expired"||key==="admin"||key==="community")setEpoch(v=>v+1);}}/>{key}</label>)}</nav><p style={{color:'#b9aa98',textAlign:'center',font:'12px system-ui'}}>Actual mobile screens · synthetic data · native icons, storage and device services substituted</p><div style={{width,maxWidth:'100%',height:844,margin:'auto',display:'flex',border:'1px solid #3a3027'}}><Responsive.Provider value={{width,fontScale}}><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><StartupErrorBoundary key={epoch} resetOn={route === "Sign in" ? ":" : "fixture:session"}><div style={{display:'flex',flex:1,minWidth:0,minHeight:0,height:'100%',overflow:'hidden'}}>{crash?<Crash/>:<Screen key={`${route}-${epoch}`}/>}</div></StartupErrorBoundary></SafeAreaProvider></Responsive.Provider></div></>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
