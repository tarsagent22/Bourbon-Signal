export interface NativeDiagnostic { fingerprint:string; errorKind:'Error'|'TypeError'|'ReferenceError'|'RangeError'|'SyntaxError'; platform:'ios'|'android'; build:string; runtime:string; update:string; }
export function nativeDiagnostic(value:unknown):NativeDiagnostic|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['fingerprint','errorKind','platform','build','runtime','update'].includes(k)))return null;
  if(typeof v.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(v.fingerprint))return null;
  if(!['Error','TypeError','ReferenceError','RangeError','SyntaxError'].includes(String(v.errorKind))||!['ios','android'].includes(String(v.platform)))return null;
  for(const k of ['build','runtime','update'])if(typeof v[k]!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(v[k] as string))return null;
  return {fingerprint:v.fingerprint,errorKind:v.errorKind,platform:v.platform,build:v.build,runtime:v.runtime,update:v.update} as NativeDiagnostic;
}
