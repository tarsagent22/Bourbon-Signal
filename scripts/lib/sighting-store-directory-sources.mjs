import {createHash} from 'node:crypto';

export function directoryId(state, identity) {
  return `sighting-store:${state.toLowerCase()}:${createHash('sha256').update(String(identity)).digest('hex').slice(0,20)}`;
}
export function cleanHtml(value='') {
  return String(value).replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();
}
export function parseNcBoards(html) {
  const select=html.match(/<select[^>]+name=["']StoreLocatorBoard["'][\s\S]*?<\/select>/i)?.[0];
  if(!select)throw Error('NC ABC board selector missing');
  const boards=[...select.matchAll(/<option\s+value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)]
    .map(m=>({id:m[1],name:cleanHtml(m[2])})).filter(b=>b.id&&!/^select /i.test(b.name));
  if(boards.length<170||new Set(boards.map(b=>b.id)).size!==boards.length)throw Error('Incomplete NC board directory');
  return boards;
}
export function parseNcStores(html,board) {
  const blocks=[...html.matchAll(/<div class="row p-1 list-generic"[\s\S]*?<div class="col-2">[\s\S]*?<\/div>/gi)].map(m=>m[0]);
  if(blocks.length!==(html.match(/class="row p-1 list-generic"/g)||[]).length)throw Error(`Unparsed store rows for ${board.name}`);
  return blocks.map(block=>{
    const details=[...block.matchAll(/<div>([\s\S]*?)<\/div>/gi)].map(d=>cleanHtml(d[1])).filter(Boolean);
    const address=details[0];
    const city=details[1]?.match(/^(.+?)\s+NC,?\s*(\d{5}(?:-\d{4})?)/i);
    if(!address||!city)throw Error(`Incomplete official NC store row for ${board.name}`);
    const sourceStoreId=block.match(/\/Images\/Stores\/(\d+)\//i)?.[1];
    const name=`${board.name.replace(/\s+ABC Board\s*$/i,'')} ABC Store`;
    return {id:sourceStoreId?`nc-abc-store-${sourceStoreId}`:directoryId('NC',`${board.id}:${address}:${city[1]}`),
      state:'NC',name,address,city:city[1].trim(),zip:city[2],board:board.name,boardId:board.id,
      source:'NC ABC Commission store locator',sourceUrl:'https://abc2.nc.gov/Search/ABCStoreLocator',
      sourceStoreId:sourceStoreId?`nc-abc-store-${sourceStoreId}`:undefined};
  });
}
export function parseIdahoStores(html) {
  const raw=html.match(/const stores\s*=\s*({[\s\S]*?})\s*;\s*\/\* Assign/i)?.[1];
  if(!raw)throw Error('Idaho official store collection missing');
  const rows=JSON.parse(raw).features;
  if(!Array.isArray(rows)||rows.length<150)throw Error('Incomplete Idaho store directory');
  return rows.flatMap(row=>{
    const p=row.properties;
    // Restricted military locations cannot be selected as public retail stores.
    if(/military|restricted|not open to the public/i.test(p.hours||''))return [];
    if(!p.store_id||!p.address_one||!p.city)throw Error('Incomplete Idaho store');
    return [{id:`idaho-liquor-store-${p.store_id}`,sourceStoreId:String(p.store_id),state:'ID',name:p.title,
      address:[p.address_one,p.address_two].filter(Boolean).join(', '),city:p.city,zip:p.zip_code,
      source:'Idaho State Liquor Division store locator',sourceUrl:'https://idaholiquor.com/stores/'}];
  });
}
export function parseCityHiveDirectory(html,sourceUrl) {
  const out=new Map();
  function walk(p){
    if(!p||typeof p!=='object')return;
    if(p.id&&p.name&&p.address?.full_address){
      const a=p.address.address_properties||p.address;
      if(a.state&&a.city&&a.street_address&&p.cityhive_active!==false&&!/\(multi\)/i.test(p.name))
        out.set(p.id,{id:`cityhive:${p.id}`,state:a.state,name:p.name,address:a.street_address+(a.sub_premise?` #${a.sub_premise}`:''),city:a.city,zip:a.zip||a.zipcode,source:'Retailer-published store directory',sourceUrl});
    }
    for(const v of Object.values(p))walk(v);
  }
  for(const m of html.matchAll(/JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/g))walk(JSON.parse(decodeURIComponent(m[1])));
  return [...out.values()];
}
export function parseMontgomeryStores(html) {
  const rows=[...html.matchAll(/<div\s+id=['"](\d+)['"]>\s*<div[^>]*class=['"]h3 text-primary['"][^>]*>([\s\S]*?)<\/div>[\s\S]*?href=['"]https:\/\/maps\.google\.com\/\?daddr=([^'"]+)['"]/gi)];
  if(rows.length<20)throw Error('Incomplete Montgomery ABS directory');
  return rows.flatMap(m=>{
    const name=cleanHtml(m[2].split(/<br\s*\/?>/i)[0]);
    if(/permanently\s*closed|closed\s*for\s*renovations/i.test(cleanHtml(m[2])))return [];
    const full=cleanHtml(m[3]);const a=full.match(/^(.+),\s*([^,]+),\s*MD\s+(\d{5})$/i);
    if(!a)throw Error(`Incomplete Montgomery address ${name}`);
    return [{id:`montgomery-abs-store-${m[1]}`,state:'MD',name:`Montgomery County ABS / Oak Barrel & Vine - ${name}`,
      address:a[1],city:a[2].trim(),zip:a[3],county:'Montgomery',source:'Montgomery County ABS official store directory',
      sourceUrl:'https://mcg.montgomerycountymd.gov/mcg-iframe-template/abs/storeslocation.aspx'}];
  });
}
