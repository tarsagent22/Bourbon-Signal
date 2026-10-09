export const MOBILE_ACTIVITY_INTERVAL_MS = 5 * 60_000;
export type MobileActivityInput = { platform: 'ios' | 'android'; appVersion: string; updateId: string | null };
export type MobileActivityRecord = MobileActivityInput & { firstSeenAt: string; lastSeenAt: string };

export function mobileActivityInput(value: unknown): MobileActivityInput {
  const v = value as Partial<MobileActivityInput> | null;
  if (!v || (v.platform !== 'ios' && v.platform !== 'android') || typeof v.appVersion !== 'string' || !/^[0-9][a-zA-Z0-9.+-]{0,39}$/.test(v.appVersion)
    || (v.updateId !== null && (typeof v.updateId !== 'string' || !/^[a-f0-9-]{36}$/i.test(v.updateId)))) throw new Error('Invalid mobile activity.');
  return { platform: v.platform, appVersion: v.appVersion, updateId: v.updateId };
}

// Only server-owned private metadata supplies the owner directory.
export function mobileActivityRecords(value: unknown): MobileActivityRecord[] {
  if (!value || typeof value !== 'object') return [];
  return (['ios', 'android'] as const).flatMap(platform => {
    const r = (value as Record<string, unknown>)[platform] as MobileActivityRecord | undefined;
    try {
      const input = mobileActivityInput(r);
      if (input.platform !== platform || !r || typeof r.firstSeenAt !== 'string' || typeof r.lastSeenAt !== 'string'
        || !Number.isFinite(Date.parse(r.firstSeenAt)) || !Number.isFinite(Date.parse(r.lastSeenAt)) || Date.parse(r.firstSeenAt) > Date.parse(r.lastSeenAt)) return [];
      return [{ ...input, firstSeenAt: r.firstSeenAt, lastSeenAt: r.lastSeenAt }];
    } catch { return []; }
  }).sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}

export function createMobileActivityHandler(deps: {
  read: (userId: string) => Promise<unknown>;
  save: (userId: string, platform: 'ios' | 'android', record: MobileActivityRecord) => Promise<unknown>;
  now?: () => Date;
}) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };
  return async (request: Request, userId: string | null) => {
    if (!userId) return Response.json({ error: 'Sign in to continue.' }, { status: 401, headers });
    let input: MobileActivityInput;
    try {
      const raw = await request.text();
      if (raw.length > 1024) throw new Error('Too large');
      input = mobileActivityInput(JSON.parse(raw));
    } catch { return Response.json({ error: 'Invalid mobile activity.' }, { status: 400, headers }); }
    try {
      const previous = mobileActivityRecords(await deps.read(userId)).find(r => r.platform === input.platform);
      const now = (deps.now || (() => new Date()))();
      if (!previous || now.getTime() - Date.parse(previous.lastSeenAt) >= MOBILE_ACTIVITY_INTERVAL_MS
        || previous.appVersion !== input.appVersion || previous.updateId !== input.updateId) {
        await deps.save(userId, input.platform, { ...input, firstSeenAt: previous?.firstSeenAt || now.toISOString(), lastSeenAt: now.toISOString() });
      }
      return Response.json({ ok: true }, { headers });
    } catch { return Response.json({ error: 'Activity could not be saved.' }, { status: 503, headers }); }
  };
}
