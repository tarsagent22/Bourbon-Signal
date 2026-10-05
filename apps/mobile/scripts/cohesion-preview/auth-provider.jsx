import React, { useEffect, useState } from 'react';
import { MobileApiProvider } from '../../src/hooks/useMobileApi';
import { useAuth as useFixtureAuth, authFixture } from './auth-provider-mocks';
import SignUp from '../../app/(auth)/sign-up';
import { createRoot } from 'react-dom/client';

function DraftProbe() {
  const [draft,setDraft]=useState('');
  const [mount]=useState(()=>++authFixture.mounts);
  return <div style={{color:'#eee'}}><p>Navigation mount: {mount}</p><input aria-label="Navigation draft" value={draft} onChange={e=>setDraft(e.target.value)} /></div>;
}
createRoot(document.getElementById('root')).render(<AuthProviderProof/>);
export default function AuthProviderProof() {
  const [epoch,setEpoch]=useState(0);
  useEffect(()=>{const update=()=>setEpoch(v=>v+1);window.addEventListener('auth-fixture',update);return()=>window.removeEventListener('auth-fixture',update);},[]);
  const auth=useFixtureAuth();
  return <div style={{flex:1,overflow:'auto'}}>
    <p style={{color:'#eee'}}>Actual API provider and signup · mocked Clerk and HTTP</p>
    <button onClick={()=>{authFixture.userId=null;authFixture.sessionId=null;authFixture.changed();}}>Fixture sign out</button>
    <button onClick={()=>{authFixture.userId='second-account';authFixture.sessionId='second-session';authFixture.changed();}}>Fixture account switch</button>
    <p style={{color:'#eee'}}>{auth.isSignedIn?'Signed in':'Signed out'}</p>
    <MobileApiProvider><DraftProbe/><SignUp/></MobileApiProvider>
  </div>;
}
