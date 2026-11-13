import type { SqlExecutor } from './alert-queue/postgres-repository';

type ProjectionKind = 'drops' | 'candidates';
type JobHead = Record<string, unknown> & {
  source_id: string;
  generation: string | number;
  accepted_at: string | null;
  last_reason: string | null;
  projection_key: string | null;
  projection: Record<string, unknown> | null;
};
type Cached = { key: string; projection: NonNullable<JobHead['projection']> };

// Read current authority and any missing payloads in the same SQL statement.
// A lease or a failed poll can change the head without replacing its accepted
// payload. Cache only that payload; never cache last_reason, generation or policy.
export function createSourceProjectionReader() {
  const caches: Record<ProjectionKind, Map<string, Cached>> = {
    drops: new Map(), candidates: new Map(),
  };
  return async (sql: SqlExecutor, kind: ProjectionKind, sourceIds: string[]) => {
    const cache = caches[kind];
    const known = new Map(cache);
    const keys = Object.fromEntries([...known].map(([id, entry]) => [id, entry.key]));
    const { rows } = await sql.query(
      `SELECT source_id, generation, accepted_at, last_reason, projection_key,
         CASE WHEN projection IS NULL OR projection_key = ($2::jsonb ->> source_id)
           THEN NULL ELSE jsonb_build_object($1::text, projection -> $1::text) END AS projection
       FROM (
         SELECT source_id, generation, accepted_at, last_reason, projection,
           CASE WHEN projection IS NOT NULL AND accepted_at IS NOT NULL
             THEN jsonb_build_array(generation::text, accepted_at::text)::text END AS projection_key
         FROM source_poll_jobs WHERE source_id = ANY($3::text[])
       ) AS current_jobs ORDER BY source_id`,
      [kind, JSON.stringify(keys), sourceIds],
    );
    const jobs = (rows as JobHead[]).map(({ projection_key: key, projection, ...head }) => {
      const previous = known.get(head.source_id);
      const payload = key !== null && previous?.key === key ? previous.projection : projection;
      if (key !== null && payload) cache.set(head.source_id, { key, projection: payload });
      else cache.delete(head.source_id);
      return { ...head, projection: payload };
    });
    const currentIds = new Set(sourceIds);
    for (const id of cache.keys()) if (!currentIds.has(id)) cache.delete(id);
    return jobs;
  };
}
