import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {PEARSONS_DC_SOURCE,parsePearsonsDcCapture,isPearsonsDcResearchInventory} from './collectors/pearsons-dc-research.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';

const fixture=new URL('../test/fixtures/pearsons-dc/product-page.html',import.meta.url);
function setValue(html,from,to){if(!html.includes(from))throw new Error(`Fixture sentinel missing: ${from}`);return html.replace(from,to);}
export async function executePearsonsDcFixtures(payload,{bible}={}){
  const failures=[],nowMs=Date.now(),clock=new Date(nowMs).toISOString();
  const original=await readFile(fixture,'utf8');
  for(const item of payload.cases||[]){
    if(item.input?.sourceId!=='pearsons-wine-dc'){failures.push(`${item.id}: source must be the reviewed Pearson's DC merchant.`);continue;}
    let html=original;
    if(item.input.ordinary)html=setValue(html,"Blanton's Single Barrel Bourbon","Unidentified Straight Bourbon");
    if(item.input.cream)html=setValue(html,"Blanton's Single Barrel Bourbon","Bourbon Cream Liqueur");
    if(item.input.wrongSize)html=setValue(html,'750ml','50ml');
    if(item.input.wrongPremise)html=setValue(html,'2436 Wisconsin Avenue NW','999 Other Street');
    if(item.input.wrongVariant)html=setValue(html,PEARSONS_DC_SOURCE.variantId,'11111111111111');
    const parsed=parsePearsonsDcCapture(Buffer.from(html),{url:PEARSONS_DC_SOURCE.productUrl,
      headers:`HTTP/1.1 200 OK\nDate: ${new Date(nowMs).toUTCString()}\n`,bible});
    const row=parsed&&{...parsed,observedAt:item.input.stale?new Date(nowMs-3*60*60_000).toISOString():clock};
    const proof=!!row&&isPearsonsDcResearchInventory(row,{nowMs});
    const operational=row?canonicalizeSignal(row,bible):null;
    const candidates=operational?buildDrops([operational],bibleLookup(bible.records),[operational]):[];
    const actual={sourceRows:row?1:0,inventoryProofRows:proof?1:0,candidateCount:proof?candidates.length:0,
      canonicalNames:proof?[row.canonicalName]:[],quantity:row?.quantity??null,quantityIsExact:row?.quantityIsExact??null,
      semantics:row?.inventorySemantics??null,preservesOriginalTimestamp:!row||row.observedAt===(item.input.stale?new Date(nowMs-3*60*60_000).toISOString():clock),
      deliveryEligible:!!row&&(row.canAlertAsInventory||row.canAlertAsWatch||row.eligibleForDelivery)};
    for(const[key,expected]of Object.entries(item.expected||{}))if(JSON.stringify(actual[key])!==JSON.stringify(expected))
      failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)} but got ${JSON.stringify(actual[key])}.`);
  }
  return{ok:failures.length===0,failures};
}
if(import.meta.url===(process.argv[1]?pathToFileURL(process.argv[1]).href:'')){
  const payload=JSON.parse(await readFile(process.argv[2],'utf8'));
  const result=await executePearsonsDcFixtures(payload,{bible:await BourbonBible.load()});
  if(!result.ok){console.error(result.failures.join('\n'));process.exit(1);}console.log('Pearson DC executable fixtures passed.');
}
