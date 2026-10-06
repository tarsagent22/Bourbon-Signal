"use client";
import {useEffect,useState} from 'react';
type Row={fingerprint:string;metadata:{errorKind:string;platform:string;build:string;runtime:string;update:string};occurrences:number;lastSeenAt:string};
export default function NativeDiagnostics(){
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 async function load(){setLoading(true);setError('');try{const response=await fetch('/api/admin/native-diagnostics',{cache:'no-store'});if(!response.ok)throw Error('Diagnostics could not load.');setRows((await response.json()).diagnostics);}catch{setError('Diagnostics could not load. Retry or check service health.');}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 return <article className="cr-queue-panel"><h3>Native screen errors</h3><p className="cr-note">Automatic reports from signed-in mobile screen failures. No raw messages or stacks are uploaded. Native OS crashes and offline failures may be absent.</p><button type="button" onClick={()=>void load()} disabled={loading}>{loading?'Loading…':'Refresh diagnostics'}</button>{error?<p role="alert">{error}</p>:null}{!loading&&!error&&!rows.length?<p>No reports recorded in the last 30 days.</p>:null}{rows.map(row=><p key={`${row.fingerprint}:${JSON.stringify(row.metadata)}`}><strong>{row.metadata.errorKind}</strong> · {row.occurrences} reports · {row.metadata.platform} build {row.metadata.build}<br/>Last seen {row.lastSeenAt} · runtime {row.metadata.runtime} · update {row.metadata.update}<br/><code>{row.fingerprint.slice(0,16)}</code></p>)}</article>;
}
