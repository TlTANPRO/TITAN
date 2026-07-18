// Coverage report: per-account breakdown of like/comment/view coverage
// Useful for tracking scraping success rate over time.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ACCOUNTS } from './accounts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = path.join(__dirname, 'scraped');

function pct(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function bucket(posts, mediaType) {
  return posts.filter((p) => (p.mediaType ?? '').toUpperCase() === mediaType);
}

async function readAccount(slug) {
  try {
    const text = await fs.readFile(path.join(SCRAPED_DIR, `${slug}.json`), 'utf-8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const rows = [];
  for (const acc of ALL_ACCOUNTS) {
    const data = await readAccount(acc.slug);
    if (!data) continue;
    const posts = data.posts ?? [];
    const total = posts.length;
    if (total === 0) continue;
    const isIG = data.platform === 'instagram';

    const likeCount = posts.filter((p) => (Number(p.likeCount) || 0) > 0).length;
    const commentCount = posts.filter((p) => (Number(p.commentCount) || 0) > 0).length;
    const viewCount = posts.filter((p) => (Number(p.viewCount) || 0) > 0).length;
    const shareCount = posts.filter((p) => (Number(p.shareCount) || 0) > 0).length;
    const saveCount = posts.filter((p) => (Number(p.saveCount) || 0) > 0).length;

    const byType = {};
    for (const t of ['REEL', 'VIDEO', 'IMAGE', 'CAROUSEL_ALBUM']) {
      const list = bucket(posts, t);
      if (list.length === 0) continue;
      byType[t] = {
        count: list.length,
        likePct: pct(list.filter((p) => (Number(p.likeCount) || 0) > 0).length, list.length),
        viewPct: pct(list.filter((p) => (Number(p.viewCount) || 0) > 0).length, list.length),
        commentPct: pct(list.filter((p) => (Number(p.commentCount) || 0) > 0).length, list.length)
      };
    }

    rows.push({
      slug: acc.slug,
      platform: data.platform,
      total,
      likePct: pct(likeCount, total),
      commentPct: pct(commentCount, total),
      viewPct: pct(viewCount, total),
      sharePct: pct(shareCount, total),
      savePct: pct(saveCount, total),
      byType,
      enrichment: data.stats || {}
    });
  }

  console.log('\n=== COVERAGE REPORT ===');
  for (const r of rows) {
    console.log(`\n[${r.platform.toUpperCase()}] ${r.slug} — ${r.total} posts`);
    console.log(`  like ${r.likePct}% | cmt ${r.commentPct}% | view ${r.viewPct}%` +
      (r.platform === 'tiktok' ? ` | share ${r.sharePct}% | save ${r.savePct}%` : ''));
    for (const [t, stats] of Object.entries(r.byType)) {
      console.log(`  ${t.padEnd(16)}: ${stats.count} posts | like ${stats.likePct}% | view ${stats.viewPct}%`);
    }
  }

  // Write JSON report
  const out = path.join(SCRAPED_DIR, '..', 'coverage-report.json');
  await fs.writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), accounts: rows }, null, 2));
  console.log(`\nReport saved to ${out}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
