---
description: WAJIB jalankan sebelum kerja TITAN apapun. Cek live state, verifikasi shipped fixes, load 7 prinsip audit. Output wajib dilihat sebelum plan/fix apapun.
allowedTools: [Bash, Read, Grep, Glob]
---

# /audit-titan — TITAN Pre-Session Audit

**Jalankan command ini di awal SETIAP sesi TITAN sebelum kerja apapun.**

Sesi TITAN tanpa `/audit-titan` = risiko V29 terulang (5 klaim, 4 salah).

## Step 1: Cek live state (BUKAN asumsi)

```bash
# Bundle hash
curl -s https://tltanpro.github.io/TITAN/ | grep -oE "vite-index.template-[A-Za-z0-9]+\.js" | head -1

# Save bundle
BUNDLE=$(curl -s https://tltanpro.github.io/TITAN/ | grep -oE "vite-index.template-[A-Za-z0-9]+\.js" | head -1)
curl -s "https://tltanpro.github.io/TITAN/assets/$BUNDLE" -o /tmp/live-bundle.js

# Verify V28.1 fix live
grep -c "titan-llm-proxy" /tmp/live-bundle.js
# Expect: 6 (V28.1 fix live)

# Verify V25.7 fix live (AI text + Bot icon removed)
grep -c '"Bot"' /tmp/live-bundle.js
# Expect: 0

grep -c "AI-Generated\|AI Insight\|AI Configuration" /tmp/live-bundle.js
# Expect: 0
```

## Step 2: Cek live data structure

```bash
# Data live
curl -s https://tltanpro.github.io/TITAN/accounts-full.json -o /tmp/live-data.json
wc -c /tmp/live-data.json
# Expect: ~8.96 MB

node -e "const d=require('/tmp/live-data.json');console.log('akun:',d.length,'posts:',d.reduce((s,a)=>s+(a.posts?.length||0),0))"
# Expect: akun: 9, posts: ~4134

# Cross-dup count (composite key id+shortcode)
node -e "const d=require('/tmp/live-data.json');const seen=new Map();let dup=0;d.forEach(a=>(a.posts||[]).forEach(p=>{const k=(a.platform||'')+':'+(p.shortcode||p.id);if(seen.has(k)&&seen.get(k)!==a.account.slug)dup++;else seen.set(k,a.account.slug)}));console.log('cross-dup:',dup)"
# Expect: ≤5 (live dataset historical punya 2 real IG-IG repost)
```

## Step 3: Cek git state

```bash
cd C:/Users/Syahfalah/TITAN
git log --oneline -5
git status --short
# Catat: branch, last commit hash, dirty files
```

## Step 4: Load shipped versions (WAJIB)

**Baca** (dari `~/.claude/projects/C--Users-Syahfalah/memory/`):
- `MEMORY.md` — index
- `project-titan-v25-shipped.md` — 8 user feedback fixes (V25.7 = Bot icon, AI text)
- `project-titan-v28-chatpanel-workflow-fix.md` — VITE_LLM_PROXY_URL workflow fix
- `feedback-titan-audit-contract-v1.md` — **7 prinsip audit (WAJIB apply)**
- `titan-v29-audit-cancelled.md` — kenapa V29 gagal (lesson learned)

## Step 5: Apply 7 prinsip

Sebelum tulis plan/fix apapun, **cek ulang**:

- [ ] **P1**: Sudah live → source → plan (sequential, bukan 3 Explore paralel)
- [ ] **P2**: Tidak pakai Explore untuk audit (pakai Plan untuk design, verify untuk E2E)
- [ ] **P3**: Setiap klaim live = curl + parse + output exact (bukan asumsi)
- [ ] **P4**: E2E test mandatory sebelum ExitPlanMode (run live script + capture output)
- [ ] **P5**: Kalau live ≠ source, surface konflik, jangan proceed
- [ ] **P6**: Facts self-verify (jangan tanya user composite key dll)
- [ ] **P7**: Plan ≤5 sub-task, tested E2E, baru ExitPlanMode

## Step 6: Report ke user

Setelah 5 step di atas selesai, **report** ke user dalam format:

```
=== TITAN Pre-Session Audit ===

[live] bundle: vite-index.template-XXXXX.js
[live] proxy URL refs: N (expect: 6)
[live] Bot icon: N (expect: 0)
[live] AI text: N (expect: 0)
[live] data: N akun, N posts, N cross-dup

[git] branch: ...
[git] last commit: ...
[git] working tree: clean / N files dirty

[memory] shipped versions loaded: V25, V28, contract v1
[contract] 7 prinsip applied: ✓

Ready to receive task.
```

**Setelah report ini, BARU boleh mulai kerja.**

## Recovery (kalau output di atas tidak sesuai expect)

```bash
# Kalau proxy URL != 6: V28.1 fix mungkin broken
# Jangan tulis plan baru. Tanya user: "proxy URL count = N, expect 6. V28.1 fix rusak?"

# Kalau Bot icon > 0: V25.7 fix mungkin broken
# Jangan tulis plan baru. Tanya user.

# Kalau cross-dup > 5: incremental scrape mungkin jalan dan break
# Run validate-merge dulu, fix root cause, baru lanjut.
```

## Out-of-scope untuk sesi ini

- Cleanup file dead/duplicate (V30)
- Auto-rollback kalau live bundle broken
- Multi-region Worker
- E2E test GitHub Actions (act tool)
