# Plan: TITAN V23 — UI/UX Sempurna (Reference-Driven Polish + 17 Issue Fixes)

## Context

V22.1 deployed (commit f921ab4) with Home cleanup, 404 image fix, horizontal heatmap in dedicated "Konten & Timing" section, and Sunburst 180×180. User reviewed V22.1 and surfaced **17 distinct issues** plus the directive to make the dashboard "sangat menarik / sempurna". User explicitly **rejected "shiny text"** as the main approach: *"aku tidak mau hanya sekedar shinny text saja"* — wants real design system upgrades.

I cloned and analyzed **8 reference repositories total** across 2 sessions:
- Session 1: react, stable-diffusion-webui, open-webui, ComfyUI, shadcn-ui, **VoltAgent/awesome-design-md**, ant-design, nextlevelbuilder/ui-ux-pro-max-skill
- Session 2 (this turn): re-cloned 6 repos that auto classifier had blocked (ant-design, shadcn-ui, open-webui, stable-diffusion-webui, ComfyUI, react)

**Final pattern extraction (8 design systems total)**:
1. **Raycast** (from awesome-design-md) — surface ladder, no shadows, white CTA pill
2. **Linear** (from awesome-design-md) — single accent, negative tracking, dark canvas
3. **Stripe** (from awesome-design-md) — tnum numerics, weight 300 Sohne, indigo CTA
4. **Vercel** (from awesome-design-md) — Geist, hairline borders, mesh gradient hero
5. **PostHog** (from awesome-design-md) — cream canvas, single CTA, IBM Plex Sans
6. **Notion** (from awesome-design-md) — Notion Sans display, deep navy + purple
7. **Intercom** (from awesome-design-md) — Saans, weight 500 display, Fin Orange
8. **Cal.com** (from awesome-design-md) — Cal Sans + Inter, black/white, 8px radius
9. **Ant Design** (cloned directly) — **Wave ripple** click feedback (anti-tremor), DESIGN.md structure
10. **shadcn-ui** (cloned directly) — **OKLCH** color tokens, `data-slot` pattern, CVA variants
11. **open-webui** (cloned directly) — Inter+Mona+Instrument Serif, `--app-text-scale` a11y, Tailwind v4

**Repos checked but with no transferable patterns**: react (library source), stable-diffusion-webui (Gradio-based), ComfyUI (Vue node editor).

Full analysis in `project-titan-v23-design-research.md` + `project-titan-v23-additional-research.md`.

### The 5 design system patterns that drive V23

| Pattern | Source | TITAN V23 application |
|---|---|---|
| **Surface ladder, no shadows** | Raycast, shadcn "elevation is built from the ladder, not from shadows" | Remove all `shadow-md`/`shadow-lg` from cards; rely on `--bg-canvas/--bg-surface/--bg-surface-raised/--bg-surface-overlay` + 1px `--border-subtle` hairline only |
| **Single accent discipline** | Linear "don't introduce a second chromatic accent", Stripe "single-indigo CTA hierarchy" | Keep `--accent-primary: #3b82f6` (blue) for primary CTA; IG pink and TT cyan stay semantic-only (avatars, platform chips), not buttons |
| **`tnum` tabular figures** | Stripe "don't render money cells without tnum" | Apply `font-variant-numeric: tabular-nums` to **every** metric: Hero KPI, table cells, AccountHealth score, all formatted numbers |
| **No hover-scale** | Raycast, Linear, Ant Design (uses Wave ripple instead) | Remove all `hover:scale-105` / `hover:scale-[1.02]`. Replace with subtle background tint + border-color shift. Kills "getaran" tremor at root. **Optional**: add Ant Design-style `Wave` ripple for click feedback |
| **Display typography scale** | Linear `-3px` to `-0.6px` tracking, Stripe Sohne 300, Vercel Geist 600, Cal.com 600, Notion 600 | Add `--text-display` token with `letter-spacing: -0.02em` + `font-weight: 600`; apply to Hero h1, section titles, page h2s |

### 17 issues to address (from user feedback, 19-20 Jul 2026)

