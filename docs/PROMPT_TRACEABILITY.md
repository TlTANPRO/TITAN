# Prompt Traceability — TITAN

Corpus: `C:\Users\Kantor2\Orca\Motion\motionsites_all_prompts.json`
(328 prompts: 311 website, 17 app · 114 free, 214 paid)

This records which prompts were implemented, what was taken, what was dropped,
and why. CSS lifted from each prompt lives in `src/styles/prompt-sites.css`,
where every block is named after its source prompt so this file is checkable
against the code.

**Rule applied:** structure, layout, motion, and interaction are implemented as
written. Fictional brand copy, third-party asset URLs, and prompt fonts are not.
Every number on the landing page is computed from TITAN's own data in
`src/lib/landingData.js` — 27 unit tests cover it.

---

## 1. Implemented on the landing page (`/`)

| Prompt | Section | File | Taken as written | Substituted |
|---|---|---|---|---|
| `rivr-defi-landing` | Hero | `components/landing/Hero.jsx` | Full-screen well, `rounded-[3rem]` container, glass badge with Sparkles, staggered fade+scale via Framer Motion, bottom-left glass card, **bottom-right cut-out corner with both inverted-corner SVGs** (`M56 56V0C56 30.9 30.9 56 0 56H56Z`) | Background `<video>` (CloudFront MP4) → `.rivr-aurora` CSS field. Copy and metrics → real data. Navbar kept visible on desktop (the prompt hides it, which would strand the page). |
| `rivr-defi-landing` §4 | Metrics | `components/landing/Metrics.jsx` | `bg-[rgba(30,50,90,0.02)]` box, `rounded-[3rem]`, 2×4 border-divided grid, staggered upward `whileInView` | The four DeFi constants → eight computed portfolio figures |
| `rivr-defi-landing` §5 | Features | `components/landing/Features.jsx` | `grid-cols-1 md:grid-cols-3 md:grid-rows-2`, white cards `rounded-[2rem]`, `hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]`, tall-left card `min-h-[28rem]`, wide top-right, 2%-opacity watermark icons with `group-hover:scale-110`, outline button + centred circular ArrowUpRight button | Card copy → TITAN's features; each card links to a real route |
| `technical-specifications` | Spec chart | `components/landing/SpecStats.jsx` | Layered `radial-gradient` background, 4-tab bar with `::after` `scaleX(0→1)` gradient underline, 1px-bordered 20px-radius chart, `repeating-linear-gradient` vertical rules, 4-column bar rows with range indicator + fill + right value + **6 spark traces with cross-hairs**, 11-column 0–100 axis, replay-on-tab via the specified 140ms delay + `requestAnimationFrame` | The four fixed aerospace datasets → computed portfolio data. Colour palette kept (no purple). |
| `bento-grid-stats` | Bento | `components/landing/BentoStats.jsx` | `bg-[#0f0f0f] px-6 py-24 lg:px-16 lg:py-32`, 6-col grid with `gridTemplateRows: repeat(10, minmax(46px, auto))`, all six explicit grid placements, `useInView({ once: true, margin: '-60px' })`, `scale(0.95)→1` over 0.65s with ease `[0.22,1,0.36,1]`, `bento-plus` button, 26-column dot staircase, 3-circle ring SVG with 4 marked squares, 7 scattered squares, 5 stars | DM Sans → Inter. Card 6's Pexels stock photo + invented "4.9 / 5" → real figures in the same dark-overlay shape. |
| `faq-cta` | CTA + FAQ | `components/landing/CtaFaq.jsx` | **The full `@property` blob-gradient block copied verbatim** into `prompt-sites.css`, including all five blob keyframe tracks, the five size keyframes and the `prefers-reduced-motion` kill switch. `grid-cols-[1.6fr_1fr]`, 24px-radius gradient card, button that bumps its shadow on hover, 5-item accordion with `useState(0)`, 10px-radius items and the two box-shadow states, ChevronUp when open | Money-transfer copy → TITAN's own data questions. Gradient colours kept exactly. |
| `stark-minimal-footer` | Footer | `components/landing/LandingFooter.jsx` | **The entire spec, which was already written as CSS**: 120px dot band, `.footer-dots__line` at 200% width with three layered radial-gradient dot patterns at the exact positions/sizes, `footerDotsMove 18s linear infinite`, `minmax(320px,1.25fr) repeat(3,minmax(150px,0.42fr))` grid, the zig-zag `clip-path` brand mark, wordmark at `clamp(58px,11.1vw,214px)` / weight 760 / `-0.055em` / `0.78`, 9px legal line, breakpoints at 980px and 560px | "EngineTech" → TITAN; nav columns point at real routes |

