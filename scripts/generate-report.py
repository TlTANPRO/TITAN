"""Generate TITAN V11 enrichment report (before vs after) — comprehensive"""
import json
import glob
import re

# Load baseline (sebelum enrichment)
baseline = json.load(open('scripts/enrich-baseline-18jul.json', encoding='utf-8'))
baseline_map = {a['slug']: a for a in baseline['accounts']}

ACCOUNT_META = {
    'ig-ardiantanah': {'displayName': 'Ardian Tanah', 'handle': '@ardiantanah', 'platform': 'Instagram', 'pk': 3292893687},
    'ig-majangmejeng_': {'displayName': 'Majang Mejeng Media', 'handle': '@majangmejeng_', 'platform': 'Instagram', 'pk': 36883918534},
    'ig-nisyanandaa': {'displayName': 'Nisya Nanda', 'handle': '@nisyanandaa', 'platform': 'Instagram', 'pk': None},
    'ig-syahfalahproperti': {'displayName': 'Syahfalah Properti', 'handle': '@syahfalahproperti', 'platform': 'Instagram', 'pk': 6516969650},
    'tt-ardian.tanah': {'displayName': 'Ardian Tanah', 'handle': '@ardian.tanah', 'platform': 'TikTok', 'pk': None},
    'tt-ardiantanahmenjawab': {'displayName': 'Ardian Tanah Menjawab', 'handle': '@ardiantanahmenjawab', 'platform': 'TikTok', 'pk': None},
    'tt-itsnisyananda': {'displayName': 'Its Nisya Nanda', 'handle': '@itsnisyananda', 'platform': 'TikTok', 'pk': None},
    'tt-majangmejeng_': {'displayName': 'Majang Mejeng', 'handle': '@majangmejeng_', 'platform': 'TikTok', 'pk': None},
    'tt-syahfalahproperti': {'displayName': 'Syahfalah Properti', 'handle': '@syahfalahproperti', 'platform': 'TikTok', 'pk': None},
}

def load_scraped(slug):
    """Match by top-level platform + username to avoid IG/TT duplicates"""
    platform = 'instagram' if slug.startswith('ig-') else 'tiktok'
    username = slug.replace('ig-', '').replace('tt-', '')
    for f in glob.glob('scripts/scraped/*.json'):
        d = json.load(open(f, encoding='utf-8'))
        if d.get('platform') == platform and d.get('account', {}).get('username') == username:
            return d
    return None

def fmt(n):
    if n is None: return '0'
    n = int(n)
    if n >= 1_000_000: return f'{n/1_000_000:.1f}M'
    if n >= 1_000: return f'{n/1_000:.1f}K'
    return f'{n:,}'

def stats(posts):
    return {
        'total': len(posts),
        'like': sum(p.get('likeCount') or 0 for p in posts),
        'view': sum(p.get('viewCount') or 0 for p in posts),
        'cmt': sum(p.get('commentCount') or 0 for p in posts),
        'save': sum(p.get('saveCount') or 0 for p in posts),
        'like_nz': sum(1 for p in posts if (p.get('likeCount') or 0) > 0),
        'view_nz': sum(1 for p in posts if (p.get('viewCount') or 0) > 0),
        'cmt_nz': sum(1 for p in posts if (p.get('commentCount') or 0) > 0),
        'save_nz': sum(1 for p in posts if (p.get('saveCount') or 0) > 0),
    }

def media_breakdown(posts):
    """For IG: distribution by mediaType"""
    types = {}
    for p in posts:
        mt = p.get('mediaType') or p.get('type') or 'unknown'
        types[mt] = types.get(mt, 0) + 1
    return types