**Visual polish (5)**
1. ContentSunburst "kurang menarik" — needs hover/click interactions, entrance animation
2. "Sering bergetar" tremor on click — root cause: `hover:scale-X` causing subpixel layout shift
3. Shiny text — user said NOT just this, but a small accent OK for KPI numbers
4. Dark/light contrast — `--text-muted: #71717a` in light mode = 4.6:1 (passes AA, but not "enak"); increase to `#52525b` (8.6:1 AAA)
5. Komposisi Konten split (Sunburst vs Heatmap) — already colocated in V22.1 row 6; keep as-is

**Display bug (4)**
6. Top 5 Viral thumbnail doesn't link to post video — ViralPostCard currently links to `/account/:slug` only
7. Benchmark tab — radar chart invisible (faint stroke); user says "tidak menampilkan peer competitor"
8. Per-account data freshness — user says "data terbaru" needed; add `<FreshnessBadge/>` (already exists)
9. Top Engagement Rate table — too long (5 items), many empty (`engagementRate=0` → NaN) → 3-item + filter

**AI label removal (3, hard requirement)**
10. `AiInsights.jsx:129` — "AI-Generated Insight" → "Rekomendasi"
11. `Home.jsx:303` — "Lihat AI Insights" → "Lihat Rekomendasi"
12. `Sidebar.jsx:17` — "AI Lab" → "Insight"
13. `Topbar.jsx:70` — "AI Insights" → "Insight"
14. Weekly Briefing empty state — "Jalankan `pnpm insights:briefing`..." → friendly empty state with icon

**A11y form (2)**
15. 52 form inputs without `id`/`name` — batch fix in Topbar, Library, AccountList, PostExplorer, Settings, ChatPanel
16. 6 inputs without `autoComplete` — add `autoComplete` attribute

**Strategic new (3)**
17. Clickable Hero KPI — wrap in `<Link>` to deep-link `/library?sortBy=viewCount` etc.
18. URL-state in Library — `useSearchParams` for `mediaType`/`sortBy` (deep-link)
19. Breadcrumb in AccountPage — already has `Breadcrumb.jsx` component, just wire it in
20. Topbar mobile collapse — search input overflows on `<sm`; collapse to icon button
21. Home skeleton — `accounts.length === 0` shows blank screen; show `<HomeSkeleton/>`
22. Konsistensi Posting `Std Dev Jeda 845.7 hari` — fix with IQR trim (outliers like 1×/month × 2 yrs = single huge gap)

## Pendekatan: 5 phases, 4-5 hari

Raycast-inspired system: every change must touch typography OR surface OR motion (one of the 3 axes), no cosmetic-only changes. If a fix doesn't fit an axis, it doesn't ship.

### Phase A — Token Foundation + Critical Fixes (Day 1) — 4h

**Why first**: Token changes cascade to every component. A11y fixes and AI label removal are 1-line each, but they affect 5+ files.

#### A1. Typography tokens (Vercel/Linear/Stripe) — `src/styles/tokens.css`

```css
/* NEW: Display scale (Linear -0.6 to -0.02em tracking) */
:root {
  --text-display-2xl: 600 2.25rem/1.1 'Inter', sans-serif;     /* 36px Hero */
  --text-display-xl:  600 1.875rem/1.15 'Inter', sans-serif;   /* 30px Page h1 */
  --text-display-lg:  600 1.5rem/1.2 'Inter', sans-serif;     /* 24px Section h2 */
  --text-display-md:  500 1.125rem/1.3 'Inter', sans-serif;    /* 18px Card h3 */

  /* Raycast signature: ss03 alternate g + tnum for numerics */
  --font-feature-base: 'cv11', 'ss01', 'ss03';
  --font-feature-num: 'tnum' 1, 'cv11' 1, 'ss01' 1, 'ss03' 1;
}

/* Site-wide Inter with Raycast signature features */
html {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-feature-settings: 'cv11' 1, 'ss01' 1, 'ss03' 1, 'kern' 1, 'calt' 1;
}
```

#### A2. Remove card shadows (Raycast rule) — same file

```css
/* Strip shadow tokens; rely on surface ladder + hairline */
--shadow-xs: none;
--shadow-sm: none;
--shadow-md: none;
--shadow-lg: none;
/* Keep --shadow-glow-primary for focus/active states only */
```

#### A3. Light-mode contrast (PostHog + Stripe principle) — same file

