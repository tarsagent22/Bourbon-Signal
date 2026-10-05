const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {moduleFrom,functions,root}=require('./astra-security-test-helpers.cjs');
const ownerEmail='chandlertodd22@gmail.com';
let userId='user_owner',email=ownerEmail,verified=true;
const owner=moduleFrom('src/lib/owner-auth.ts',{
 '@clerk/nextjs/server':{auth:async()=>({userId}),clerkClient:async()=>({users:{getUser:async()=>({primaryEmailAddressId:'primary',emailAddresses:[{id:'primary',emailAddress:email,verification:{status:verified?'verified':'unverified'}}],publicMetadata:{tier:'bottled-in-bond',admin:true}})}})},
 'next/navigation':{notFound:()=>{throw Error('not found');},redirect:()=>{throw Error('redirect');}},
 'next/server':{NextResponse:{json:Response.json}},
});
test('only the verified primary owner email can access owner APIs and pages',async()=>{
 for(const [id,address,isVerified,status] of [[null,ownerEmail,true,401],['other','chandler@bourbonsignal.com',true,403],['other','founder@example.test',true,403],['other','chandlertodd22+admin@gmail.com',true,403],['owner',ownerEmail,false,403],['owner',ownerEmail,true,200]]){
  userId=id;email=address;verified=isVerified;
  const access=await owner.requireOwnerApiAccess();assert.equal(access.error?.status||200,status);
  if(status!==200)await assert.rejects(()=>owner.requireOwnerPageAccess('/admin'));
 }
 const secondaryOwner={primaryEmailAddressId:'other',emailAddresses:[{id:'other',emailAddress:'someone@example.test',verification:{status:'verified'}},{id:'secondary',emailAddress:ownerEmail,verification:{status:'verified'}}]};
 assert.equal(owner.verifiedPrimaryClerkEmail(secondaryOwner),'someone@example.test');
});
test('every owner route denies access before reading or mutating its dependencies',async()=>{
 let reads=0;
 const bindings={Response,NextResponse:{json:Response.json},requireOwnerApiAccess:async()=>({error:Response.json({error:'Owner only'},{status:403})}),getCoverageRequestRepository:()=>{reads++;throw Error('unauthorized read');},coverageDatabase:()=>{reads++;throw Error('unauthorized read');}};
 for(const [route,names] of [['coverage',['GET','PATCH']],['pricing',['GET','POST']],['members',['GET']],['overview',['GET']]]){
  const handlers=functions(`src/app/api/admin/${route}/route.ts`,names,bindings);
  for(const name of names)assert.equal((await handlers[name](new Request('https://example.test/api/admin/'+route,{method:name==='GET'?'GET':'POST',...(name==='GET'?{}:{body:'{}'})}))).status,403);
 }
 assert.equal(reads,0);
});
test('invalid manual statuses cannot create improved coverage or prototype status',async()=>{
 let writes=0;
 const handler=functions('src/app/api/admin/coverage/route.ts',['PATCH'],{Response,requireOwnerApiAccess:async()=>({userId:'owner',email:ownerEmail}),getCoverageRequestRepository:()=>({updateStatusForOwner:async()=>{writes++;}})});
 for(const status of ['improved','toString','__proto__',null])assert.equal((await handler.PATCH(new Request('https://example.test',{method:'PATCH',body:JSON.stringify({id:'request',status})}))).status,400);
 assert.equal(writes,0);
});
test('member history scopes review reads and exposes no private notes',async()=>{
 let account;
 const handler=functions('src/app/api/coverage/requests/route.ts',['GET'],{NextResponse:{json:Response.json},authenticatedUserId:async()=>'member_a',getCoverageRequestRepository:()=>({listForUser:async id=>[{id:'request_a',status:'on_radar'}]}),coverageDatabase:()=>({query:async(sql,params)=>{assert.match(sql,/WHERE request.user_id=\$1/);assert.doesNotMatch(sql,/internal_note/);account=params[0];return [{request_id:'request_a',member_update:'Reviewing stores'}];}})});
 const response=await handler.GET();assert.equal(account,'member_a');assert.equal(response.headers.get('cache-control'),'private, no-store');const data=await response.json();assert.equal(data.requests[0].memberUpdate,'Reviewing stores');assert.equal(data.requests[0].internalNote,undefined);
});
test('pricing rejects catalog mismatches and keeps provider errors private',async()=>{
 let writes=0,fail=false;
 const handler=functions('src/app/api/admin/pricing/route.ts',['POST'],{Response,requireOwnerApiAccess:async()=>({userId:'owner',email:ownerEmail}),validatePriceReview:input=>input,getBourbonBible:async()=>[{id:'exact',canonicalName:'Exact Bourbon'}],coverageDatabase:()=>({query:async(sql,params)=>{writes++;assert.match(sql,/INSERT INTO collection_price_history/);assert.equal(params[2],'owner');if(fail)throw Error('private database host and credentials');}})});
 const send=reference=>handler.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify({reference,note:'Reviewed original manufacturer source.'})}));
 assert.equal((await send({bottleId:'exact',names:['Wrong edition']})).status,400);assert.equal(writes,0);
 assert.equal((await send({bottleId:'exact',names:['Exact Bourbon']})).status,200);assert.equal(writes,1);
 fail=true;const response=await send({bottleId:'exact',names:['Exact Bourbon']});assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/credentials|private database/);
});
test('scheduled pricing health cannot be read without its machine credential',async()=>{
 let reads=0;
 const handler=functions('src/app/api/ops/pricing-health/route.ts',['GET'],{Response,process:{env:{CRON_SECRET:'fixture-only'}},authorizeOpsBearer:(header,secret)=>header==='Bearer '+secret,readReviewedPrices:async()=>{reads++;return [];},getBourbonBible:async()=>[],collectionPricingHealth:()=>({catalogCount:0}),coverageDatabase:()=>({query:async()=>{}})});
 assert.equal((await handler.GET(new Request('https://example.test'))).status,401);assert.equal(reads,0);
 const response=await handler.GET(new Request('https://example.test',{headers:{authorization:'Bearer fixture-only'}}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{catalogCount:0});
});
test('all admin pages are covered by the owner layout and native menu uses server capability',()=>{
 assert.match(fs.readFileSync(root+'/src/app/admin/layout.tsx','utf8'),/await requireOwnerPageAccess/);
 assert.match(fs.readFileSync(root+'/apps/mobile/app/(app)/(tabs)/hq.tsx','utf8'),/adminAllowed/);
 assert.match(fs.readFileSync(root+'/apps/mobile/app/(app)/account/admin.tsx','utf8'),/getAdminAccess/);
});