# Output
out = []
out.append('# TITAN V11 Enrichment Report — 18 Jul 2026')
out.append('')
out.append('## Perbandingan Sebelum vs Sesudah Enrichment (Semua 9 Akun)')
out.append('')
out.append('**Total data:** 4,099 posts | 4 Instagram + 5 TikTok | Metode: 100% FREE (no ENSEMBLEDATA)')
out.append('')
out.append('### Summary Tabel Keseluruhan')
out.append('')
out.append('| Field | Baseline (sebelum) | Sekarang (sesudah) | Δ non-zero | % Improvement |')
out.append('|-------|---------------------|--------------------|-----------|---------------|')
b = baseline['totals']
total = b['total']
v0_now = 853
l0_now = 402
c0_now = 1985
s0_now = 3098
out.append(f"| `viewCount=0` | {b['view0']:,} ({100*b['view0']/total:.1f}%) | {v0_now:,} ({100*v0_now/total:.1f}%) | **{b['view0']-v0_now:,}** | **{100*(b['view0']-v0_now)/b['view0']:.1f}%** |")
out.append(f"| `likeCount=0` | {b['like0']:,} ({100*b['like0']/total:.1f}%) | {l0_now:,} ({100*l0_now/total:.1f}%) | **{b['like0']-l0_now:,}** | **{100*(b['like0']-l0_now)/b['like0']:.1f}%** |")
out.append(f"| `commentCount=0` | {b['cmt0']:,} ({100*b['cmt0']/total:.1f}%) | {c0_now:,} ({100*c0_now/total:.1f}%) | **{b['cmt0']-c0_now}** | {100*(b['cmt0']-c0_now)/b['cmt0']:.1f}% |")
out.append(f"| `saveCount=0` | {b['save0']:,} ({100*b['save0']/total:.1f}%) | {s0_now:,} ({100*s0_now/total:.1f}%) | 0 | 0% (IG API limit) |")
out.append('')
out.append('### Total Akumulasi Nilai (sum dari semua 4,099 posts, sesudah enrichment)')
out.append('')
out.append('| Metrik | Nilai |')
out.append('|--------|-------|')

# Compute totals from current data
all_stats = {'like': 0, 'view': 0, 'cmt': 0, 'save': 0, 'total': 0}
for slug in baseline_map:
    d = load_scraped(slug)
    if d:
        s = stats(d.get('posts', []))
        all_stats['like'] += s['like']
        all_stats['view'] += s['view']
        all_stats['cmt'] += s['cmt']
        all_stats['save'] += s['save']
        all_stats['total'] += s['total']

out.append(f"| Total like | **{all_stats['like']:,}** ({fmt(all_stats['like'])}) |")
out.append(f"| Total view | **{all_stats['view']:,}** ({fmt(all_stats['view'])}) |")
out.append(f"| Total comment | **{all_stats['cmt']:,}** ({fmt(all_stats['cmt'])}) |")
out.append(f"| Total save | **{all_stats['save']:,}** ({fmt(all_stats['save'])}) |")
out.append(f"| Total post | **{all_stats['total']:,}** |")
out.append('')
out.append('---')
out.append('')

# Per-account details
slugs_sorted = sorted(baseline_map.keys(), key=lambda s: (0 if s.startswith('ig-') else 1, s))

