// V34.13+: write-worker-status — emit scripts/worker-status.json as a
// git-committed, no-service-required notification marker. Workflow Summary step
// surfaces lastFreshCount and last success timestamp; owner can curl
// https://raw.githubusercontent.com/tltanpro/TITAN/main/scripts/worker-status.json
// for at-a-glance status.
//
// Fields:
//   lastAttempt       — ISO timestamp of this run (always)
//   lastSuccess       — preserved from previous file; deploy.mjs overwrites on push
//   lastFreshCount    — posts dated today UTC across scraped/*.json
//   lastError         — populated from WORKER_LAST_ERROR env if set
//   lastSundayCatchup — ISO timestamp if this was a Sunday run with fresh data
//   lastRunDurationMs — from WORKER_RUN_DURATION_MS env if set
//
// Safe to re-run, atomic write via tmp+rename.

import { readdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');
const STATUS_PATH = path.join(__dirname, 'worker-status.json');

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function postDateUtc(post) {
  const t = post.createTime ?? post.timestamp ?? 0;
  if (!t) return null;
  const ms = t > 1e12 ? t : t * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(path, data) {
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, path);
}

async function countFreshPosts() {
  let total = 0;
  const today = todayUtc();
  let files;
  try {
    files = await readdir(SCRAPED_DIR);
  } catch {
    return 0;
  }
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(await readFile(path.join(SCRAPED_DIR, file), 'utf8'));
      const posts = data?.posts ?? data?.account?.posts ?? [];
      total += posts.filter((p) => postDateUtc(p) === today).length;
    } catch {
      // ignore parse errors — health check has its own output
    }
  }
  return total;
}

async function main() {
  const prev = await readJson(STATUS_PATH, {});
  const now = new Date().toISOString();
  const freshCount = await countFreshPosts();
  const isSunday = process.env.IS_SUNDAY === 'true' || new Date().getUTCDay() === 0;

  const status = {
    lastAttempt: now,
    lastSuccess: prev.lastSuccess ?? null,
    lastFreshCount: freshCount,
    lastError: process.env.WORKER_LAST_ERROR || null,
    lastSundayCatchup:
      isSunday && freshCount > 0
        ? now
        : prev.lastSundayCatchup ?? null,
    lastRunDurationMs: Number(process.env.WORKER_RUN_DURATION_MS || 0) || prev.lastRunDurationMs || 0
  };

  await writeJsonAtomic(STATUS_PATH, status);
  console.log(`[write-worker-status] wrote ${STATUS_PATH}`);
  console.log(JSON.stringify(status, null, 2));
}

main().catch((err) => {
  console.error('[write-worker-status] fatal:', err);
  process.exit(1);
});