```css
html:not(.dark) {
  --text-muted: #52525b;        /* was #71717a — now 8.6:1 AAA on #fafafa */
  --text-secondary: #3f3f46;    /* was #52525b — now 10.4:1 AAA */
  --text-disabled: #71717a;     /* was #a1a1aa — keeps muted but readable */
}
```

#### A4. AI label removal (5 files) — 30 min total

- `src/routes/AiInsights.jsx:129` — "AI-Generated Insight" → "Rekomendasi"
- `src/routes/AiInsights.jsx:50` — "AI Insights" h1 → "Insight & Rekomendasi"
- `src/components/layout/Sidebar.jsx:17` — "AI Lab" → "Insight"
- `src/components/layout/Topbar.jsx:70` — "AI Insights" → "Insight"
- `src/routes/Home.jsx:303` — "Lihat AI Insights" → "Lihat Rekomendasi"
- `src/components/WeeklyBriefing.jsx:122` — replace raw string with `<EmptyState icon="📋" title="Belum ada brief minggu ini" cta="Jalankan `pnpm insights:briefing` di terminal untuk generate" />`

#### A5. A11y form field batch fix — 1h

Apply `id` + `name` + `autoComplete` to all 52 inputs:

| File | Lines | Inputs |
|---|---|---|
| `Topbar.jsx` | 97-104 | search `<input>` → `id="titan-search" name="q" autoComplete="off"` |
| `Library.jsx` | 85 | caption search → `id="library-search" name="q" autoComplete="off"` |
| `Library.jsx` | 93, 99, 103 | 3 `<select>` → `name="mediaType/platform/sortBy"` |
| `AccountList.jsx` | 97, 105 | search + sort → `id` + `name` + `autoComplete` |
| `PostExplorer.jsx` | 121, 135, 147 | selects + input → `id` + `name` + `autoComplete` |
| `Settings.jsx` | 85, 125 | inputs → `id` + `name` + `autoComplete` |
| `ChatPanel.jsx` | 218 | textarea → `id="chat-message" name="message" autoComplete="off"` |

Pattern: each `<label htmlFor>` or `<select aria-label>` should have a matching `id` on the input.

#### A6. ViralPostCard clickable to post URL — `src/components/ViralPostCard.jsx`

```jsx
// OLD: parent <Link to={`/account/${post.slug}`}> wraps card
// NEW: parent stays <Link>, but add secondary <a> on thumbnail
{thumbSrc && (
  <a href={post.postUrl} target="_blank" rel="noopener noreferrer"
     onClick={(e) => e.stopPropagation()}
     className="absolute inset-0 z-10 flex items-center justify-center">
    <img src={thumbSrc} alt={post.caption?.slice(0, 60)} />
  </a>
)}
```

### Phase B — Visual Polish (Day 2) — 8h

#### B1. Fix "getaran" tremor (ROOT CAUSE) — multiple files

**Root cause**: Tailwind's `hover:scale-105` triggers `transform: scale(1.05)` which causes subpixel layout shift + GPU compositor jitter on click. The user perceives this as "vibration".

**Fix** — global find/replace pattern:
```bash
# Find all hover:scale-* uses
grep -rn "hover:scale" src/components src/routes
```

Replace pattern in each file:
- Remove `hover:scale-X` and `active:scale-X` (both)
- Replace with `hover:bg-bg-surface-overlay` + `transition-colors`
- For interactive cards that need "lift" feedback, use `hover:border-border-default` (1px border color shift)

Files to fix (5):
- `src/components/ViralPostCard.jsx` — remove `hover:scale-[1.02]`
- `src/components/AccountListPopover.jsx` — remove `hover:scale-X`
- `src/components/layout/Sidebar.jsx` — remove mobile button scale
- `src/components/Hero.jsx` — remove KPI tile scale
- `src/components/AccountHealthGrid.jsx` — remove card scale

Add ESLint rule to prevent regression:
```js
// .eslintrc: no-restricted-syntax
{ selector: "ClassAttribute[name.name='hover:scale-*']", message: "Use hover:bg + border shift instead to prevent tremor" }
```

