import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Account from '../../app/(app)/(tabs)/hq';
import Rewards from '../../app/(app)/account/rewards';
import Redeem from '../../app/(app)/account/redeem';
import Profile from '../../app/(app)/account/profile';
function Fixture(){const q=new URLSearchParams(location.search);const [screen,setScreen]=useState(q.get('screen')||'hq');useEffect(()=>{const fn=(event:any)=>setScreen(event.detail);addEventListener('fixture-navigate',fn);return()=>removeEventListener('fixture-navigate',fn);},[]);const Screen=({hq:Account,rewards:Rewards,redeem:Redeem,profile:Profile} as any)[screen];return <><header style={{padding:8,color:'#b7ae9e',textAlign:'center',fontFamily:'sans-serif'}}>Actual mobile components · synthetic data</header><div id="phone" style={{width:Number(q.get('width')||390),maxWidth:'100vw',height:844,margin:'auto',display:'flex',flexDirection:'column',background:'#100e0a'}}><div style={{padding:18,color:'#eee',fontFamily:'sans-serif',textAlign:'center',fontWeight:700}}>{screen==='hq'?'Account':screen==='redeem'?'Redeem reward':screen==='profile'?'Edit profile':'Rewards'}</div>{Screen?<Screen key={screen}/>:<p>Navigation: {screen}</p>}</div></>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
