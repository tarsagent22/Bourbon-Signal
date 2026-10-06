"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { MemberSighting } from '@/lib/sightings';
export default function CommunityReportsQueue(){
  const [reports,setReports]=useState<Array<{sightingId:string;reason:string;createdAt:string;sighting:MemberSighting|null}>>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(''),[loading,setLoading]=useState(true);
  async function load(){setLoading(true);setError('');try{const response=await fetch('/api/admin/community-reports',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error('Community reports could not load.');setReports(data.reports);}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function act(sightingId:string,remove:boolean){
    if(busy)return;setBusy(sightingId);setError('');
    try {
      if(remove){const sighting=reports.find(row=>row.sightingId===sightingId)?.sighting;if(!sighting?.reporterUserId)throw new Error('This post is already unavailable. Review and dismiss its reports.');
        const response=await fetch('/api/admin/posts',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'remove',id:sightingId,reason:'Reviewed Community abuse report: '+reports.filter(row=>row.sightingId===sightingId).map(row=>row.reason).join(', '),expected:sighting})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Removal could not be saved.');}
      const response=await fetch('/api/admin/community-reports',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({sightingId})});if(!response.ok)throw new Error('The report could not be marked reviewed.');setReports(rows=>rows.filter(row=>row.sightingId!==sightingId));
    }catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy('');}
  }
  return <section style={{padding:20,border:'1px solid rgba(245,237,214,.15)',borderRadius:16,margin:'16px 0'}}><h2>Community abuse reports</h2><p>Review member concerns here. Remove objectionable posts or dismiss reports after review.</p><button className="admin-button" disabled={loading} onClick={()=>void load()}>Refresh reports</button>{error?<p role="alert">{error}</p>:null}{loading?<p>Loading…</p>:!reports.length?<p>No pending reports.</p>:null}{reports.map((report,index)=><article key={`${report.sightingId}-${index}`} style={{marginTop:16,paddingTop:16,borderTop:'1px solid rgba(245,237,214,.12)'}}><strong>{report.sighting?.bottleName||'Unavailable post'}</strong><p>Reason: {report.reason} · {new Date(report.createdAt).toLocaleString()}</p><p>{report.sighting?.notes}</p><Link href={`/signals/${encodeURIComponent(`member:${report.sightingId}`)}`}>View post</Link><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button className="admin-button danger" disabled={Boolean(busy)||!report.sighting} onClick={()=>{if(window.confirm('Remove this Community post from member feeds?'))void act(report.sightingId,true);}}>Remove post and resolve reports</button><button className="admin-button" disabled={Boolean(busy)} onClick={()=>void act(report.sightingId,false)}>Dismiss after review</button></div></article>)}</section>;
}
