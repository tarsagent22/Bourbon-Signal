import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {feedbackInput} from '../shared/member-feedback.ts';
import {MemberFeedbackRepository} from '../src/lib/member-feedback.ts';
import {ADMIN_EMAIL} from '../shared/admin-access.ts';
const input=()=>({id:randomUUID(),kind:'problem',message:'The Radar screen did not refresh.',steps:'Open Radar, pull to refresh.',screen:'Radar',context:{platform:'ios',version:'1.1.0',build:'15',runtime:'1.1.0-ios-iap-1',update:'embedded'}});
test('feedback rejects spoofed account fields, unknown diagnostics, controls and malformed inputs',()=>{
 assert.ok(feedbackInput(input()));
 for(const changes of [{message:'short'},{message:'😃'.repeat(5)},{message:'x'.repeat(2001)},{kind:'other'},{userId:'owner'},{email:'spoof@example.test'},{id:'invalid'},{steps:'\u0000'},{context:{...input().context,token:'secret'}}])assert.equal(feedbackInput({...input(),...changes}),null);
});
test('durable intake is account-scoped, retry-safe, capped, reviewable and deletable',async()=>{
 const db=new PGlite();try{
 await db.exec(readFileSync('src/lib/member-feedback.sql','utf8'));
 const sql={query:async(t:string,p:unknown[]=[])=>({rows:(await db.query(t,p)).rows as Record<string,unknown>[]})};
 const repo=new MemberFeedbackRepository(sql),first=feedbackInput(input())!;
 assert.equal(await repo.submit('a',first,'Member A','a@example.test'),'saved');
 assert.equal(await repo.submit('a',first,'Member A','a@example.test'),'saved');
 assert.equal(await repo.submit('a',{...first,message:'A changed submission under the same id.'},'Member A','a@example.test'),'conflict');
 assert.equal(await repo.submit('b',first,'Member B','b@example.test'),'saved');
 for(let i=1;i<10;i++)assert.equal(await repo.submit('a',feedbackInput(input())!,'Member A',''),'saved');
 assert.equal(await repo.submit('a',feedbackInput(input())!,'Member A',''),'limited');
 assert.equal(await repo.pendingCount(),11);
 assert.equal(await repo.review('a',first.id,'planned','Investigate refresh.'),true);
 assert.equal(await repo.review('missing',first.id,'resolved',''),false);
 const planned=await repo.list('planned');assert.equal(planned.items.length,1);assert.equal(planned.items[0].userId,'a');assert.equal(planned.items[0].internalNote,'Investigate refresh.');
 await db.query('DELETE FROM member_feedback WHERE user_id=$1',['a']);assert.equal((await repo.list('all')).items.length,1);
 assert.match(readFileSync('src/lib/account-deletion-repository.ts','utf8'),/DELETE FROM member_feedback WHERE user_id=\$1/);
 }finally{await db.close();}
});
test('real intake and owner routes enforce account identity and verified owner access',async()=>{
 const db=new PGlite();await db.exec(readFileSync('src/lib/member-feedback.sql','utf8'));
 const require=createRequire(import.meta.url),sql={query:async(t:string,p:unknown[]=[])=>({rows:(await db.query(t,p)).rows as Record<string,unknown>[]})};
 let userId:string|null=null,email='member@example.test',verified=true;
 const clerkPath=require.resolve('@clerk/nextjs/server'),repoPath=require.resolve('../src/lib/member-feedback.ts');
 const previousClerk=require.cache[clerkPath],previousRepo=require.cache[repoPath];
 require.cache[clerkPath]={exports:{auth:async()=>({userId}),clerkClient:async()=>({users:{getUser:async()=>({id:userId,fullName:'Test member',primaryEmailAddressId:'e',emailAddresses:[{id:'e',emailAddress:email,verification:{status:verified?'verified':'unverified'}}]})}})}} as never;
 require.cache[repoPath]={exports:{MemberFeedbackRepository:class extends MemberFeedbackRepository{constructor(){super(sql);}}}} as never;
 try{
 const intake=require('../src/app/api/v1/me/feedback/route.ts'),admin=require('../src/app/api/admin/feedback/route.ts');
 const send=(body:unknown)=>intake.POST(new Request('https://app.test/api/v1/me/feedback',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await send(input())).status,401);
 userId='member';assert.equal((await admin.GET(new Request('https://app.test/api/admin/feedback'))).status,403);
 assert.equal((await send({...input(),userId:'owner'})).status,400);
 const packet=input();assert.equal((await send(packet)).status,200);
 assert.equal((await admin.PATCH(new Request('https://app.test/api/admin/feedback',{method:'PATCH',body:'{}'}))).status,403);
 email=ADMIN_EMAIL;verified=false;assert.equal((await admin.GET(new Request('https://app.test/api/admin/feedback'))).status,403);
 verified=true;const result=await admin.GET(new Request('https://app.test/api/admin/feedback'));assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);
 const body=await result.json();assert.equal(body.items[0].userId,'member');assert.equal(body.items[0].email,'member@example.test');
 assert.equal((await admin.PATCH(new Request('https://app.test/api/admin/feedback',{method:'PATCH',body:JSON.stringify({userId:'member',id:packet.id,status:'resolved',internalNote:'Fixed.'})}))).status,200);
 }finally{await db.close();if(previousClerk)require.cache[clerkPath]=previousClerk;else delete require.cache[clerkPath];if(previousRepo)require.cache[repoPath]=previousRepo;else delete require.cache[repoPath];}
});