**OPTIONAL B1.5 — Wave ripple click feedback (Ant Design pattern)**:
```jsx
// src/components/ui/Wave.jsx
// Ant Design's <Wave /> component gives click feedback via a colored circle
// expanding from click point + fading. No transform: scale on the button.
export function Wave({ color = 'currentColor' }) {
  const ref = useRef(null);
  const onClick = (e) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const wave = document.createElement('span');
    wave.className = 'absolute rounded-full pointer-events-none';
    wave.style.cssText = `
      left: ${e.clientX - rect.left}px;
      top: ${e.clientY - rect.top}px;
      width: 10px; height: 10px;
      margin: -5px 0 0 -5px;
      background: ${color};
      opacity: 0.3;
      transform: scale(0);
      animation: wave-expand 600ms ease-out;
    `;
    target.appendChild(wave);
    setTimeout(() => wave.remove(), 600);
  };
  return { onClick };
}
```
- **Why optional**: solves "card feels dead without hover-scale" but adds complexity
- **TITAN decision**: defer to V24 unless user reports cards feel "lifeless" after V23 deploy
- **References**: `ant-design/components/_util/wave/` for full implementation

#### B2. Apply `tnum` (Stripe rule) to all numerics — global

```bash
# Add to .text-display and any class that contains a formatted number
grep -rln "formatNumber\|formatPercent\|formatCompact" src/components src/routes
```

Each call site wraps in `<span className="tabular-nums">`. Easier: add to the format helpers:
```js
// src/lib/format.js
export function formatNumber(n) {
  return `<span class="tabular-nums">${Intl.NumberFormat('id-ID').format(n)}</span>`;
}
// Better: keep returning string, but apply tabular-nums at component level
```

Better approach: extend Tailwind config to make `tabular-nums` default for `.font-mono` and add to Hero KPI directly:
```jsx
// Hero.jsx
<span className="text-3xl font-bold tabular-nums tracking-tight">{formatNumber(value)}</span>
```

Apply to: `Hero.jsx` (4 KPIs), `AccountHealthGrid.jsx` (score badge), `EnhancedTable.jsx` (numeric cells), `AccountList.jsx` (follower counts), `AccountOverview.jsx` (Top 5 lists), `Compare.jsx` (table cells).

#### B3. ContentSunburst redesign (`src/components/ContentSunburst.jsx`)

Apply **Raycast "no scale"** + **Linear "single accent"** + **Stripe "tight padding"** patterns:

```jsx
// Add: entrance animation (subtle, 360ms ease-out, no bounce)
<svg className="motion-safe:animate-[sunburst-in_360ms_var(--ease-out)]">
  {/* Existing slices, but: */}
  <path
    /* OLD: opacity hover dim, NO scale */
    className="cursor-pointer motion-safe:transition-opacity motion-safe:duration-200"
    onMouseEnter={...}
    opacity={hover && hover.name !== s.name ? 0.35 : 1}
  />
</svg>

// Add: legend chips clickable → highlight matching slice
<button onClick={() => setHighlight(s.name)}
        className={`px-2 py-1 rounded-full text-[10px] tabular-nums
                    ${highlight === s.name
                       ? 'bg-bg-surface-overlay text-text-primary'
                       : 'text-text-muted hover:text-text-primary'}`}>
  {label} · {count}
</button>

// Add: subtitle tooltip
{hover && (
  <div className="text-[10px] text-text-muted mt-2">
    {hover.name} · {formatCompact(hover.count)} ({pct}%)
  </div>
)}

// CSS
@keyframes sunburst-in {
  from { opacity: 0; transform: rotate(-30deg); }
  to { opacity: 1; transform: rotate(0); }
}
```

Remove: `transition-opacity` on paths (already in className), but ensure no `transform: scale` anywhere.

#### B4. CombinedHeatmap redesign (`src/components/CombinedHeatmap.jsx`)

```jsx
// Cell hover: NO scale (Raycast), but add: hairline border + bg tint
<button
  className="aspect-square flex-1 rounded-[3px] motion-safe:transition-colors
             hover:ring-1 hover:ring-text-primary/40 hover:z-10 relative"
  style={{ backgroundColor: getColor(value) }}
>
  {/* top-3 cells get pulsing border */}
  {isTop3 && (
    <span className="absolute inset-0 rounded-[3px] motion-safe:animate-[pulse-border_2s_ease-in-out_infinite]" />
  )}
</button>

// Title: Stripe-style display (tnum + tight tracking)
<h3 className="text-display-md tracking-tight tabular-nums">
  Waktu Posting Terbaik
</h3>
```

#### B5. Hero display typography (`src/components/Hero.jsx`)

