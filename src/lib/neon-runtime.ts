import { neon } from "@neondatabase/serverless";

export function runtimeNeonConnectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL
    || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.DATABASE_URL
    || null;
}

export function migrationNeonConnectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.BOURBON_QUEUE_DATABASE_URL
    || env.DATABASE_URL
    || null;
}

export function createRuntimeNeonClient(env: NodeJS.ProcessEnv = process.env) {
  const connectionString = runtimeNeonConnectionString(env);
  if (!connectionString) throw new Error("Durable application storage is not configured.");
  return neon(connectionString);
}
