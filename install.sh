#!/usr/bin/env bash
# Install the yfx skills + hooks into your user-global ~/.claude/ by symlink,
# so /recall, /clarify, /fresh-lens are available in every project you run Claude in.
# This repo stays the source of truth; the install is just symlinks pointing back here.
#
#   ./install.sh            # symlink into ~/.claude/ (skips anything already there)
#   ./install.sh --force    # replace existing yfx symlinks
#   CLAUDE_HOME=/path ./install.sh   # install somewhere other than ~/.claude
#
# Hooks are copied in but stay OFF until you (1) wire them in settings.json and
# (2) opt in per the flag in each hook's header — see the notes printed at the end.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${CLAUDE_HOME:-$HOME/.claude}"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

link() { # link <src> <dst>
  local src="$1" dst="$2"
  if [ -L "$dst" ] || [ -e "$dst" ]; then
    if [ "$(readlink "$dst" 2>/dev/null)" = "$src" ]; then
      echo "  ok (already linked): ${dst/#$HOME/~}"; return
    fi
    if [ "$FORCE" = 1 ]; then
      rm -rf "$dst"
    else
      echo "  SKIP (exists, use --force): ${dst/#$HOME/~}"; return
    fi
  fi
  ln -s "$src" "$dst"
  echo "  linked: ${dst/#$HOME/~} -> ${src/#$HOME/~}"
}

echo "Installing yfx from $REPO into ${DEST/#$HOME/~}"
mkdir -p "$DEST/skills" "$DEST/hooks"

echo "skills:"
# memory-provider.md is itself a symlink into providers/, so the installed link resolves through
# it back to the active card. 2nd was missing from this list while the skill shipped in the repo.
for item in recall clarify fresh-lens 2nd xy-diagnosis.md memory-provider.md; do
  link "$REPO/skills/$item" "$DEST/skills/$item"
done

echo "hooks (dormant until wired + enabled):"
for hook in recall-context.mjs fresh-lens-trigger.mjs; do
  link "$REPO/hooks/$hook" "$DEST/hooks/$hook"
done

cat <<EOF

Done. Next steps:

1) Skills work now: /clarify, /fresh-lens and /2nd are standalone. /recall's memory
   step reads the active provider card (skills/memory-provider.md -> providers/*.md)
   to learn which tool to call and how to query it. Switch providers with:

     npm run provider            # show active + available
     npm run provider mem0       # mem0 (default) | claude-mem | none

   "none" is supported, not broken: /recall still runs the diagnosis and falls back
   to the code, git log, and asking the user.

2) Hooks are OFF by default. To actually run them, add them to $DEST/settings.json:

     {
       "hooks": {
         "UserPromptSubmit": [
           { "hooks": [{ "type": "command", "command": "node ~/.claude/hooks/recall-context.mjs" }] }
         ],
         "PreToolUse": [
           { "hooks": [{ "type": "command", "command": "node ~/.claude/hooks/fresh-lens-trigger.mjs" }] }
         ]
       }
     }

   Then opt in per hook: fresh-lens-trigger needs FRESH_LENS_TRIGGER=1 (or a
   .claude/fresh-lens.on marker file); recall-context needs RECALL_LOOP=1 (or a
   .claude/recall-loop.on marker). See each hook's header for its flag.
   recall-context injects only the x/y nudge — it does not retrieve, so it needs
   no memory provider running.

3) To uninstall: remove the symlinks under $DEST/skills and $DEST/hooks.
EOF
