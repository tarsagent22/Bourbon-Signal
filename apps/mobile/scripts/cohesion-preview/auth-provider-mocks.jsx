import React from 'react';
export const authFixture={userId:null,sessionId:null,mounts:0,completed:false,changed:()=>window.dispatchEvent(new Event('auth-fixture'))};
export function useAuth(){return {isLoaded:true,isSignedIn:!!authFixture.userId,userId:authFixture.userId,sessionId:authFixture.sessionId,getToken:async()=>authFixture.userId?'fixture-token':null};}
export function useSignUp(){return {fetchStatus:'idle',signUp:{status:'complete',password:async()=>({}),verifications:{sendEmailCode:async()=>({}),verifyEmailCode:async()=>({})},finalize:async()=>{authFixture.userId='new-member';authFixture.sessionId='new-session';authFixture.changed();return {};}}};}
export const createMobileApi=()=>({clearReadCache(){},searchMonitoringGeography:async()=>({states:[{code:'NC',name:'North Carolina'}]}),completeMobileOnboarding:async()=>{authFixture.completed=true;return {completed:true};}});
export class MobileApiError extends Error {}
export function useLocalSearchParams(){return {};}
export function useRouter(){return {replace:()=>{}};}
export function Redirect(){return <p style={{color:'red'}}>Unexpected auth redirect</p>;}
