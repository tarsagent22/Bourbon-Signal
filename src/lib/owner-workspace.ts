import { neon } from '@neondatabase/serverless';
export function coverageDatabase() {
  const connection = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL;
  if (!connection) throw new Error('Workspace database unavailable');
  return neon(connection);
}
