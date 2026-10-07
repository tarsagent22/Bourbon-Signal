"use client";
import styles from './AdminWorkspace.module.css';
type Draft=Record<string,any>;
export default function BottleIdentityFields({draft,onChange}:{draft:Draft;onChange:(draft:Draft)=>void}){
 const patch=(key:string,value:unknown)=>onChange({...draft,[key]:value});
 return <><div className={styles.grid}>{[['canonicalName','Exact bottle name / release'],['brand','Brand'],['producer','Distillery / producer'],['proof','Proof'],['ageStatement','Age statement'],['sizeMl','Size in ml'],['sourceUrl','Identity source URL'],['photoEvidenceUrl','Photo evidence URL'],['summary','Description'],['guidance','Buying guidance']].map(([key,label])=><label key={key}>{label}<input value={draft[key] ?? ''} onChange={e=>patch(key,e.target.value)} maxLength={1000}/></label>)}<label>Category<select value={draft.category} onChange={e=>patch('category',e.target.value)}>{['bourbon','rye','american_whiskey'].map(v=><option key={v}>{v}</option>)}</select></label><label>Catalog rarity class<select value={draft.availability} onChange={e=>patch('availability',e.target.value)}>{['common','regional','seasonal','limited','allocated','highly_allocated','unicorn'].map(v=><option key={v}>{v}</option>)}</select></label></div><label>Aliases (one per line)<textarea value={(draft.aliases || []).join('\n')} onChange={e=>patch('aliases',e.target.value.split('\n'))}/></label></>;
}