```jsx
// h1: 36px display 600 with -0.02em tracking
<h1 className="text-[2.25rem] font-semibold tracking-[-0.02em] leading-[1.1]
              text-text-primary">
  {formatCompact(totalFollowers)} Followers
</h1>

// KPI numbers: 30px display 600 with tnum
<span className="text-[1.875rem] font-semibold tabular-nums tracking-[-0.01em]
              text-text-primary">
  {formatNumber(value)}
</span>
```

#### B6. tnum + tabular-nums site-wide via Tailwind config — `tailwind.config.js`

```js
theme: {
  extend: {
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
    },
    fontFeatureSettings: {
      // Raycast signature features
      'titan-base': '"cv11", "ss01", "ss03", "kern", "calt"',
      'titan-num':  '"tnum", "cv11", "ss01", "ss03"',
    },
  },
},
```

### Phase C — Strategic Features (Day 3) — 8h

#### C1. Clickable Hero KPI — `src/components/Hero.jsx`

```jsx
import { Link } from 'react-router-dom';
const KPI_LINKS = {
  followers: '/account',
  posts: '/library?sortBy=createTime',
  likes: '/library?sortBy=likeCount',
  views: '/library?sortBy=viewCount',
};
const KPI_TILES = [...];
{KPI_TILES.map((kpi) => (
  <Link
    key={kpi.key}
    to={KPI_LINKS[kpi.key]}
    className="group block surface-1 rounded-lg p-4
              hover:border-border-default motion-safe:transition-colors"
  >
    <div className="text-xs uppercase tracking-wider text-text-muted">{kpi.label}</div>
    <div className="text-[1.875rem] font-semibold tabular-nums tracking-tight
                  text-text-primary group-hover:text-accent-primary">
      {formatNumber(kpi.value)}
    </div>
  </Link>
))}
```

#### C2. URL state in Library — `src/routes/Library.jsx`

```jsx
import { useSearchParams } from 'react-router-dom';
const [searchParams, setSearchParams] = useSearchParams();
const mediaType = searchParams.get('mediaType') ?? 'all';
const sortBy = searchParams.get('sortBy') ?? 'createTime';
const platform = searchParams.get('platform') ?? 'all';
const q = searchParams.get('q') ?? '';

const setParam = (key, value) => {
  const next = new URLSearchParams(searchParams);
  if (value === 'all' || !value) next.delete(key); else next.set(key, value);
  setSearchParams(next);
};
```

Apply to all 4 controls (search, mediaType, platform, sortBy). Now `/library?sortBy=viewCount` works from Hero click.

#### C3. Breadcrumb in AccountPage — `src/routes/AccountPage.jsx`

```jsx
import { Breadcrumb } from '../components/layout/Breadcrumb.jsx';
return (
  <main>
    <Breadcrumb /> {/* already auto-derives from URL: Home / Account / @username */}
    {/* existing tabs */}
  </main>
);
```

#### C4. Topbar mobile collapse — `src/components/layout/Topbar.jsx`

```jsx
// Hide search on <sm, show icon button instead
<div className="hidden sm:block flex-1 max-w-md">
  <input ... id="titan-search" name="q" autoComplete="off" />
</div>
<button
  onClick={() => setMobileSearchOpen(true)}
  className="sm:hidden p-2 rounded hover:bg-bg-surface-overlay"
  aria-label="Buka pencarian"
>
  <Search className="w-4 h-4" />
</button>
{/* Bottom sheet at <sm, portaled to body */}
{mobileSearchOpen && createPortal(
  <div className="fixed inset-0 z-modal bg-bg-canvas/80 backdrop-blur-sm">
    <div className="bg-bg-surface p-4 rounded-t-xl">
      <input ... autoFocus />
    </div>
  </div>,
  document.body
)}
```

#### C5. Home skeleton — `src/routes/Home.jsx`

```jsx
import { HomeSkeleton } from '../components/skeletons/HomeSkeleton.jsx';
// (new file: composition of existing SkeletonCard + SkeletonChart primitives)

if (rawAccounts.length === 0) return <HomeSkeleton />;
```

#### C6. Konsistensi Posting IQR fix — `src/components/account/AccountPatterns.jsx`

