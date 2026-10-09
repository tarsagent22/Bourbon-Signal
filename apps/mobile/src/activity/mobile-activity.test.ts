import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActivityReporter } from './mobile-activity';
import { createMobileApi } from '../api/client';
import { loadWithMocks } from '../astra-test-harness';
test('report retries failures, throttles successful activity and stops on logout',async()=>{
  let clock=0, calls=0, fail=true;
  const reporter=createActivityReporter(async()=>{calls++;if(fail)throw Error('offline');},()=>clock);
  await reporter.report();fail=false;await reporter.report();await reporter.report();assert.equal(calls,2);
  clock=300000;await reporter.report();assert.equal(calls,3);reporter.stop();clock+=300000;await reporter.report();assert.equal(calls,3);
});
test('duplicate reports do not overlap; separate account reporters do not share throttle',async()=>{
  let calls=0, resolve!:()=>void;
  const reporter=createActivityReporter(()=>{calls++;return new Promise<void>(r=>{resolve=r;});});
  const pending=reporter.report();await reporter.report();assert.equal(calls,1);reporter.stop();resolve();await pending;
  const next=createActivityReporter(async()=>{calls++;});await next.report();assert.equal(calls,2);
});
test('activity client uses authenticated POST and never caches the write',async()=>{
  let calls=0;
  const api=createMobileApi({getToken:async()=> 'fixture-token',fetcher:async input=>{
    const request=input as Request;assert.equal(request.headers.get('authorization'),'Bearer fixture-token');assert.equal(request.method,'POST');assert.equal(new URL(request.url).pathname,'/api/v1/me/mobile-activity');
    assert.deepEqual(await request.json(),{platform:'ios',appVersion:'1.1.0',updateId:null});calls++;return Response.json({ok:true});
  }});
  await api.recordMobileActivity({platform:'ios',appVersion:'1.1.0',updateId:null});await api.recordMobileActivity({platform:'ios',appVersion:'1.1.0',updateId:null});assert.equal(calls,2);
});
test('native component gates sign-in and web, reports foreground only and removes timers/listeners',()=>{
  let effect:()=>any, listener:(s:string)=>void, timer:()=>void, reports=0, stops=0, removed=0;
  let signedIn=false, platform='ios';
  const state={currentState:'active',addEventListener:(_:string,fn:(s:string)=>void)=>{listener=fn;return {remove:()=>removed++};}};
  const originalSet=globalThis.setInterval, originalClear=globalThis.clearInterval;
  globalThis.setInterval=((fn:()=>void)=>{timer=fn;return 1;}) as any;
  globalThis.clearInterval=(()=>{removed++;}) as any;
  try {
    const {MobileActivity}=loadWithMocks('src/activity/MobileActivity.tsx',{
      react:{useEffect:(fn:()=>any)=>{effect=fn;}},'@clerk/expo':{useAuth:()=>({isLoaded:true,isSignedIn:signedIn,userId:signedIn?'user':null,sessionId:'session'})},
      'expo-constants':{expoConfig:{version:'1.1.0'}},'expo-updates':{updateId:null},'react-native':{AppState:state,Platform:{get OS(){return platform;}}},
      '../hooks/useMobileApi':{useMobileApi:()=>({recordMobileActivity:()=>{}})},'./mobile-activity':{createActivityReporter:()=>({report:()=>reports++,stop:()=>stops++})},
    });
    MobileActivity();assert.equal(effect!(),undefined);assert.equal(reports,0);
    signedIn=true;platform='web';MobileActivity();assert.equal(effect!(),undefined);assert.equal(reports,0);
    platform='ios';MobileActivity();const cleanup=effect!();assert.equal(reports,1);
    state.currentState='background';timer!();listener!('background');assert.equal(reports,1);
    state.currentState='active';listener!('active');assert.equal(reports,2);cleanup();assert.equal(stops,1);assert.equal(removed,2);
  } finally {globalThis.setInterval=originalSet;globalThis.clearInterval=originalClear;}
});
