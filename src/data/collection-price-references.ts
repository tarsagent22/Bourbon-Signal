import type { CollectionPriceReference } from '../lib/collection-value';

// Manually reviewed USD reference snapshot, 2026-10-05. Standard 750 ml modern
// bottlings only. No legacy undated Bottle Check ranges or inferred retail-as-MSRP.
// Manufacturer MSRP is the published reference for the release stated in label.
const vanWinkleSource = 'https://cms.buffalotracedistillery.com/wp-content/uploads/2025/11/FINAL_2025-Van-Winkle-Collection-Press-Release.pdf';
const vw = (amount: number) => ({ amount, date: '2025-09-10', source: vanWinkleSource, label: 'Buffalo Trace · 2025 release MSRP · 750 ml' });
const market = (low: number, high: number, date: string, id: number) => ({ low, high, date, source: `https://bottlebluebook.com/bottle/${id}/${({579:'Pappy%2BVan%2BWinkle%2B15%2BYear',578:'Pappy%2BVan%2BWinkle%2B20%2BYear',577:'Pappy%2BVan%2BWinkle%2B23%2BYear',67:'Old%2BRip%2BVan%2BWinkle%2B10yr',574:'Weller',759:'Weller'} as Record<number,string>)[id]}`, label: 'Bottle Blue Book · modern 750 ml market reference' });
export const COLLECTION_PRICE_REFERENCES: readonly CollectionPriceReference[] = [
  { bottleId: 'pappy-van-winkle-15', names: ['Pappy Van Winkle 15 Year'], msrp: vw(239.99), secondary: market(1310,1450,'2026-10-04',579) },
  { bottleId: 'pappy-van-winkle-20', names: ["Pappy Van Winkle's Family Reserve 20Y"], msrp: vw(359.99), secondary: market(1765,1955,'2026-10-04',578) },
  { bottleId: 'pappy-van-winkle-23', names: ["Pappy Van Winkle's Family Reserve 23Y"], msrp: vw(499.99), secondary: market(2970,3290,'2026-10-04',577) },
  { bottleId: 'old-rip-van-winkle-10', names: ['Old Rip Van Winkle 10 Year'], msrp: vw(149.99), secondary: market(575,645,'2026-10-04',67) },
  { bottleId: 'van-winkle-special-reserve-12y', names: ['Van Winkle Special Reserve 12Y'], msrp: vw(169.99) },
  { bottleId: 'van-winkle-family-reserve-rye-13y', names: ['Van Winkle Family Reserve Rye 13Y'], msrp: vw(229.99) },
  { bottleId: 'weller-full-proof', names: ['W.L. Weller Full Proof'], secondary: market(100,120,'2026-09-06',574) },
  { bottleId: 'weller-single-barrel', names: ['Weller Single Barrel'], secondary: market(215,245,'2026-09-27',759) },
  { bottleId: 'weller-cypb', names: ['Weller CYPB'], secondary: { low: 255, high: 285, date: '2026-09-27', source: 'https://bottlebluebook.com/bottle/555/Weller', label: 'Bottle Blue Book · modern 750 ml market reference' } },
  { bottleId: 'russells-reserve-13-year', names: ["Russell's Reserve 13 Year"], msrp: { amount: 200, date: '2026-06-03', label: "Russell's Reserve · Spring 2026 release MSRP · 750 ml", source: 'https://www.prnewswire.com/news-releases/russells-reserve-honors-eddie-russells-45-year-legacy-with-a-cinematic-tribute-and-the-spring-2026-return-of-the-13-year-old-302790216.html' } },
  { bottleId: 'eagle-rare-12', names: ['Eagle Rare 12 Year'], msrp: { amount: 49.99, date: '2025-06-09', label: 'Buffalo Trace · Eagle Rare 12 launch MSRP · 750 ml', source: 'https://www.bevnet.com/pr/2025/06/10/buffalo-trace-distillery-reaches-higher-with-the-introduction-of-eagle-rare-12-a-permanent-new-addition-to-its-awardwinning-portfolio' } },
];