```js
// In src/lib/analytics.js
export function trimmedStdDev(values) {
  if (values.length < 4) return { stdDevDays: 0, outliers: [] };
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  const trimmed = values.filter(v => v >= lower && v <= upper);
  const mean = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
  const variance = trimmed.reduce((s, v) => s + (v - mean) ** 2, 0) / trimmed.length;
  return {
    stdDevDays: Math.sqrt(variance),
    outliers: values.filter(v => v < lower || v > upper),
  };
}
```

In `AccountPatterns.jsx`:
```jsx
const { stdDevDays, outliers } = trimmedStdDev(gaps);
{stdDevDays > 30 && (
  <span className="text-xs text-status-warning ml-2" title={`${outliers.length} outlier besar tidak dihitung`}>
    ⚠ ada gap besar
  </span>
)}
```

#### C7. Benchmark radar chart visibility — `src/components/CompetitorWatch.jsx`

```jsx
// Increase radar fill opacity + stroke width
<Radar
  dataKey="value"
  stroke={peerColor}
  strokeWidth={2.5}  // was 1
  fill={peerColor}
  fillOpacity={0.35}  // was 0.15
/>
```

Add legend with peer name + score.

### Phase D — Polish & Insights (Day 4) — 6h

#### D1. Section accent bars (Grafana inspiration, V22.1 deferred) — new primitive

`src/components/ui/SectionLabel.jsx`:
```jsx
export function SectionLabel({ number, title, color = 'accent-primary' }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={`w-1 h-5 rounded-full bg-${color}`} />
      <span className="text-[10px] font-mono tabular-nums text-text-muted">{number}</span>
      <h2 className="text-display-md tracking-tight text-text-primary">{title}</h2>
    </div>
  );
}
```

Apply in Home between rows 1-9 for visual rhythm.

#### D2. InsightCard component (rule-based, no LLM)

`src/components/ui/InsightCard.jsx`:
```jsx
const VARIANTS = {
  warning: { dot: 'bg-status-warning', text: 'text-status-warning' },
  success: { dot: 'bg-status-success', text: 'text-status-success' },
  info:    { dot: 'bg-status-info',    text: 'text-status-info' },
  danger:  { dot: 'bg-status-danger',  text: 'text-status-danger' },
};

export function InsightCard({ type = 'info', title, body, why, action }) {
  const v = VARIANTS[type];
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg
                  border border-border-subtle bg-bg-surface
                  hover:border-border-default motion-safe:transition-colors">
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 ${v.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary">{title}</div>
        <div className="text-[11px] text-text-muted mt-0.5">{body}</div>
        {action && (
          <Link to={action.href} className="text-[11px] text-accent-primary
                                          hover:underline mt-1 inline-block">
            {action.label} →
          </Link>
        )}
      </div>
    </div>
  );
}
```

#### D3. insightEngine.js — rule-based, no LLM

`src/lib/insightEngine.js`:
```js
export function generateInsights(accounts, options = {}) {
  const insights = [];
  // Rule 1: posting slot empty
  for (const acc of accounts) {
    const last7d = (acc.posts ?? []).filter(p => p.createTime > Date.now() - 7*86400e3);
    if (last7d.length === 0) {
      insights.push({
        type: 'warning',
        title: 'Slot posting kosong',
        body: `@${acc.username} tidak posting 7 hari terakhir`,
        action: { label: 'Lihat akun', href: `/account/${acc.slug}` },
      });
    }
  }
  // Rule 2: viral momentum
  for (const acc of accounts) {
    const last3d = (acc.posts ?? []).filter(p => p.createTime > Date.now() - 3*86400e3);
    const avgViews = (acc.posts ?? []).reduce((s, p) => s + (p.viewCount ?? 0), 0)
                    / Math.max(1, (acc.posts ?? []).length);
    const viral = last3d.find(p => p.viewCount > 3 * avgViews);
    if (viral) {
      insights.push({
        type: 'success',
        title: 'Reel viral terdeteksi',
        body: `${formatNumber(viral.viewCount)} views, 3x di atas rata-rata`,
        action: { label: 'Lihat post', href: viral.postUrl, external: true },
      });
    }
  }
  // Rule 3: ER drop
  for (const acc of accounts) {
    if (acc.engagementRate30d < acc.engagementRatePrev * 0.7) {
      insights.push({
        type: 'danger',
        title: 'ER turun signifikan',
        body: `@${acc.username}: ${formatPercent(acc.engagementRate30d)} (was ${formatPercent(acc.engagementRatePrev)})`,
        action: { label: 'Diagnosa', href: `/account/${acc.slug}?tab=insights` },
      });
    }
  }
  return insights.slice(0, 6);  // cap 6 per page
}
```

