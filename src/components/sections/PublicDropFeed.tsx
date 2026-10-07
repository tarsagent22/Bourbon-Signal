"use client";
import {FeedRow} from './DropFeed';
import {dropFeedStyles} from './drop-feed-styles';
import type {GroupedDrop} from '@/lib/drops';
import type {PublicMarketingDrop} from '@/lib/public-marketing-feed';
import AppDownloadCTA from '../AppDownloadCTA';
export default function PublicDropFeed({drops,unavailable,downloadUrl}:{drops:PublicMarketingDrop[];unavailable:boolean;downloadUrl:string|null}){
 return <section id="drops" style={{backgroundColor:'var(--color-bg-warm)',scrollMarginTop:88,padding:'24px 0 64px',width:'100%',overflow:'hidden'}}><style>{dropFeedStyles}</style><div className="px-4 sm:px-8 md:px-16 lg:px-24 mx-auto" style={{maxWidth:1400}}><h2 style={{fontFamily:'var(--font-playfair)',fontSize:'clamp(28px,5vw,40px)',color:'var(--color-cream)',marginBottom:12}}>The Drop Feed</h2><p style={{color:'var(--color-text-secondary)',lineHeight:1.65,marginBottom:24}}>Recent public bottle signals. Availability can change. Open the app for your full feed and alerts.</p><div style={{display:'grid',gap:12}}>{drops.map((drop,index)=><FeedRow key={drop.id} readOnly isFreeUser index={index} isNew={false} drop={{id:drop.id,displayName:drop.bottle,state:drop.state,timestamp:drop.observedAt,event_type:drop.eventType,rarity_tier:drop.rarity,locations:[],counties:[]} as GroupedDrop}/>)}</div>{!drops.length?<p role="status" style={{color:'var(--color-text-secondary)',padding:'24px 0'}}>{unavailable?'The feed is temporarily unavailable. Please check back shortly.':'No public drops to show right now.'}</p>:null}<div style={{marginTop:28}}><AppDownloadCTA downloadUrl={downloadUrl}/></div></div></section>;
}
