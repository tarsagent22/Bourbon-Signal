// The generic Kentucky title is not a Master's expression. Product ID or UPC
// cannot supply the missing expression word; all other identity checks remain.
export function xapiExpressionTitleSupported(rawTitle,canonicalName){
  const canonical=String(canonicalName||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  return canonical!=='wild turkey master'||/\bmaster\b/i.test(String(rawTitle||''));
}