## 2. Implemented inside the app

| Prompt | Where | Status |
|---|---|---|
| `nimbus-ops` | `components/StatusRail.jsx` — one signature motion, 1px tracks, `motion-safe:` | shipped |
| `nexar-hero` | `components/PortfolioStatus.jsx` — status-first opening viewport | shipped |
| `nimbus-demo` | `components/DecisionQueue.jsx` — worklist before charts | shipped |
| `modern-hr-dashboard` | existing `styles/tokens.css` ladder, `.tabular-nums`, no card shadows | pre-existing |
| `technical-specifications` | `components/account/AccountBenchmark.jsx` metric alignment | pre-existing |

## 3. Reference only

| Prompt | Decision it shaped |
|---|---|
| `digital-epoch-hero` | Status-rail thin-line vocabulary |
| `pulse-3d` | "One ambient signal" idea, kept as the single StatusRail |
| `nexora-features` | Feature grid inverted into a worklist |
| `global-cta-footer` | Confirmed no marketing footer; the stark footer is used instead |
| `reveal-hero` | Confirmed no scroll-reveal on data views |
| `futuristic-cinematic` | No cinematic framing on a dashboard |

## 4. Rejected, with reasons

| Prompt | Reason |
|---|---|
| `yacht-club-hero` | Luxury register; wrong for a marketing-intelligence tool |
| `saas-pricing-flow` | TITAN has no pricing surface; the flow would invent a commercial model |
| `pulse-3d` (as default) | WebGL cost conflicts with the performance budget |
| Any prompt's stock-photo card | Unverified asset provenance, and a fabricated "4.9/5" is the opposite of the product's premise |
| Any prompt's external video/font URL | Unverifiable provenance, multi-MB payload, and a first-paint regression |
| `nike-premium-landing`, `glitch-pulse`, `bio-active`, `yoga-coach` | Brand-specific art direction that cannot be de-branded without becoming generic |

## 5. Rules applied throughout

- **No new dependencies.** Tailwind 3, Framer Motion 11 and lucide-react are all already in `package.json`; nothing was added or upgraded.
- **No new font.** Prompts call for Helvetica Regular, DM Sans and Geist; TITAN uses Inter. Loading a fourth family for six sections would be a net regression.
- **No copied copy.** Every headline and paragraph is TITAN's own Indonesian operational language.
- **No third-party assets.** Zero image, video, font or CDN URLs from the corpus are referenced.
- **Motion is decorative.** Every animated value is also printed as text, and all of it is disabled under `prefers-reduced-motion`.

## 6. Bugs found while implementing, and fixed

These came out of rendering the page in a real browser, not from reading the code:

1. **Spec fill bars rendered 0×0.** `.spec-fill` is a `<span>`; an inline box ignores `width`/`height`. Added `display: block`. Confirmed by computed `getBoundingClientRect` (0×0 → 678×49).
2. **Every link inherited near-white.** The prompt's `a { color: inherit }` anchor reset was duplicated in `prompt-sites.css`, which outranked `text-neutral-800` utilities and made light-on-light text. Tailwind preflight already does that reset, so the duplicate was removed. Link colour went `rgb(250,250,250)` → `rgb(38,38,38)`.
3. **Two `<h1>`s per page.** Embedding the command center in the landing duplicated the PortfolioStatus heading. It now takes a `headingAs` prop and drops to `h2` when embedded.
4. **Value labels failed contrast on near-full bars.** White on `#d6e3ff` at 100%. Added a dark chip behind the label.
5. **Coverage tile always read "—".** It was gated on `accounts.length === 0`, but coverage lives in the manifest, which is always present. Now uses the manifest regardless; regression test added.
6. **Dead timestamp branch.** `accounts.length ? getLatestScrapeAt(accounts) : manifest.lastScrapeAt` reported "never ran" when account records loaded without a `scrapedAt`. Replaced with a `resolveTimestamp` fallback chain.
7. **Unreachable queue warning.** `DecisionQueue` had an `else if` for a 14-day idle warning that could never fire. Replaced with the documented fresh/delayed/stale contract.

