# TITAN Design Contract (V21)

> Brand & UI design rules for the TITAN dashboard. Single source of truth for
> design decisions. If it isn't here, it's a judgment call — but if it's here,
> follow it.

## Voice & Language

- **Bahasa Indonesia** for all UI labels, descriptions, status messages, toasts
- **English** for code, technical jargon, brand names
- **Formal tapi tidak kaku** — no slang, no emoji overuse, no exclamation marks
- **Active voice** — "Bandingkan 4 akun" not "Akun dapat dibandingkan"
- **Numbers always formatted** — `formatNumber()`, `formatCompact()`, `formatPercent()` from `src/lib/format.js`

## Visual Direction

**Editorial / dark luxury analytics** — not template Tailwind. Inspired by:

- **Grafana** — panel grid, time-range, drill-down
- **Metabase** — filter widgets, dashboard composition
- **AdminLTE** — info-box / small-box KPI pattern
- **Strapi** — list/edit, status badges, sidebar nav
- **vue-element-admin** — collapsible sidebar, breadcrumb, multi-tag tabs
- **nexu-io/open-design** — design tokens as brand contract

## Color Palette

Semantic tokens in `src/styles/tokens.css`. NEVER use raw hex in components.

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--bg-canvas` | #0a0a0a | #fafafa | App background |
| `--bg-surface` | #141414 | #ffffff | Card surface |
| `--bg-surface-raised` | #1f1f1f | #f4f4f5 | Elevated card |
| `--text-primary` | #fafafa | #18181b | Headlines, body |
| `--text-secondary` | #a1a1aa | #52525b | Labels, captions |
| `--text-muted` | #71717a | #71717a | Tertiary text |
| `--accent-primary` | #3b82f6 | #3b82f6 | Brand blue |
| `--status-success` | #10b981 | #10b981 | Green / good |
| `--status-warning` | #f59e0b | #f59e0b | Amber / caution |
| `--status-danger` | #ef4444 | #ef4444 | Rose / error |
| `--status-info` | #0ea5e9 | #0ea5e9 | Sky / info |

**Color is semantic, never decorative.** Green = success, Rose = error, Amber = warning, Sky = info. Brand blue only for primary actions.

## Typography

- **Inter** (system UI) for all text — already loaded via Tailwind defaults
- **JetBrains Mono** for numbers, code, IDs
- **Type scale**: 10/12/14/16/18/20/24/30/36/48 (xs to 5xl)
- **Weights**: 400 (body), 500 (label), 600 (semibold), 700 (heading)
- **Tabular nums** (`tabular-nums` Tailwind class) on every number, stat, table cell
- **Headlines**: h1 30px bold, h2 24px bold, h3 18px semibold, h4 14px semibold uppercase tracking

## Spacing & Rhythm

8px grid. Allowed values: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. No arbitrary values.

| Token | px | Use |
|-------|----|----|
| `--space-1` | 4 | Inline gap, icon-text distance |
| `--space-2` | 8 | Tight padding (chips, badges) |
| `--space-3` | 12 | Standard small padding |
| `--space-4` | 16 | Default card padding |
| `--space-6` | 24 | Section padding |
| `--space-8` | 32 | Major section gap |
| `--space-12` | 48 | Page-level gap |
| `--space-16` | 64 | Hero gap |

## Radius

6 / 8 / 12 / 16 / 20. Default 12 for cards, 8 for buttons/inputs, 6 for chips.

## Shadow

Use sparingly. Default: 1px hairline border (`--border-subtle`). Elevation: `--shadow-md` for dropdowns, `--shadow-lg` for modals. NEVER use shadow for decorative purposes.

## Motion

- **120ms fast** — hover, color transitions
- **200ms base** — fades, slides
- **360ms slow** — page transitions, large reveals
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo)
- **Max 1 transform property per element**
- **Honor `prefers-reduced-motion`** — all animations must disable when user has this set

## Iconography

- **lucide-react** (already a dep). Always. No other icon library.
- 16px (in chips, inline) / 20px (in buttons) / 24px (standalone) / 32px (in cards)
- Stroke width 1.5 (default), 2 (active state)
- Never rotate icons for state. Use a different icon.

## Density

**Comfortable, not compact.** 8px grid is the rule. Touch targets ≥ 36px. Reading column ≤ 80ch. Whitespace is content.

## Layout Patterns

- **Bento grid** for Home — large panels (8 col) + small stat tiles (4 col), mixed
- **Sidebar + Topbar** for app shell — persistent on desktop, drawer on mobile
- **List/detail** for account pages — list on /account, tabs on /account/:slug
- **Compare table** for /compare — column-per-account, row-per-metric
- **Heatmap grid** for /calendar — 7×6 day cells
- **Table** for /library — sortable, filterable, paginated

## State Colors

- **Loading**: skeleton-shimmer (existing CSS)
- **Empty**: `<EmptyState>` from `ui/EmptyState.jsx` — icon, title, description
- **Error**: `<ErrorState>` — same shape, with retry button
- **Success**: brief toast (or just inline confirmation)

## Accessibility

- **WCAG AA contrast** minimum — 4.5:1 for body text, 3:1 for large text
- **Keyboard nav** — every interactive element focusable, visible focus ring (`focus-ring` class)
- **ARIA labels** for icon-only buttons (`aria-label="Settings"`)
- **Skip link** at top of every page (already in App.jsx)
- **`prefers-reduced-motion`** respected globally

## Banned Patterns

- ❌ Default Tailwind template look (uniform radius, no hierarchy)
- ❌ Decorative-only color (use semantically)
- ❌ Stock hero + gradient blob (V21 has no hero, that's the point)
- ❌ Inline raw hex in components (always use tokens)
- ❌ Emoji in UI chrome (use lucide icons)
- ❌ Arbitrary spacing (`mt-[13px]`) — stick to 8px grid
- ❌ Nested ternaries in JSX (extract to const or function)
- ❌ console.log in production
- ❌ Hardcoded secrets / API keys

## Component Catalog

Foundational UI in `src/components/ui/`:

- `<Surface>` — card container (variant: default/raised/inset/overlay)
- `<Panel>` — bento panel with title + subtitle + action slot
- `<StatTile>` — small KPI box (icon, label, value, delta)
- `<Chip>` — status pill (tone: success/warning/danger/info/primary/neutral)
- `<EmptyState>` / `<ErrorState>` — standard placeholder
- `<FreshnessBadge>` — data freshness indicator
- `<Tabs>` — accessible tab switcher
- `<Skeleton>` / `<SkeletonPanel>` / `<SkeletonText>` — loading states
- `<SectionHeader>` — h2 with icon + title + subtitle
- `<ChartContainer>` — recharts theme wrapper

Layout in `src/components/layout/`:

- `<AppShell>` — Sidebar + Topbar + Outlet wrapper
- `<Sidebar>` — collapsible nav, mobile drawer
- `<Topbar>` — search, period filter, refresh, theme toggle
- `<Breadcrumb>` — route-derived
- `<PageHeader>` — title + subtitle + action
- `<Footer>` — last-updated + version

## Data Visualization

- **Consistent palette**: `--chart-1` through `--chart-6` (use `<ChartContainer>` for theme adaptation)
- **Tooltips**: dark background, 1px border, 8px padding, 12px text
- **Axis labels**: `--text-secondary`, 10-11px, tabular-nums
- **Grid lines**: `--border-subtle`, dashed
- **Animation**: 300ms ease-out (recharts default)

## Versioning

This file applies to TITAN V21+. Changes require a major version bump.
