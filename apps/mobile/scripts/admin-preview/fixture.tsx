import React from 'react';
export const randomUUID=()=>crypto.randomUUID();
const rows=Array.from({length:83},(_,i)=>({id:`member-${i}`,name:`Member ${i+1}`,email:`member${i+1}@example.test`,tier:i%2?'standard':'free',billingStatus:i%2?'active':'free',billingProvider:i%2?'stripe':'Unspecified',accessSources:i%2?['paid']:['free'],number:i+1,numberLabel:'Member',createdAt:Date.now()-i*86400000,lastSignInAt:Date.now()}));
const api={getAdminAccess:async()=>({allowed:true}),getAdminData:async(part:string,query='')=>{
 const p=new URLSearchParams(query.slice(1)),offset=Number(p.get('offset')||0),q=p.get('q')||'',filter=p.get('filter')||'all';
 if(part==='overview')return {feedback:3,coverage:8,community:0,bottles:2,rewards:0,founderShipping:0,unavailable:[],checkedAt:new Date().toISOString()};
 if(part==='members'){const found=rows.filter(r=>(filter==='all'||filter==='paid'&&r.tier!=='free'||filter===r.tier)&&`${r.name} ${r.email} ${r.number}`.toLowerCase().includes(q.toLowerCase()));return {members:found.slice(offset,offset+40),total:found.length,nextOffset:offset+40<found.length?offset+40:null};}
 if(part==='member-detail')return {member:rows.find(r=>r.id===p.get('id')),points:{balance:12,activity:[],redemptions:[]},history:[],posts:[{count:2}],activity:[{activity:{counts:[{kind:'bottles',status:'new',count:1}],items:[{kind:'bottles',id:'submission-1',title:'Exact Bourbon',status:'new',occurred_at:new Date().toISOString()}]}}],unavailable:[]};
 if(part==='catalog')return {bottles:[],total:0,nextOffset:null};
 if(part==='bottle-contributions')return {contributions:[{id:'submission-1',rawName:'Exact Bourbon',source:'collection',userId:'member-1',status:'new',updatedAt:new Date().toISOString(),createdAt:new Date().toISOString()}]};
 return {items:[],unavailable:[],history:[]};},saveAdminReview:async()=>({ok:true})};
export function useMobileApi(){return api;}