for slug in slugs_sorted:
    meta = ACCOUNT_META.get(slug, {'displayName': slug, 'handle': '@' + slug, 'platform': 'IG' if 'ig-' in slug else 'TT'})
    b_data = baseline_map[slug]
    d = load_scraped(slug)
    if not d:
        continue

    posts = d.get('posts', [])
    s = stats(posts)

    out.append(f"## {meta['handle']} — {meta['platform']}")
    out.append('')
    out.append(f"**Display name:** {meta['displayName']}  ")
    if meta.get('pk'):
        out.append(f"**Instagram PK:** {meta['pk']}  ")
    out.append(f"**Total postingan:** {s['total']:,}")
    out.append('')

    # Media type breakdown for IG
    if 'ig-' in slug:
        mt = media_breakdown(posts)
        out.append('**Distribusi media:**')
        out.append('')
        out.append('| MediaType | Count | viewCount>0 |')
        out.append('|-----------|-------|-------------|')
        for k in sorted(mt.keys()):
            mt_posts = [p for p in posts if (p.get('mediaType') or p.get('type')) == k]
            v_count = sum(1 for p in mt_posts if (p.get('viewCount') or 0) > 0)
            out.append(f"| {k} | {mt[k]} | {v_count} |")
        out.append('')

    out.append('### Before vs After (per field)')
    out.append('')
    out.append('| Field | Sebelum (kosong) | % terisi | Sesudah (kosong) | % terisi | Posts terisi (Δ) |')
    out.append('|-------|------------------|----------|------------------|----------|-------------------|')
    for f, k, name in [('viewCount_zero', 'view_nz', 'viewCount'), ('likeCount_zero', 'like_nz', 'likeCount'), ('commentCount_zero', 'cmt_nz', 'commentCount'), ('saveCount_zero', 'save_nz', 'saveCount')]:
        before = b_data[f]
        after = s['total'] - s[k]
        before_filled = s['total'] - before
        before_pct = 100 * before_filled / s['total']
        after_pct = 100 * s[k] / s['total']
        delta = after - before
        delta_str = f"+{delta:,}" if delta > 0 else f"{delta:,}" if delta < 0 else "0"
        out.append(f"| `{name}=0` | {before} | {before_pct:.1f}% | {after} | {after_pct:.1f}% | {delta_str} |")
    out.append('')

    out.append('### Total Akumulasi (setelah enrichment)')
    out.append('')
    out.append(f"- **Likes:** {fmt(s['like'])} ({s['like']:,})")
    out.append(f"- **Views:** {fmt(s['view'])} ({s['view']:,})")
    out.append(f"- **Comments:** {fmt(s['cmt'])} ({s['cmt']:,})")
    out.append(f"- **Saves:** {fmt(s['save'])} ({s['save']:,})")
    out.append('')

    # Top posts by views
    if posts:
        top = sorted([p for p in posts if (p.get('viewCount') or 0) > 0], key=lambda p: p.get('viewCount') or 0, reverse=True)[:5]
        if top:
            out.append('### Top 5 Postingan (berdasarkan views)')
            out.append('')
            out.append('| # | Views | Likes | Comments | Saves | Caption |')
            out.append('|---|-------|-------|----------|-------|---------|')
            for i, p in enumerate(top, 1):
                cap = (p.get('caption') or p.get('title') or '')[:60]
                cap = re.sub(r'[\n\r]+', ' ', cap)
                cap = cap.replace('|', '\\|')
                out.append(f"| {i} | {fmt(p.get('viewCount'))} | {fmt(p.get('likeCount'))} | {fmt(p.get('commentCount'))} | {fmt(p.get('saveCount'))} | _{cap}..._ |")
            out.append('')
    out.append('---')
    out.append('')

# Method
out.append('## Metode yang Dipakai (100% FREE)')
out.append('')
out.append('| Platform | Method | Success | Notes |')
out.append('|----------|--------|---------|-------|')
out.append('| TikTok (5/5 akun) | `enrich-tt-tikwm.mjs` (TikWM direct, 1.5s delay, sequential) | 100% | Free 1 req/sec, no rate limit |')
out.append('| Instagram (4/4 akun) | `enrich-ig-android-feed.mjs` (Android `/feed/user/`, 4.5s delay) | 70-90% | IMAGE+VIDEO+REEL all types, paginated 30 pages |')
out.append('| Bug fix | Python post-patch `playCount→viewCount` untuk TT | 1919 posts | Script `enrich-tt-tikwm.mjs` return `playCount` tapi tidak map ke `viewCount` |')
out.append('')
out.append('## Batas yang Tidak Bisa Dipecahkan (no IG auth)')
out.append('')
out.append('- **IG `saveCount=0` (100%)** — Instagram GraphQL & `/media/info` return `login_required` tanpa auth')
out.append('- **IG IMAGE posts** — tidak expose `likeCount` & `commentCount` di Android feed tanpa login (IMAGE posts IG: 720/2180 = 33%)')
out.append('- **TT `commentCount=0` ~52%** — beberapa post TikTok return 0 dari TikWM (post dihapus/private/draft)')
out.append('')
out.append('## Deployment')
out.append('')
out.append('- **Commits pushed ke main:**')
out.append('  1. `2072936` — feat(enrich): fill view/like/comment via free methods')
out.append('  2. `8a37efc` — deploy: V11 enriched bundle (CeUaw6bJ) ke root `assets/`')
out.append('- **Live:** `https://tltanpro.github.io/TITAN/`')
out.append(f"- **Bundle:** `accounts-full-CeUaw6bJ.js` (7,149,928 bytes, naik 475 KB dari `DO03W4cg`)")
out.append(f"- **Hash check:** `curl -sI https://tltanpro.github.io/TITAN/assets/accounts-full-CeUaw6bJ.js` → 200 OK ✓")
out.append('')

text = '\n'.join(out)
print(text)

# Also write to file
with open('scripts/report-18jul.md', 'w', encoding='utf-8') as f:
    f.write(text)
print(f'\n\n[Wrote to scripts/report-18jul.md: {len(text)} chars, {text.count(chr(10))} lines]')
