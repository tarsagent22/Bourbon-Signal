export function expandCorrectedWatchNames(names: string[], records: Array<{patch:Record<string,unknown>;redirect_id?:string|null}>, normalize:(s:string)=>string) {
 const wanted = new Set(names.map(normalize));
 const expanded = [...names];
 for (const record of records) {
  if(record.redirect_id) continue;
  const aliases = [String(record.patch.canonicalName || ''),...(Array.isArray(record.patch.aliases)?record.patch.aliases.filter((v):v is string=>typeof v==='string'):[])].filter(Boolean);
  if(aliases.some(v=>wanted.has(normalize(v)))) expanded.push(...aliases);
 }
 return [...new Set(expanded)];
}