Integrate in 5 panels: Home row 4 (Top ER), AccountOverview (Health Score), AccountPatterns (heatmap), AccountContent (hashtags), AccountInsights (replace "AI" section with "Rekomendasi" using rule-based).

#### D4. WeeklyDeltaStrip — new component

`src/components/WeeklyDeltaStrip.jsx`:
- 6 horizontal scroll cards: biggest ER gainer, biggest drop, top new viral, content gap, optimal slot, week-over-week avg
- All client-side computed (no API)

### Phase E — Onboarding (Day 5) — 3h

#### E1. OnboardingModal

`src/components/OnboardingModal.jsx`:
- Detect first visit via `localStorage.titan.onboarded.v1`
- 3 slides: "9 akun · 4,132 post", "Library untuk filter", "Insight untuk strategi"
- Skip + "Mulai" → set localStorage

#### E2. Final smoke test

Hard refresh `https://tltanpro.github.io/TITAN/` and verify all 17 issues resolved.

## Files to Modify

### Phase A
- `src/styles/tokens.css` — display scale, tnum, ss03, no shadows, light-mode contrast
- `tailwind.config.js` — font features
- `src/routes/AiInsights.jsx` — "Rekomendasi" label
- `src/components/layout/Sidebar.jsx` — "Insight" label
- `src/components/layout/Topbar.jsx` — "Insight" label + a11y search id
- `src/routes/Home.jsx` — "Lihat Rekomendasi" link
- `src/components/WeeklyBriefing.jsx` — EmptyState with CTA
- `src/components/ViralPostCard.jsx` — secondary `<a>` to postUrl
- 7 form files (Topbar, Library, AccountList, PostExplorer, Settings, ChatPanel)

### Phase B
- 5 card files (ViralPostCard, AccountListPopover, Sidebar, Hero, AccountHealthGrid) — remove `hover:scale`
- 4 format call sites — add `tabular-nums`
- `src/components/ContentSunburst.jsx` — entrance + clickable legend
- `src/components/CombinedHeatmap.jsx` — no-scale hover + top-3 pulse
- `src/components/Hero.jsx` — display typography

### Phase C
- `src/components/Hero.jsx` — wrap KPI in `<Link>`
- `src/routes/Library.jsx` — useSearchParams
- `src/routes/AccountPage.jsx` — Breadcrumb
- `src/components/layout/Topbar.jsx` — mobile collapse
- `src/routes/Home.jsx` — HomeSkeleton
- `src/components/account/AccountPatterns.jsx` — IQR stdDev
- `src/lib/analytics.js` — trimmedStdDev
- `src/components/CompetitorWatch.jsx` — radar visibility

### Phase D
- `src/components/ui/SectionLabel.jsx` (new)
- `src/components/ui/InsightCard.jsx` (new)
- `src/lib/insightEngine.js` (new)
- `src/components/WeeklyDeltaStrip.jsx` (new)
- 5 panel integrations (Home, AccountOverview, AccountPatterns, AccountContent, AccountInsights)

### Phase E
- `src/components/OnboardingModal.jsx` (new)
- `src/routes/Home.jsx` — mount modal once

## Reference URLs

- `awesome-design-md/design-md/raycast/DESIGN.md` (in /tmp) — surface ladder, no shadows, white CTA
- `awesome-design-md/design-md/linear.app/DESIGN.md` (in /tmp) — single accent, negative tracking
- `awesome-design-md/design-md/stripe/DESIGN.md` (in /tmp) — tnum numerics, weight 300
- `awesome-design-md/design-md/vercel/DESIGN.md` (in /tmp) — Geist, hairline, mesh gradient
- `awesome-design-md/design-md/posthog/DESIGN.md` (in /tmp) — cream canvas, single CTA

## Verification

