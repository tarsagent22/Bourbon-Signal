type Row = Record<string, unknown>;
type Executor = {
  query: (text: string, params: unknown[]) => Promise<unknown>;
};
export async function writeSourceConsumptionTrace(
  executor: () => Executor,
  rows: Row[],
  stage: string,
  channel: string,
  at: string,
) {
  const sources = new Map<string, number>();
  for (const row of rows)
    if (typeof row.sourcePollId === "string" && row.sourcePollId)
      sources.set(row.sourcePollId, (sources.get(row.sourcePollId) || 0) + 1);
  if (!sources.size) return;
  // One round trip, regardless of how many source providers supply the feed.
  const counts = [...sources].map(([source_id, row_count]) => ({
    source_id,
    row_count,
  }));
  try {
    await executor().query(
      `INSERT INTO source_poll_trace(source_id,stage,channel,last_at,row_count)
      SELECT source_id,$2,$3,$4::timestamptz,row_count
      FROM jsonb_to_recordset($1::jsonb) AS counts(source_id text,row_count integer)
      ON CONFLICT(source_id,stage,channel) DO UPDATE SET last_at=EXCLUDED.last_at,row_count=EXCLUDED.row_count
      WHERE source_poll_trace.last_at <= EXCLUDED.last_at`,
      [JSON.stringify(counts), stage, channel, at],
    );
  } catch {
    /* Telemetry cannot suppress a valid feed. */
  }
}
