"use client";
import { useEffect, useState } from 'react';
import Navigation from '@/components/Navigation';
export default function CommunitySafetyPage(){
  const [blocks,setBlocks]=useState<Array<{id:string;label:string;createdAt:string}>>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
  async function load(){setError('');setLoading(true);try{const response=await fetch('/api/community/safety',{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error);setBlocks(result.blocks);}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function unblock(memberId:string){setBusy(memberId);setError('');try{const response=await fetch('/api/community/safety',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'unblock',memberId})});const result=await response.json();if(!response.ok)throw new Error(result.error);setBlocks(rows=>rows.filter(row=>row.id!==memberId));}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy('');}}
  return <><Navigation/><main style={{maxWidth:720,margin:'0 auto',padding:'120px 20px 60px',color:'var(--color-cream)'}}><h1>Blocked members</h1><p>Blocked members’ posts and future Community alerts are hidden from your account.</p>{loading?<p>Loading…</p>:null}{error?<p role="alert">{error} <button onClick={()=>void load()}>Try again</button></p>:null}{!loading&&!error&&!blocks.length?<p>You haven’t blocked any members.</p>:null}{blocks.map(row=><div key={row.id} style={{padding:16,borderBottom:'1px solid var(--color-border)'}}>{row.label} · Blocked {new Date(row.createdAt).toLocaleDateString()} <button style={{minHeight:44}} disabled={Boolean(busy)} onClick={()=>void unblock(row.id)}>{busy===row.id?'Saving…':'Unblock member'}</button></div>)}</main></>;
}
