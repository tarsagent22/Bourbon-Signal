// Runtime wire contracts. Unknown additive fields are allowed; required fields never default
// to success. Keep these aligned with types.ts and the canonical server responses.
type Check = (value: unknown) => boolean;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str: Check = v => typeof v === 'string';
const num: Check = v => typeof v === 'number' && Number.isFinite(v);
const bool: Check = v => typeof v === 'boolean';
const one = (...values: unknown[]): Check => v => values.includes(v);
const nullable = (check: Check): Check => v => v === null || check(v);
const optional = (check: Check): Check => v => v === undefined || check(v);
const arr = (check: Check): Check => v => Array.isArray(v) && v.every(check);
const obj = (shape: Record<string, Check>): Check => v => record(v) && Object.entries(shape).every(([k, check]) => check(v[k]));
const strings = arr(str);
const tier = one('free', 'standard', 'barrel', 'bottled-in-bond');
const mobileVersion = one('bourbon-signal/mobile-api@1');
const signalVersion = one('bourbon-signal/signal@1');
const scope = obj({ type: one('state', 'county', 'city', 'board', 'store'), id: str, state: str, label: str });
const signal = obj({ contractVersion: signalVersion, id: str, kind: one('availability', 'release', 'event'),
  source: obj({ type: one('member', 'retailer', 'trusted_source', 'release_source'), label: str }),
  bottle: obj({ name: str }), location: obj({ scope: one('exact_store', 'area', 'board', 'state', 'online', 'unknown') }),
  timing: obj({ displayAt: str }), evidence: obj({ photo: bool, corroborationCount: num, helpfulCount: num, retailerReported: bool, sourceBacked: bool }),
  strength: one('best', 'more_activity'), alertEligibility: obj({ inventory: bool, watch: bool }), actions: arr(one('watch_bottle', 'watch_store', 'confirm', 'correct', 'helpful', 'report')) });
const collectionBottle = obj({ bottleId: str, bottleName: str, canonicalKey: str, rating: num, isRated: bool,
  sealedQuantity: num, openedQuantity: num, finishedCount: num, tastedOnly: bool, addedAt: str, updatedAt: str });
export const preferencesResponse = obj({
  collectionAccess: obj({ canRead: bool, canEditExisting: bool, canAdd: bool, limit: nullable(num), remaining: nullable(num), showCapacityNotice: bool }),
  areaPreferences: obj(Object.fromEntries(['states','ncBoards','gaAreas','tnAreas','vaCities','ohCities','iaCities','idCities','scAreas','caAreas','nvAreas','nyAreas','coAreas','paCounties','paStores'].map(k => [k, strings]))),
  monitoringScopes: arr(scope), notificationPreferences: obj({ rarityTiers: arr(one('unicorn','allocated','limited')),
    onSite: obj({ enabled: bool }), push: obj({ enabled: bool }), email: obj({ enabled: bool, mode: one('all','major_only') }),
    sms: obj({ enabled: bool, available: bool, verified: bool, mode: one('major_only','specific_bottles'), phone: optional(str) }), sightings: obj({ enabled: bool }) }),
  alertMode: one('specific_bottles','anything_notable'), bottleAlertPreferences: obj({ bottleNames: strings, bottleKeys: strings }),
  collectionPreferences: obj({ bottles: arr(collectionBottle), version: num }),
});
const profile = obj({ contractVersion: mobileVersion, profile: obj({ identity: nullable(obj({ kind: one('founder','member'), number: num, label: str })),
  displayName: str, customDisplayName: nullable(str), feedAreas: obj({ states: arr(obj({ code: str, label: str, areaLabel: one('Board','City'), options: arr(obj({ value: str, label: str })) })) }),
  membership: obj({ tier, label: str, paid: bool, hasBetaAccess: bool }), entitlements: obj({ fullFeed: bool, canSubmitSignals: bool }) }) });
const alerts = obj({ alerts: arr(obj({ id: str, bottleName: str, state: str, storeLabel: str, matchedArea: str, eventType: str,
  rarityTier: nullable(one('limited','allocated','unicorn')), quantity: nullable(num), score: num, priorityClass: one('major','standard'), createdAt: str, readAt: nullable(str), archivedAt: nullable(str) })), unreadCount: num });
const bottles = obj({ bottles: arr(v => record(v) && [v.canonicalName, v.name, v.bottle].some(str)) });
const outcome = obj({ contractVersion: mobileVersion, outcome: nullable(obj({ signalId: str, availabilityEpisodeId: str, outcome: one('found_it','gone_when_checked','didnt_go'), sourceType: one('member','retailer','trusted_source','release_source'), stateCode: nullable(str), submittedAt: str, updatedAt: str })) });
const checks: Record<string, Check> = {
  '/api/user/preferences': preferencesResponse,
  '/api/v1/me/profile': profile,
  '/api/alerts': alerts,
  '/api/bottles': bottles, '/api/bottle-catalog': bottles,
  '/api/stores': obj({ stores: arr(obj({ city: optional(str), state: optional(str) })) }),
  '/api/membership-trial': obj({ standardMonthly: obj({ eligible: bool, reason: str }), barrelMonthly: obj({ eligible: bool, reason: str }) }),
  '/api/v1/me/push-devices': obj({ supported: bool, enabled: bool, registeredDeviceCount: num, currentDeviceRegistered: optional(bool) }),
  '/api/sightings': obj({ ok: one(true), created: bool, sighting: obj({ id: str }) }),
  '/api/sightings/photo': obj({ ok: one(true), photoProof: obj({ url: str, pathname: str, uploadedAt: str, status: one('verified_public') }) }),
  '/api/bottle-contributions': obj({ ok: one(true), contribution: obj({ id: str }) }),
  '/api/signal-points': obj({ balance: num, debt: num, tier, redemptionEligible: bool, catalog: arr(obj({ key: str, name: str, points: num, fulfillmentType: one('physical','digital') })), redemptions: arr(obj({ id: str, itemKey: str, pointsSpent: num, status: str, createdAt: str, updatedAt: str })) }),
  '/api/v1/geography': obj({ contractVersion: mobileVersion, states: arr(obj({ id: str, code: str, name: str })), results: arr(obj({ id: str, level: one('state','county','city','board','store'), state: str, name: str, message: nullable(str), coverage: obj({ engine: obj({ status: one('active','expanding') }), community: obj({ active: bool, recentSightings: num, windowDays: num }) }) })), offset: num, limit: num, hasMore: bool }),
  '/api/v1/signals': obj({ contractVersion: signalVersion, view: one('market','community','all'), signals: arr(signal), marketSummaries: arr(obj({ state: str, areaLabel: str, signalCount: num, bottleNames: strings })), total: num, nextCursor: nullable(str), hasMore: bool, degraded: bool, access: obj({ previewLocked: bool, requiresAccountForFullFeed: bool, memberSignalsAvailable: bool, marketDetailsLocked: bool }) }),
};
export function validApiResponse(path: string, value: unknown): boolean {
  const pathname = path.split('?')[0];
  if (pathname === '/api/referrals/me') return true; // Dedicated referral parser supplies its existing typed error.
  const check = checks[pathname] || (/^\/api\/v1\/signals\/[^/]+\/outcome$/.test(pathname) ? outcome : /^\/api\/v1\/signals\/[^/]+$/.test(pathname) ? obj({ contractVersion: mobileVersion, signal }) : null);
  return !!check && check(value);
}
