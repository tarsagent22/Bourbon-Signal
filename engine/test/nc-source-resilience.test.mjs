import test from 'node:test';
import assert from 'node:assert/strict';
import { ncRouteKey, ncBoardKey, selectNcBoardRoutes, updateNcBoardRegistry, summarizeNcBoardSources, fetchNcBoardPage, NC_REVIEWED_BOARD_WEBSITES } from '../src/nc-board-discovery.mjs';
import { discoverBoardPages, parseDurhamPublicProductCards, parseNewHanoverBarrelItems, ncProductParserHealth, prioritizeNcBoardWebsiteTargets, ncOfficialPricingReportIdentity, ncReviewedPricingReportUrls } from '../src/collectors/north-carolina-intelligence.mjs';
import { buildNcSourceLedger } from '../src/nc-source-ledger.mjs';

const root='https://board.example/';
test('real official links get budget before guessed paths and unvisited links rotate', () => {
  const links=Array.from({length:20},(_,i)=>`${root}announcements/${i}`);
  const args={pinned:[root],discovered:links,guesses:[`${root}inventory`,`${root}products`,`${root}lottery`],seeds:[root],limit:8};
  const first=selectNcBoardRoutes(args);
  assert.equal(first.urls.length,8);
  assert.equal(first.urls.filter(u=>links.includes(u)).length,5);
  const previous=updateNcBoardRegistry({},first.urls.map(url=>({url,ok:true,status:200,checkedAt:'2026-10-06T12:00:00Z',capabilities:[]})),{seeds:[root],pinned:[root],discovered:links,cursor:first.nextCursor});
  const second=selectNcBoardRoutes({...args,previous});
  assert.ok(second.urls.some(url=>links.includes(url)&&!first.urls.includes(url)));
  assert.ok(second.urls.includes(`${root}lottery`));
});

test('learned routes survive a missing homepage link without trusting a foreign identity',()=>{
  const previous={routes:{[ncRouteKey(`${root}lottery`)]:{url:`${root}lottery`,kind:'discovered'},evil:{url:'https://evil.example/lottery',kind:'pinned'}}};
  const plan=selectNcBoardRoutes({seeds:[root],previous,limit:8});
  assert.ok(plan.urls.includes(`${root}lottery`));
  assert.ok(!plan.urls.some(u=>u.includes('evil')));
  assert.equal(ncRouteKey('https://user:password@board.example/'),null);
});

test('NC discovery fetches real homepage links and records HTTP failures including empty bodies',async()=>{
  const requests=[];
  const reports=await discoverBoardPages({boardName:'Test ABC Board',website:root},{fetchPage:async url=>{
    requests.push(url);
    if(url===root)return {ok:true,status:200,url,text:'<a href="/#">News</a><a href="/bourbon-lottery">Bourbon lottery</a><a href="https://evil.example/lottery">Lottery</a>',contentType:'text/html'};
    return {ok:false,status:404,url,text:'',contentType:'text/html'};
  }});
  assert.ok(requests.includes(`${root}bourbon-lottery`));
  assert.ok(!requests.some(u=>u.includes('evil')));
  assert.ok(reports.some(r=>r.url===`${root}bourbon-lottery`&&!r.ok&&r.status===404));
  assert.equal(requests.filter(u=>u===root).length,1);
  assert.equal(requests.filter(u=>ncRouteKey(u)===ncRouteKey(root)).length,1);
  assert.ok(reports.registry.routes[ncRouteKey(`${root}bourbon-lottery`)].consecutiveFailures>0);
});

test('transient page failure retries once, access denial and rate limiting do not',async()=>{
  for(const status of [0,503,403,429]){
    let count=0;
    const result=await fetchNcBoardPage(root,{fetchPage:async()=>({ok:++count>1,status:count>1?200:status,text:'',url:root})});
    assert.equal(count,[0,503].includes(status)?2:1);
    assert.equal(result.attemptCount,count);
  }
  const controller=new AbortController();controller.abort();
  await assert.rejects(fetchNcBoardPage(root,{signal:controller.signal,fetchPage:()=>{throw Error('must not fetch')}}));
});

