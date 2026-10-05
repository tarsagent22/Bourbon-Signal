import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { CoverageRequestRepository } from '../src/lib/coverage-request-repository';
import { validatePriceReview } from '../src/lib/collection-price-review';
import { collectionValueForMember } from '../src/lib/collection-value';
import { collectionPricingHealth } from '../src/lib/collection-pricing-health';

async function main(){
const now = new Date('2026-10-05T12:00:00Z');
const reference = { bottleId:'test-bottle', names:['Test Bourbon 750 ml'], msrp:{amount:50,date:'2026-01-01',source:'https://producer.example/750ml',label:'Producer MSRP · 750 ml'}, secondary:{low:1,high:1,date:'2026-10-01',source:'https://sale.example/1',label:'Same release and size, excluding fees',evidenceKind:'completed_sales' as const,observations:[90,100,110,105,95,10000].map((amount,i)=>({amount,date:'2026-10-01',source:`https://sale.example/${i}`}))}};
const original = JSON.stringify(reference);
const reviewed = validatePriceReview(reference,now);
assert.equal(JSON.stringify(reference),original,'review validation does not mutate its caller');
assert.ok(reviewed.secondary!.high < 120,'extreme sale outlier is excluded');
assert.equal(reviewed.secondary!.confidence,'medium');
for(const invalid of [
 {...reference, names:['a','b']},
 {...reference, msrp:{...reference.msrp,date:'2026-02-30'}},
 {...reference, msrp:{...reference.msrp,date:'2027-01-01'}},
 {...reference, msrp:{...reference.msrp,source:'https://secret:password@producer.example'}},
 {...reference, secondary:{...reference.secondary,observations:reference.secondary.observations.slice(0,2)}},
 {...reference, secondary:{...reference.secondary,observations:reference.secondary.observations.map(o=>({...o,source:'https://sale.example/same'}))}},
 {...reference, secondary:{...reference.secondary,observations:reference.secondary.observations.map(o=>({...o,date:'2025-01-01'}))}},
]) assert.throws(()=>validatePriceReview(invalid,now));
const holding={bottleId:'test-bottle',bottleName:'Test Bourbon 750 ml',sealedQuantity:2,openedQuantity:1};
const expired=collectionValueForMember(true,[holding],new Date('2027-02-01'),[{...reviewed,reviewedAt:'2026-10-05'}])!;
assert.equal(expired.secondary.low,null,'secondary expires independently of MSRP');
assert.equal(expired.msrp.total,150);
assert.equal(collectionPricingHealth([reviewed],10,new Date('2027-02-01')).expiredSecondary,1);

const db=new PGlite();
await db.exec(readFileSync('src/lib/coverage-request-schema.sql','utf8'));
await db.exec(readFileSync('src/lib/owner-workspace-schema.sql','utf8'));
const adapter={query:async(text:string,params?:unknown[])=>(await db.query(text,params)).rows,transaction:async(fn:any)=>db.transaction(async(tx:any)=>Promise.all(fn({query:async(text:string,params?:unknown[])=>(await tx.query(text,params)).rows})))};
const repository=new CoverageRequestRepository(adapter);
const target={targetType:'city' as const,stateCode:'NC',areaKey:'raleigh',areaLabel:'Raleigh',storeId:null,storeName:null,storeAddress:null,canonicalTargetKey:'city:NC:raleigh',notificationEnabled:false,baselineCoverageFingerprint:'test-coverage-v1'};
const request=await repository.upsertForUser('user_member',target,now.toISOString());
assert.equal((await repository.listForUser('user_other')).length,0);
await repository.updateStatusForOwner(request.id,'on_radar','chandlertodd22@gmail.com',now.toISOString(),{actorId:'owner',internalNote:'Private investigation note',memberUpdate:'We are reviewing local stores.',priority:'high'});
const review=(await db.query<{internal_note:string;member_update:string}>('SELECT * FROM coverage_request_reviews')).rows[0];
assert.equal(review.internal_note,'Private investigation note');
assert.equal(review.member_update,'We are reviewing local stores.');
assert.equal((await db.query('SELECT * FROM owner_workspace_audit')).rows.length,1);
await assert.rejects(()=>repository.updateStatusForOwner(request.id,'closed','chandlertodd22@gmail.com',now.toISOString(),{actorId:'owner',internalNote:'bad',memberUpdate:'bad',priority:'invalid' as any}));
assert.equal((await repository.listForUser('user_member'))[0].status,'on_radar','note failure rolls back status and queue changes');
assert.equal((await db.query('SELECT * FROM owner_workspace_audit')).rows.length,1,'failed review has no success audit');
await db.query('DELETE FROM coverage_requests WHERE id=$1',[request.id]);
assert.equal((await db.query('SELECT * FROM coverage_request_reviews')).rows.length,0,'account deletion can cascade request notes');
await db.close();
console.log('Owner workspace: pricing evidence/outliers/freshness, durable atomic review and account isolation passed.');

}
void main().catch(e=>{console.error(e);process.exitCode=1;});
