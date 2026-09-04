import { neon } from "@neondatabase/serverless";
import { PostgresAlertQueueRepository, type SqlExecutor } from "./postgres-repository";

export function alertQueueConnectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL
    || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.DATABASE_URL
    || null;
}

export function alertQueueDatabaseConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(alertQueueConnectionString(env));
}

export function createProductionAlertQueueSqlExecutor(env: NodeJS.ProcessEnv = process.env): SqlExecutor {
  const connectionString = alertQueueConnectionString(env);
  if (!connectionString) {
    throw new Error("Durable alert queue is not configured: missing BOURBON_QUEUE_DATABASE_URL.");
  }
  const query = neon(connectionString);
  const executor: SqlExecutor = {
    async query(text, params = []) {
      const rows = await query.query(text, params);
      return { rows: rows as Array<Record<string, unknown>> };
    },
  };
  return executor;
}

export function createProductionAlertQueueRepository(env: NodeJS.ProcessEnv = process.env) {
  return new PostgresAlertQueueRepository(createProductionAlertQueueSqlExecutor(env));
}