test('board sales may redirect only to the reviewed official Commission report host',async()=>{
  const reports=await discoverBoardPages({boardName:'Test ABC Board',website:root},{fetchPage:async url=>({
    ok:true,status:200,url:url===root?root:'https://report.abc.nc.gov/build_pdf.aspx?type=pricing&report=reduced_retail_list',
    text:url===root?'<a href="/monthly-specials">Monthly specials</a>':'Official pricing report',contentType:'text/html',
  })});
  assert.equal(reports.find(r=>r.url===`${root}monthly-specials`).sourceIdentityVerified,true);
  assert.equal(ncOfficialPricingReportIdentity(`${root}monthly-specials`,'https://evil.example/build_pdf.aspx?type=pricing&report=reduced_retail_list',[root]),false);
  assert.equal(ncOfficialPricingReportIdentity(`${root}products`,'https://report.abc.nc.gov/build_pdf.aspx?type=pricing&report=reduced_retail_list',[root]),false);
});

test('reviewed pricing destinations roll forward automatically and retain only one prior month',()=>{
  const urls=ncReviewedPricingReportUrls(new Date('2027-01-06T12:00:00Z'));
  assert.deepEqual(urls.map(url=>new URL(url).searchParams.get('param0')),['1/1/2027','12/1/2026']);
});

test('failed known sources keep last success separately and never become healthy from shipments',()=>{
  const previous=updateNcBoardRegistry({},[{url:root,ok:true,status:200,checkedAt:'2026-10-05T12:00:00Z',capabilities:[]}],{seeds:[root],pinned:[root]});
  const reports=[{url:root,ok:false,status:403,error:'Forbidden',checkedAt:'2026-10-06T12:00:00Z'}];
  const current=updateNcBoardRegistry(previous,reports,{seeds:[root],pinned:[root]});
  assert.equal(current.routes[ncRouteKey(root)].lastSuccessAt,'2026-10-05T12:00:00Z');
  const health=summarizeNcBoardSources([{boardName:'Test ABC Board',website:root,trackedShipmentRows:20,officialPageReports:reports}],{[ncBoardKey('Test ABC Board')]:current},{now:Date.parse('2026-10-06T13:00:00Z'),shipmentObservedAt:'2026-10-01T13:00:00Z',shipmentRetrievedAt:'2026-10-06T12:00:00Z'});
  assert.equal(health.boards[0].status,'unreachable');
  assert.equal(health.boards[0].shipmentStatus,'upstream_stale');
  assert.equal(health.boards[0].lastSuccessfulPageAt,null);
  assert.equal(health.boards[0].consecutiveFailures,1);
});

test('specialized success supersedes an earlier generic failure for the same route',()=>{
  const health=summarizeNcBoardSources([{boardName:'Test ABC Board',website:root,officialPageReports:[{url:root,ok:false,status:403},{url:root,ok:true,status:200,checkedAt:'2026-10-06T12:00:00Z'}]}]);
  assert.equal(health.boards[0].status,'healthy');
  assert.equal(health.boards[0].failedPageCount,0);
});

test('no registered website and a skipped known source remain distinct',()=>{
  const health=summarizeNcBoardSources([{boardName:'Unknown ABC Board'},{boardName:'Known ABC Board',website:root}]);
  assert.equal(health.boards[0].status,'no_public_website_registered');
  assert.equal(health.boards[1].status,'not_checked');
});

