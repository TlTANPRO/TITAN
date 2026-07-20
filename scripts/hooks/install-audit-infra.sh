#!/usr/bin/env bash
# TITAN — Install audit infrastructure
# Copies pre-session hook + audit-titan slash command to protected paths
# and registers them in .claude/settings.json.
#
# Run: bash scripts/hooks/install-audit-infra.sh
# Or:  pnpm run setup:audit-infra
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK_SRC="$ROOT/scripts/hooks/pre-session.cjs"
HOOK_DEST_DIR="$ROOT/.claude/hooks"
HOOK_DEST="$HOOK_DEST_DIR/pre-session.cjs"

CMD_SRC="$ROOT/scripts/commands/audit-titan.md"
CMD_DEST_DIR="$ROOT/.claude/commands"
CMD_DEST="$CMD_DEST_DIR/audit-titan.md"

SETTINGS="$ROOT/.claude/settings.json"

echo "==> TITAN Audit Infrastructure Installer"
echo "    Root: $ROOT"
echo ""

# 1. Copy hook
mkdir -p "$HOOK_DEST_DIR"
cp "$HOOK_SRC" "$HOOK_DEST"
chmod +x "$HOOK_DEST"
echo "[OK] Hook copied to $HOOK_DEST"

# 2. Copy slash command
mkdir -p "$CMD_DEST_DIR"
cp "$CMD_SRC" "$CMD_DEST"
echo "[OK] Slash command copied to $CMD_DEST"

# 3. Register in settings.json
if [ ! -f "$SETTINGS" ]; then
  echo "{}" > "$SETTINGS"
  echo "[OK] Created $SETTINGS"
fi

# Check if hook already registered
if grep -q "pre-session.cjs" "$SETTINGS" 2>/dev/null; then
  echo "[SKIP] Hook already registered in settings.json"
else
  # Convert MSYS path → native Windows path (for Node fs APIs)
  HOOK_DEST_WIN=$(cd "$(dirname "$HOOK_DEST")" && pwd -W 2>/dev/null)/$(basename "$HOOK_DEST")
  SETTINGS_WIN=$(cd "$(dirname "$SETTINGS")" && pwd -W 2>/dev/null)/$(basename "$SETTINGS")
  node -e "
const fs = require('fs');
const path = '$SETTINGS_WIN';
const s = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!s.hooks) s.hooks = {};
if (!s.hooks.SessionStart) s.hooks.SessionStart = [];
s.hooks.SessionStart.push({
  hooks: [
    {
      type: 'command',
      command: 'node \"' + '$HOOK_DEST_WIN' + '\"'
    }
  ]
});
fs.writeFileSync(path, JSON.stringify(s, null, 2) + '\n');
console.log('[OK] Hook registered in settings.json (SessionStart)');
"
fi

echo ""
echo "==> Verification"
echo ""
echo "Test hook (should print pre-session info):"
echo "  node $HOOK_DEST"
echo ""
echo "Test slash command (in Claude Code):"
echo "  /audit-titan"
echo ""
echo "[DONE] Audit infrastructure installed."
