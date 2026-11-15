import { canonicalBottleId } from './bottle-identity-redirects';
import { currentEvidence } from './bottle-reputation';
import type { BottleProfile } from './bottle-profile';

const NC = 'https://www.abc.nc.gov/pricing/2026-november-price-list/open';
const VA = 'https://www.abc.virginia.gov/library/products/pdfs/monthly-specials-november-2026.pdf?hash=E5CDAD28875190E501FECB26B5ADF85D&rev=28a07903dd2448f3a41aaefdbba62288';
const rules = 'https://legal.brown-forman.com/terms-and-conditions/us-of-birthday-bourbon-sweepstakes-rules-2026';
type ListRow = readonly [sku: string, amount: number, sizeMl?: number];
export const BOTTLE_CHECK_STATE_PRICES = {
  NC: {
    url: NC, starts: '2026-11-01', endsBefore: '2027-02-01',
    bottles: {
      'buffalo-trace-bourbon': ['20-611', 32.95],
      'eagle-rare-10': ['27-169', 44.95],
      'eagle-rare-12': ['17-112', 49.95],
      'eh-taylor-small-batch': ['20-581', 54.95],
      'eh-taylor-single-barrel': ['20-192', 79.95],
      'wild-turkey-101': ['25-583', 27.95],
      'wild-turkey-101-rye': ['22-382', 27.95],
      'wild-turkey-rare-breed': ['25-580', 54.95],
      'russells-reserve-10': ['27-162', 44.95],
      'blantons-single-barrel': ['27-090', 82.95],
      'elijah-craig-small-batch': ['23-564', 34.95],
      'elijah-craig-toasted-barrel': ['27-106', 44.95],
      'four-roses-small-batch': ['27-066', 36.95],
      'four-roses-small-batch-select': ['27-076', 54.95],
      'four-roses-yellow-label': ['27-069', 22.95],
      'makers-mark': ['24-275', 33.95],
      'makers-mark-46': ['24-280', 39.95],
      'makers-mark-cask-strength': ['24-284', 49.95],
      'old-forester-1870': ['27-280', 45.95],
      'old-forester-1897': ['27-281', 49.95],
      'old-forester-1910': ['27-282', 55.95],
      'old-forester-1920': ['27-283', 59.95],
      'russells-reserve-single-barrel': ['27-201', 64.95],
      'old-forester-birthday-bourbon-2026': ['17-122', 199.95, 700],
    } satisfies Record<string, ListRow>,
  },
  VA: {
    url: VA, starts: '2026-11-01', endsBefore: '2026-12-01',
    // Regular bottle prices, not temporary discounts or prices per liter.
    bottles: {
      'wild-turkey-101': ['022156', 27.99],
      'wild-turkey-101-rye': ['027116', 27.99],
      'wild-turkey-rare-breed': ['022199', 52.99],
      'woodford-reserve': ['022215', 39.99],
      'basil-haydens': ['016676', 42.99],
    } satisfies Record<string, ListRow>,
  },
};
type Benchmark = { amount: number; sizeMl: number; label: string; date: string; url: string };

export function bottlePriceBenchmarks(bottle: Pick<BottleProfile, 'id'>, state: string, now: Date): { state: Benchmark | null; msrp: Benchmark | null } {
  const id = canonicalBottleId(bottle.id);
  const list = Object.hasOwn(BOTTLE_CHECK_STATE_PRICES, state) ? BOTTLE_CHECK_STATE_PRICES[state as keyof typeof BOTTLE_CHECK_STATE_PRICES] : null;
  const prices: Record<string, ListRow> | undefined = list?.bottles;
  const row = prices && Object.hasOwn(prices, id) ? prices[id] : null;
  const time = now.getTime();
  const statePrice = list && row && time >= Date.parse(list.starts) && time < Date.parse(list.endsBefore)
    ? { amount: row[1], sizeMl: row[2] ?? 750, label: state + ' ABC list price · ' + row[0], date: list.starts, url: list.url } : null;
  const reviewed = id === 'eagle-rare-12' ? {
    amount: 49.99, sizeMl: 750, label: 'Buffalo Trace launch MSRP', date: '2025-06-09',
    url: 'https://www.bevnet.com/pr/2025/06/10/buffalo-trace-distillery-reaches-higher-with-the-introduction-of-eagle-rare-12-a-permanent-new-addition-to-its-awardwinning-portfolio',
  } : id === 'old-forester-birthday-bourbon-2026' ? { amount: 199, sizeMl: 700, label: 'Brown-Forman sweepstakes MSRP', date: '2026-09-02', url: rules } : null;
  const msrp = reviewed && currentEvidence(reviewed.date, now, 730) && (!statePrice || statePrice.sizeMl === reviewed.sizeMl) ? reviewed : null;
  return { state: statePrice, msrp };
}