test('boards beyond the discovery cohort rotate oldest-first',()=>{
  const boards=[{boardName:'Busy ABC Board',website:root,trackedUnits:1000},{boardName:'Quiet ABC Board',website:root,trackedUnits:1}];
  const selected=prioritizeNcBoardWebsiteTargets(boards,1,{[ncBoardKey('Busy ABC Board')]:{lastCheckedAt:'2026-10-06T12:00:00Z'}});
  assert.equal(selected[0].boardName,'Quiet ABC Board');
});

test('New Hanover headings can change style and still capture 1792 and Maker while rejecting tequila',()=>{
  const html=`<h2>1792 Full Proof</h2><p><strong>NC Code:</strong> 19531<br/>125 Proof | .750L | $49.95</p><h3>Maker’s Mark Private Select</h3><p><b>NC Code:</b> 24282<br/>111 Proof | .750L | $69.95</p><h2>Corazon Blanco Tequila</h2><p><strong>NC Code:</strong> 99999<br/>80 Proof | .750L | $39.95</p>`;
  const rows=parseNewHanoverBarrelItems(html);
  assert.deepEqual(rows.map(r=>r.ncCode),['19531','24282']);
});

test('modern Durham cards bind NC code, name, price and aggregate counts without accepting unrelated spirits',()=>{
  const card=(code,name,stock)=>`<a href="/products/${code}?q=bourbon"><h3>${name}</h3><p>.75L</p><span>$49.95</span><span>${stock}</span></a>`;
  const rows=parseDurhamPublicProductCards(card('27169','Eagle Rare Bourbon','In Stock (<span>13</span>)')+card('27090','Blanton&#39;s Bourbon','Out of Stock')+card('99999','Buffalo Trace Bourbon Cream','In Stock (20)'));
  assert.equal(rows.length,2);
  assert.equal(rows[0].sourceReportedBoardQuantity,13);
  assert.equal(rows[1].sourceReportedBoardQuantity,0);
  assert.equal(rows[0].price,49.95);
  assert.equal(rows[0].sourceUrl,'https://www.durhamabc.com/products/27169?q=bourbon');
  assert.equal(rows[1].rawName,"Blanton's Bourbon");
});

test('HTTP success with product markers but zero parsed rows is explicit parser drift',()=>{
  assert.equal(ncProductParserHealth('<p><strong>NC Code:</strong> 12345</p>',0).status,'parser_drift');
  assert.equal(ncProductParserHealth('<p>No products currently listed.</p>',0).status,'parsed');
});

test('source ledger uses real evidence timestamps rather than a new shipment retrieval stamp',()=>{
  const ledger=buildNcSourceLedger([{state:'NC',source:'NC ABC Commission board list',name:'Test ABC Board',notes:'board id 1'}],{generatedAt:'2026-10-06T12:00:00Z',stockShipped:{observedAt:'2026-10-01T12:00:00Z',retrievedAt:'2026-10-06T12:00:00Z'},boards:[{boardName:'Test ABC Board',trackedShipmentRows:5}],sourceHealth:{boards:[{boardName:'Test ABC Board',status:'no_public_website_registered',shipmentStatus:'upstream_stale',lastSuccessfulPageAt:null}]}});
  assert.equal(ledger.boards[0].lastSuccessfulSupportingEvidenceAt,'2026-10-01T12:00:00Z');
  assert.equal(ledger.boards[0].shipmentRetrievedAt,'2026-10-06T12:00:00Z');
  assert.equal(ledger.boards[0].supportingEvidenceHealth,'upstream_stale');
});

test('reviewed corrections use complete verified official domains',()=>{
  assert.equal(new URL(NC_REVIEWED_BOARD_WEBSITES['Indian Trail ABC Board']).hostname,'indiantrail.ncabcboards.com');
  assert.equal(new URL(NC_REVIEWED_BOARD_WEBSITES['Canton ABC Board']).hostname,'canton.ncabcboards.com');
  assert.equal(new URL(NC_REVIEWED_BOARD_WEBSITES['Rowan/Kannapolis ABC Board']).hostname,'rowankannapolisabc.com');
});
