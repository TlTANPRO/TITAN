// Aggregate scraped/*.json → src/data/accounts-full.json
// Run after validate. Real data only — no dummy/fallback.
// Accounts with no scrape file are skipped (visible in summary).
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ACCOUNTS } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');
const OUT_DIR = path.join(__dirname, '..', 'src', 'data');

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const allData = [];
  const missing = [];

  for (const acc of ALL_ACCOUNTS) {
    const scrapedPath = path.join(SCRAPED_DIR, `${acc.slug}.json`);
    let data = null;
    try {
      data = JSON.parse(await fs.readFile(scrapedPath, 'utf-8'));
      console.log(`✅ ${acc.slug} — ${data.posts?.length ?? 0} posts`);
    } catch {
      missing.push(acc.slug);
      console.warn(`⚠️  ${acc.slug} — no scrape file, skipped`);
      continue;
    }

    data.account.slug = data.account.slug ?? acc.slug;
    data.account.username = data.account.username ?? acc.username;
    allData.push(data);
  }

  const outPath = path.join(OUT_DIR, 'accounts-full.json');
  await fs.writeFile(outPath, JSON.stringify(allData, null, 2));
  const totalPosts = allData.reduce((s, a) => s + (a.posts?.length ?? 0), 0);
  console.log(`\n=== GENERATE COMPLETE ===`);
  console.log(`Output: ${outPath}`);
  console.log(`Real accounts: ${allData.length}/${ALL_ACCOUNTS.length}`);
  console.log(`Total posts: ${totalPosts}`);
  if (missing.length > 0) {
    console.log(`Missing (no real data): ${missing.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
