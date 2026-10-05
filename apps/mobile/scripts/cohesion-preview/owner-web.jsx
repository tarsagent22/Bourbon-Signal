import React from 'react';
import {createRoot} from 'react-dom/client';
import AdminWorkspace from '../../../../src/components/admin/AdminWorkspace';
import {COLLECTION_PRICE_REFERENCES} from '../../../../src/data/collection-price-references';
const rows=[{id:'fixture-one',userId:'fixture-one',areaLabel:'Raleigh',stateCode:'NC',canonicalTargetKey:'city:NC:raleigh',status:'requested',updatedAt:'2026-10-05',review:null},{id:'fixture-two',userId:'fixture-two',areaLabel:'Raleigh',stateCode:'NC',canonicalTargetKey:'city:NC:raleigh',status:'on_radar',updatedAt:'2026-10-05',review:{internal_note:'Fixture private note',member_update:'Checking local sources',priority:'high'}}];
const data={overview:{coverage:2,community:1,bottles:0,rewards:1,founderShipping:2,unavailable:[],checkedAt:'2026-10-05'},coverage:{requests:rows,automation:{queued:1}},members:{members:[{id:'member-fixture',name:'Fixture member',email:'member@example.test',tier:'standard',status:'active',number:301,numberLabel:'Member'}]},pricing:{bottles:COLLECTION_PRICE_REFERENCES.map((reference,i)=>({id:reference.bottleId,name:reference.names[0],members:12-i,reference})),history:[],health:null}};
window.fetch=async(path,options={})=>{
 const section=String(path).split('/').pop().split('?')[0];
 if(options.method==='PATCH'){const input=JSON.parse(options.body);const row=rows.find(r=>r.id===input.id);row.status=input.status;row.review={internal_note:input.internalNote,member_update:input.memberUpdate,priority:input.priority};return Response.json({ok:true});}
 if(options.method==='POST'){const input=JSON.parse(options.body);data.pricing.history.unshift({id:Date.now(),bottle_id:input.reference.bottleId,review_note:input.note,reviewed_at:'2026-10-05'});return Response.json({ok:true});}
 return Response.json(data[section]||{});
};
createRoot(document.getElementById('root')).render(<><p style={{textAlign:'center',color:'#bcb1a1'}}>Actual web workspace · synthetic data · existing moderation and reward panels substituted</p><AdminWorkspace/></>);
