import { createSignalPointsRepository } from './signal-points-repository';
import { neon } from '@neondatabase/serverless';

export async function reconcileQualityOutcomeReward(userId: string, episodeId: string) {
  await createSignalPointsRepository().assertCutoverVerified();
  const url = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('Reward storage is unavailable.');
  const sql = neon(url);
  const rows = await sql`SELECT * FROM reconcile_quality_outcome_reward(${userId},${episodeId})`;
  return { points: Number(rows[0]?.points || 0), balance: Number(rows[0]?.balance || 0) };
}