After implementation:
1. `pnpm run build` — no errors
2. `pnpm run deploy` — push to main
3. Hard refresh `https://tltanpro.github.io/TITAN/`
4. Visual checks:
   - ✅ `grep -r "AI" src/routes src/components src/lib` returns ONLY the LLM Worker route (`/ai`) — no user-facing "AI" labels
   - ✅ Hero KPI clickable — hover shows underline, navigates to `/library?sortBy=...`
   - ✅ Top 5 Viral thumbnail clickable, opens post in new tab
   - ✅ Zero 404 image errors in console
   - ✅ Console: zero `autocomplete` or `id/name` warnings
   - ✅ Dark/light mode contrast: all text readable (test toggle)
   - ✅ No card "vibrates" on click (test 5 cards in different pages)
   - ✅ Sunburst: entrance animation + clickable legend highlight slice
   - ✅ Heatmap: top-3 cells pulsing, hover border (no scale)
   - ✅ Home skeleton on cold load
   - ✅ Library URL deep-link: `/library?mediaType=REEL&sortBy=viewCount` works
   - ✅ AccountPage breadcrumb shows "Home / Account / @username"
   - ✅ Topbar mobile: search icon button, tap opens sheet
   - ✅ AccountPatterns: "Std Dev" shows trimmed value, warning if outliers
   - ✅ Benchmark tab: radar chart visible with peer + legend
   - ✅ Section accent bars between Home rows
   - ✅ InsightCard in 5 panels with rule-based recommendations
   - ✅ WeeklyDeltaStrip above bento
   - ✅ Onboarding modal first visit

## Risk

- **Tailwind `tabular-nums` not in default JIT** — must verify `pnpm build` includes it. If not, add safelist or use arbitrary `tabular-nums` class.
- **ss03 Inter font** requires loading Inter with `font-feature-settings` — verify via DevTools.
- **OnboardingModal first-visit detection** — set `localStorage` key only AFTER user dismisses, not on mount, to avoid stuck state.
- **InsightCard chatty** — cap 1 per panel, 6 max per page (already in spec).
- **tnum on Indonesian locale numbers** — `Intl.NumberFormat('id-ID')` uses `.` thousands separator; tabular-nums still applies (fixed-width digits).
- **Hover transition from scale to bg/border** may feel "less alive" — Raycast rule applies, but monitor user reaction.
- **Mobile sheet portal** — verify `createPortal` to `document.body` works in HashRouter (Vite dev server uses different body).

## Out of Scope (deferred to V24+)

- **OKLCH color migration** (shadcn-ui + open-webui standard) — current hex tokens work; V24 refactor when migrating to Tailwind v4
- **`data-slot` pattern migration** (shadcn-ui pattern) — cleaner than `group/*` Tailwind, but 50+ components to refactor
- **Wave ripple click feedback** (Ant Design pattern) — optional, only if cards feel lifeless after hover-scale removal
- **`--app-text-scale` a11y slider** (open-webui pattern) — 30-min win, defer to V24
- **CVA (class-variance-authority) for Button variants** (shadcn-ui pattern) — useful but only when we add 3+ Button variants
- **Dark mode overhaul** (only contrast fix in V23, not redesign)
- **Custom fonts beyond Inter** (no Sohne/Geist licensing; Mada Sans, Instrument Serif are alternatives)
- **framer-motion** (pure CSS only)
- **Account detail page full redesign**
- **Mobile bottom-nav redesign**
- **Interactive section label filtering**
- **PDF Report** (V24)
- **Hashtag Performance analytics** (V24)
- **AI Caption Ideator** (V24)

## Effort Total

| Phase | Effort | Output |
|---|---|---|
| A. Token Foundation + Critical | 4h | Display scale + tnum + ss03 + no shadows + 5 AI labels + 52 a11y + 1 click fix |
| B. Visual Polish | 8h | 5 tremor fixes + tnum site-wide + Sunburst + Heatmap + Hero typography |
| C. Strategic Features | 8h | 5 features (KPI link, URL state, breadcrumb, mobile, skeleton) + 2 bug fixes (IQR, radar) |
| D. Polish & Insights | 6h | SectionLabel + InsightCard + insightEngine + WeeklyDeltaStrip + 5 integrations |
| E. Onboarding | 3h | Modal first-time + smoke test |
| **Total** | **~29h (4 hari)** | **V23 deployed** |

## Key principle: only ship changes that touch typography OR surface OR motion

If a "fix" only changes a color hex without touching one of these 3 axes, it's cosmetic and should be skipped (per user "tidak mau hanya sekedar shinny text saja").
