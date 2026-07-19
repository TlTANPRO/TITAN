#!/usr/bin/env bash
# TITAN Daily Update — manual run (backup kalau Actions down)
# Usage: ./scripts/daily-update-local.sh
#
# Pipeline: scrape (IG + TT) → validate → generate data → generate AI → build → deploy
# Time: ~25-40 menit (mostly IG scrape)

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==================================="
echo "TITAN Daily Update (local)"
echo "Started: $(date)"
echo "==================================="

echo ""
echo "→ Step 1/6: Install dependencies"
pnpm install --frozen-lockfile

echo ""
echo "→ Step 2/6: Pre-flight validate"
node scripts/validate-merge.mjs

echo ""
echo "→ Step 3/6: Scrape Instagram (incremental, 1-day window)"
node scripts/scrape-ig.mjs --days=1 || echo "⚠️  IG scrape failed, continuing..."

echo ""
echo "→ Step 4/6: Scrape TikTok (incremental, 1-day window)"
node scripts/scrape-tt.mjs --days=1 || echo "⚠️  TT scrape failed, continuing..."

echo ""
echo "→ Step 5/6: Validate after scrape + generate data"
node scripts/validate-merge.mjs
node scripts/generate-data.mjs

echo ""
echo "→ Step 6/6: Generate AI insights + build + deploy"
pnpm insights:generate || echo "⚠️  AI generation failed (continuing with analytics-only)"

# Deploy but skip push (let user review diff first)
echo ""
echo "→ Deploy (skip-push mode — review changes first):"
pnpm run deploy:nopush

echo ""
echo "==================================="
echo "✅ Local update complete"
echo "Review changes: git status"
echo "Push to deploy: pnpm run deploy"
echo "Finished: $(date)"
echo "==================================="
