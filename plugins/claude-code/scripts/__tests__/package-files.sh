#!/usr/bin/env bash
#
# Drift guard for the published Claude Code plugin surface.
#
# Asserts every path declared in `package.json#files` exists on disk
# and that the runtime payload directories (`hooks`, `scripts`,
# `skills`, `.claude-plugin`) are non-empty. The plugin has no build
# step, so the source tree IS the published surface; deleting a file
# in `files[]` without updating the array would silently ship a
# broken install.
#
# Runs entirely in-process: no Docker, no curl, no network. Mirrors
# the no-network contract of the other __tests__/*.sh gates in this
# directory.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PACKAGE_JSON="$PLUGIN_ROOT/package.json"

if [ ! -f "$PACKAGE_JSON" ]; then
  printf 'fixture path missing: %s\n' "$PACKAGE_JSON" >&2
  exit 1
fi

PASS_COUNT=0
FAIL_COUNT=0

assert() {
  local label="$1"; local condition="$2"
  if [ "$condition" = "true" ]; then
    printf 'PASS: %s\n' "$label"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    printf 'FAIL: %s\n' "$label" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# Read files[] using node so we don't depend on jq.
FILES=$(node -e "
  const pkg = require(process.argv[1]);
  const files = pkg.files || [];
  if (!Array.isArray(files) || files.length === 0) {
    console.error('package.json must declare a non-empty files[]');
    process.exit(2);
  }
  process.stdout.write(files.join('\n'));
" "$PACKAGE_JSON")
NODE_EXIT=$?
if [ "$NODE_EXIT" -ne 0 ]; then
  exit "$NODE_EXIT"
fi

while IFS= read -r entry; do
  [ -z "$entry" ] && continue
  target="$PLUGIN_ROOT/$entry"
  if [ -e "$target" ]; then
    assert "files[] entry exists: $entry" "true"
  else
    assert "files[] entry exists: $entry  (looked at $target)" "false"
  fi
done <<EOF
$FILES
EOF

# Directories that exist purely to ship runtime payload; refuse to
# publish an empty directory because Claude reads each on startup.
for required_dir in .claude-plugin hooks scripts skills; do
  target="$PLUGIN_ROOT/$required_dir"
  if [ -d "$target" ] && [ -n "$(ls -A "$target" 2>/dev/null)" ]; then
    assert "$required_dir/ is non-empty" "true"
  else
    assert "$required_dir/ is non-empty" "false"
  fi
done

# The Claude marketplace plugin manifest must remain at the
# documented location; without it `claude plugin install` fails
# silently.
MANIFEST="$PLUGIN_ROOT/.claude-plugin/plugin.json"
if [ -f "$MANIFEST" ]; then
  assert ".claude-plugin/plugin.json present" "true"
else
  assert ".claude-plugin/plugin.json present" "false"
fi

printf '\n%d passed, %d failed\n' "$PASS_COUNT" "$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
