import assert from 'node:assert/strict';
import test from 'node:test';
import {createMobileApi, MobileApiError} from './client';
import {membershipManagedOutsideStore} from '../account/subscription-management';
const version='bourbon-signal/mobile-api@1';
test('Google membership reads and writes use authenticated, validated contract endpoints',async()=>{
 const seen:Array<{path:string,method:string}> = [];
 const api=createMobileApi({getToken:async()=> 'account-token',fetcher:async input=>{const request=input as Request;assert.equal(request.headers.get('authorization'),'Bearer account-token');seen.push({path:new URL(request.url).pathname,method:request.method});return request.method==='POST' ? Response.json({contractVersion:version,status:'reconciled',effectiveTier:'standard',membership:{productId:'com.bourbonsignal.app.standard.monthly',status:'active',environment:'sandbox',expiresAt:'2026-11-07T00:00:00Z',offerState:'none',updatedAt:'2026-10-07T00:00:00Z'}}) : Response.json({contractVersion:version,available:false,reason:'backend_not_configured',eligibleProductIds:[],restoreAvailable:false,membership:null});}});
 assert.equal((await api.getGoogleMembershipReadiness()).available,false);
 assert.equal((await api.reconcileGoogleMembership({action:'restore'})).effectiveTier,'standard');
 assert.deepEqual(seen,[{path:'/api/v1/me/google-membership',method:'GET'},{path:'/api/v1/me/google-membership',method:'POST'}]);
 const malformed=createMobileApi({getToken:async()=> 'A',fetcher:async()=>Response.json({available:true})});
 await assert.rejects(()=>malformed.getGoogleMembershipReadiness(),(e:unknown)=>e instanceof MobileApiError && e.code==='INVALID_RESPONSE');
});
test('original subscription provider is retained across both phone platforms',async()=>{
 const api=createMobileApi({getToken:async()=> 'A',fetcher:async()=>Response.json({provider:'google',url:'https://play.google.com/store/account/subscriptions?package=com.bourbonsignal.app'})});
 assert.equal((await api.getSubscriptionManagement()).provider,'google');
 assert.equal(membershipManagedOutsideStore('stripe','android'),true);
 assert.equal(membershipManagedOutsideStore('stripe','ios'),true);
 assert.equal(membershipManagedOutsideStore('apple','android'),true);
 assert.equal(membershipManagedOutsideStore('google','ios'),true);
 assert.equal(membershipManagedOutsideStore('google','android'),false);
});
