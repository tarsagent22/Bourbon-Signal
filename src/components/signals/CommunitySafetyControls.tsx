"use client";
import { useState } from 'react';
import Link from 'next/link';
export default function CommunitySafetyControls({signalId,onHidden}:{signalId:string;onHidden?:()=>void}){
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  async function save(action:'report'|'block',reason?:string){
    if(busy)return;setBusy(true);setError('');
    try{const response=await fetch('/api/community/safety',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,signalId,reason})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Your change could not be saved.');setNotice(action==='block'?'Member blocked. Their posts and future Community alerts are hidden.':'Report sent for review. This post is hidden from your feed.');setOpen(false);onHidden?.();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
  }
  const buttonStyle={minHeight:44,border:'1px solid var(--color-border)',borderRadius:10,padding:'8px 12px',background:'transparent',color:'var(--color-cream)',cursor:'pointer'};
  return <div style={{display:'grid',gap:8,marginTop:16}}>
    {notice?<p role="status">{notice}</p>:<><button type="button" disabled={busy} style={buttonStyle} onClick={()=>setOpen(value=>!value)}>Report this post</button>
    {open?<div style={{display:'flex',flexWrap:'wrap',gap:8}}>{[['spam','Spam'],['misleading','Misleading availability'],['harassment','Harassment'],['inappropriate','Inappropriate content'],['other','Other concern']].map(([value,label])=><button type="button" disabled={busy} style={buttonStyle} key={value} onClick={()=>void save('report',value)}>{label}</button>)}</div>:null}
    <button type="button" disabled={busy} style={buttonStyle} onClick={()=>{if(window.confirm('Block this member? Their posts and future Community alerts will be hidden. You can unblock them later.'))void save('block');}}>Block this member</button></>}
    {error?<p role="alert">{error}</p>:null}
    <Link href="/community-safety">Manage blocked members</Link>
  </div>;
}
