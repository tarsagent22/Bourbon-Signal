import {useCallback,useEffect,useRef,useState} from 'react';
import {Linking} from 'react-native';
import {useMobileApi} from './useMobileApi';
import {openMembershipManagement} from '../account/subscription-management';
export function useSubscriptionManagement(){
 const api=useMobileApi();
 const [provider,setProvider]=useState<'stripe'|'apple'|'google'|'none'|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 useEffect(()=>{let current=true;setProvider(null);setError('');void api.getSubscriptionManagement().then(r=>{if(current)setProvider(r.provider);}).catch(()=>{if(current)setError('Membership management is temporarily unavailable. Please try again.');});return()=>{current=false;};},[api]);
 const manage=useCallback(async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await openMembershipManagement(api,Linking.openURL);}catch{setError('Couldn’t open membership management. Please try again or contact support.');}finally{lock.current=false;setBusy(false);}},[api]);
 return {provider,busy,error,manage};
}
