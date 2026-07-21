// Layer 1 smoke test — verify all 4 free providers work from this server
// Tests 1 known IG post + 1 known TT post against each provider
// Run BEFORE real scrape to catch silent provider failures early
import { ACCOUNTS_IG, ACCOUNTS_TT } from './accounts.mjs';

const IG_TEST_POST = {
  shortcode: 'DavGLefkwbZ',
  url: 'https://www.instagram.com/p/DavGLefkwbZ/',
  account_slug: 'ig-majangmejeng_'
};

const TT_TEST_POST = {
  videoId: '7664121536290327816',
  url: 'https://www.tiktok.com/@majangmejeng_/video/7664121536290327816',
  account_slug: 'tt-majangmejeng_'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const results = [];

function record(provider, status, detail) {
  results.push({ provider, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} ${provider}: ${status} — ${detail}`);
}

async function testP4_IGReels() {
  const igAccount = ACCOUNTS_IG.find(a => a.slug === IG_TEST_POST.account_slug);
  if (!igAccount?.pk) return record('P4 IG /clips/user/', 'FAIL', 'no pk for ig-majangmejeng_');

  const body = new URLSearchParams({
    target_user_id: igAccount.pk,
    page_size: '12',
    include_feed_video: 'true'
  }).toString();

  try {
    const res = await fetch('https://i.instagram.com/api/v1/clips/user/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Instagram 219.0.0.12.117 Android',
        'x-ig-app-id': '936619743392459',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      signal: AbortSignal.timeout(30000)
    });
    const text = await res.text();
    if (text.includes('login_required') || text.includes('require_login')) {
      return record('P4 IG /clips/user/', 'FAIL', 'login_required from server');
    }
    if (!res.ok) return record('P4 IG /clips/user/', 'FAIL', `HTTP ${res.status}`);
    const json = JSON.parse(text);
    const items = json.items ?? [];
    if (items.length === 0) return record('P4 IG /clips/user/', 'FAIL', '0 items returned');
    const first = items[0].media ?? {};
    if (typeof first.like_count !== 'number') {
      return record('P4 IG /clips/user/', 'FAIL', 'no like_count field');
    }
    return record('P4 IG /clips/user/', 'PASS', `${items.length} reels, first like=${first.like_count}`);
  } catch (e) {
    return record('P4 IG /clips/user/', 'FAIL', e.message.slice(0, 80));
  }
}

async function testP2_TikWMViaJina() {
  // P2 v2: TikWM /api/ via Jina proxy — Jina wrapper unwraps + field remap
  // Outer: { code: 200, data: { content: <inner JSON string>, ... } }
  // Inner: { code: 0, data: { digg_count, play_count, comment_count, ... } }
  const jinaUrl = `https://r.jina.ai/https://www.tikwm.com/api/?url=${encodeURIComponent(TT_TEST_POST.url)}`;
  try {
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) return record('P2 TikWM via Jina', 'FAIL', `HTTP ${res.status}`);
    const outer = await res.json();
    if (outer.code !== 200 || !outer.data) {
      return record('P2 TikWM via Jina', 'FAIL', `Jina outer code=${outer.code}`);
    }
    let inner;
    try {
      inner = JSON.parse(outer.data.content);
    } catch (e) {
      return record('P2 TikWM via Jina', 'FAIL', `data.content not valid JSON: ${e.message.slice(0, 50)}`);
    }
    if (inner.code !== 0 || !inner.data) {
      return record('P2 TikWM via Jina', 'FAIL', `TikWM inner code=${inner.code} msg=${inner.msg ?? '?'}`);
    }
    const d = inner.data;
    // Field remap: digg_count → like_count, play_count → view_count
    const likeCount = d.digg_count;
    const viewCount = d.play_count;
    const commentCount = d.comment_count;
    if (typeof likeCount !== 'number') {
      return record('P2 TikWM via Jina', 'FAIL', 'no digg_count field in inner data');
    }
    return record('P2 TikWM via Jina', 'PASS', `like=${likeCount} cmt=${commentCount} view=${viewCount}`);
  } catch (e) {
    return record('P2 TikWM via Jina', 'FAIL', e.message.slice(0, 80));
  }
}

async function testP19_JinaTTProfile() {
  const ttAccount = ACCOUNTS_TT.find(a => a.slug === TT_TEST_POST.account_slug);
  if (!ttAccount?.username) return record('P19 Jina TT profile', 'FAIL', 'no username for tt-majangmejeng_');

  const url = `https://r.jina.ai/https://www.tiktok.com/@${ttAccount.username}`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) return record('P19 Jina TT profile', 'FAIL', `HTTP ${res.status}`);
    const json = await res.json();
    const data = json.data ?? {};
    if (!data.title && !data.description) {
      return record('P19 Jina TT profile', 'FAIL', 'no title/description in response');
    }
    return record('P19 Jina TT profile', 'PASS', `title="${(data.title || '').slice(0, 50)}"`);
  } catch (e) {
    return record('P19 Jina TT profile', 'FAIL', e.message.slice(0, 80));
  }
}

async function testYtDlp_PerPost() {
  try {
    const { execFile } = await import('node:child_process');
    const result = await new Promise((resolve, reject) => {
      execFile('yt-dlp', ['--dump-json', '--no-warnings', '--no-progress', TT_TEST_POST.url], {
        timeout: 30000
      }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    });
    const json = JSON.parse(result);
    if (typeof json.like_count !== 'number') {
      return record('yt-dlp CLI', 'FAIL', 'no like_count field');
    }
    return record('yt-dlp CLI', 'PASS', `like=${json.like_count} view=${json.view_count ?? 0}`);
  } catch (e) {
    return record('yt-dlp CLI', 'FAIL', e.message.slice(0, 80));
  }
}

async function main() {
  console.log('=== TITAN Layer 1 Provider Smoke Test ===\n');
  console.log('IG test post:', IG_TEST_POST.shortcode, '(ig-majangmejeng_)');
  console.log('TT test post:', TT_TEST_POST.videoId, '(tt-majangmejeng_)\n');

  console.log('Running tests...\n');
  await testP4_IGReels();
  await sleep(1000);
  await testP2_TikWMViaJina();
  await sleep(1000);
  await testP19_JinaTTProfile();
  await sleep(1000);
  await testYtDlp_PerPost();

  console.log('\n=== Summary ===');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${results.length} | PASS: ${pass} | FAIL: ${fail}`);

  if (fail > 0) {
    console.log('\n❌ Some providers failed. Run `node scripts/test-providers.mjs` again or check network.');
    process.exit(1);
  } else {
    console.log('\n✅ All providers working. Safe to run full scrape.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
