#!/usr/bin/env bash
# Install the yfx skills into your user-global ~/.claude/ by symlink,
# so /recall, /clarify, /fresh-lens are available in every project you run Claude in.
# This repo stays the source of truth; the install is just symlinks pointing back here.
#
#   ./install.sh            # symlink into ~/.claude/ (skips anything already there)
#   ./install.sh --force    # replace existing yfx symlinks
#   CLAUDE_HOME=/path ./install.sh   # install somewhere other than ~/.claude
#
# The always-on probes (x/y nudge, commit-boundary fresh-lens trigger, user labels) are not
# installed here: they live in the mods/yfx Claude Code mod — see the notes printed at the end.

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
mkdir -p "$DEST/skills"

echo "skills:"
# memory-provider.md is itself a symlink into providers/, so the installed link resolves through
# it back to the active card. 2nd was missing from this list while the skill shipped in the repo.
for item in recall clarify fresh-lens 2nd xy-diagnosis.md memory-provider.md; do
  link "$REPO/skills/$item" "$DEST/skills/$item"
done

# The settings hooks this script used to link moved into mods/yfx. Remove links left by an older
# install: they point at files that no longer exist, and a wired one would fail every prompt.
for hook in recall-context.mjs fresh-lens-trigger.mjs; do
  if [ -L "$DEST/hooks/$hook" ] && [ "$(readlink "$DEST/hooks/$hook")" = "$REPO/hooks/$hook" ]; then
    rm "$DEST/hooks/$hook"
    echo "  removed stale hook link: ${DEST/#$HOME/~}/hooks/$hook (now in mods/yfx; unwire it from settings.json)"
  fi
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

2) The always-on probes come with the yfx mod. In a Claude Code terminal session:

     /plugin install yfx --marketplace dmoiseenko/yfx

   Everything in it is off until you turn it on, per project:

     /yfx on nudge     # x/y diagnosis prompt on each substantive prompt you type
     /yfx on lens      # fresh-lens audit reminder at git commit / gh pr create / merge
     /yfx on labels    # ask you, after each turn, which mode your prompt was

3) To uninstall: remove the symlinks under $DEST/skills; /plugin uninstall yfx.
EOF