## 6b. V39 — tap targets and the audit gate

**8. 47 interactive elements rendered 12-23px tall.** The cause is chips and small buttons built from `px-2 py-1` with 10-11px type, which lands just under the 24px minimum in WCAG 2.2 SC 2.5.8. Three attempts, in order:

- Bumping the utility classes (`py-1` → `py-1.5`) did not move the computed height. Raw component CSS outranks the utility in the cascade, so the padding stayed at 4px.
- Gating a `min-height` rule behind `@media (pointer: coarse)` silently did nothing: a desktop browser reports `pointer: fine`, so the rule never applied and the audit kept reporting the same targets. WCAG 2.2 asks for 24px regardless of pointer type, so the gate is not needed.
- The working shape is two rules. `a[href] { min-height: 24px }` unconditional is a no-op on a true inline box and lifts only links that already declare `inline-flex`, so it cannot move anything. `display: inline-flex` is applied separately, scoped to nav, lists, tables, breadcrumbs and the footer.

A blanket `a[href] { display: inline-flex }` was tried and **regressed two pages**: a link that wraps a card switches from block to shrink-to-fit, so its percentage-width children (a 260px chart, an icon) stop resolving against the container and spill past the viewport. The deploy gate caught it as a P0. Do not widen that selector.

**9. The 404 route had no `<main>`.** `NotFound` is routed outside `AppShell`, which is the only other place that emits the landmark, so it now supplies its own.

**10. The audit reported non-compliant targets that are compliant.** A plain 24×24 check flags a row of account handles that measure 19×24. WCAG 2.5.8 has a *spacing exception*: an undersized target passes if a 24px circle centred on it does not touch another target's circle. Measured gap is 32px. The audit now implements that exception and the inline-target exemption, because a gate that cries wolf on a compliant page gets ignored.

**11. `scripts/audit-ui.mjs` — the gate itself.** Two measurement bugs are documented at the top of the file so they are not reintroduced:

- Navigating to the same URL twice (once to seed `localStorage`, once to "reload") makes `vite preview` answer with its *"public base URL is /TITAN/"* error page. Every route then measures ~106 characters and looks empty. Seed the theme on the origin, then navigate exactly once.
- Toggling the theme class after load fights `AppShell`'s own effect and leaves the app rendering only the skip link. The theme must be set before the app boots.

`vite preview` also needs `--host 127.0.0.1` on this machine; without it vite binds only to `::1` and every IPv4 probe is refused.

The gate runs in `deploy.mjs` between the build and the copy-to-root step, because the copy is the point of no return — after it, `git add` will commit a broken UI. Verified by injecting a deliberate regression: the gate exits 1 and the repo root and `origin/main` are left untouched.

## 7. Verified

- 170 unit tests pass (12 files)
- Production build passes
- `node scripts/audit-ui.mjs` — 11 routes × desktop 1440 and mobile 375, **0 P0, 0 P1, 0 P2**
- Every route has exactly one visible `<h1>` and exactly one `<main>`; the 404 route included
- Light mode reviewed page by page on all 10 content routes: 0 console errors, 0 invisible text
- The gate was proven to fail: with a deliberate `main { display: none }` regression it reported `P1: no visible <h1>` on both viewports and exited 1
- Browser-driven checks: 8 metric tiles, 4 feature cards, 4 tabs, 4 bars, 24 spark traces, 26 dot columns, 6 bento cards, 5 FAQ items, animated gradient, footer wordmark
- Tab switch replays the animation (`is-ready` drops, then re-fires) and swaps all four bars
- FAQ opens on click, on Enter, and on Space
- Mobile menu sets `aria-expanded`, locks body scroll, and closes on Escape
- 0 images without alt, 0 unlabelled buttons
