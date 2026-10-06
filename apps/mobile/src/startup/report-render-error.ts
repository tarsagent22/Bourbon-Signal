import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import {Platform} from 'react-native';
import {nativeDiagnostic,type NativeDiagnostic} from '../../../../shared/native-diagnostics';
const sent=new Map<string,number>();
export async function reportRenderError(error:Error,componentStack:string,send:(packet:NativeDiagnostic)=>Promise<unknown>){
 if(Platform.OS!=='ios'&&Platform.OS!=='android')return;
 // Hash locally. Raw error messages, stack frames, paths and component text stay on-device.
 const fingerprint=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`${error.name}:${error.message}:${error.stack||''}:${componentStack}`);
 const now=Date.now();for(const [key,time] of sent)if(now-time>3600000)sent.delete(key);
 if(sent.has(fingerprint)||sent.size>=10)return;sent.set(fingerprint,now);
 const safe=(value:string|null|undefined)=>value&&/^[a-zA-Z0-9._-]{1,100}$/.test(value)?value:'unknown';
 const packet=nativeDiagnostic({fingerprint,errorKind:['TypeError','ReferenceError','RangeError','SyntaxError'].includes(error.name)?error.name:'Error',platform:Platform.OS,build:safe(Constants.nativeBuildVersion),runtime:safe(Updates.runtimeVersion),update:safe(Updates.updateId||'embedded')});
 if(packet)await send(packet);
}
