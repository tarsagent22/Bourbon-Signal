import { mkdir, rm, stat } from 'node:fs/promises';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withStateRunLock(lockPath, task, {
  retryMs = 250,
  staleMs = 20 * 60_000,
  waitTimeoutMs = staleMs + 60_000,
} = {}) {
  const waitStartedAt = Date.now();
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > staleMs) {
          await rm(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code === 'ENOENT') continue;
        throw statError;
      }
      if (Date.now() - waitStartedAt > waitTimeoutMs) {
        throw new Error(`Timed out waiting for state collector lock ${lockPath}`);
      }
      await sleep(retryMs);
    }
  }

  try {
    return await task();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}
