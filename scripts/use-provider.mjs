#!/usr/bin/env node
// Switch the active memory provider card.
//
//   npm run provider            # show the active card and the available ones
//   npm run provider mem0       # point skills/memory-provider.md at providers/mem0.md
//
// The card is a symlink so there is exactly one copy of each provider's declaration; switching
// is a one-line diff, and `npm test` re-checks the new card's claims against measured results.

import { readdirSync, symlinkSync, unlinkSync, readlinkSync, readFileSync, existsSync, renameSync, rmSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const CARD = join(REPO, "skills", "memory-provider.md");
const DIR = join(REPO, "providers");

const available = readdirSync(DIR)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .map((f) => basename(f, ".md"))
  .sort();

// readlinkSync throws EINVAL when the card materialized as a REGULAR FILE holding its target —
// a clone with core.symlinks=false, or a git archive export. Without the fallback this reports
// "(none)" on such a checkout, and the user switches away from a card that was in fact active.
// Same fallback check-cards.test.mjs already uses.
const active = () => {
  try { return basename(readlinkSync(CARD), ".md"); } catch {}
  try { return basename(readFileSync(CARD, "utf8").trim(), ".md"); } catch { return null; }
};

const want = process.argv[2];
if (!want) {
  console.log(`active:    ${active() ?? "(none)"}`);
  console.log(`available: ${available.join(", ")}`);
  process.exit(0);
}
if (!available.includes(want)) {
  console.error(`unknown provider: ${want}\navailable: ${available.join(", ")}`);
  process.exit(1);
}
// Atomic: unlink-then-symlink leaves the repo with NO active card if the second step fails,
// and `npm test` then reports the card as missing rather than as whatever it was before.
// rmSync(force), not existsSync+unlink: existsSync FOLLOWS symlinks, so a leftover .staged link
// whose target no longer exists reads as absent, the symlinkSync below throws EEXIST, and every
// later `npm run provider` fails identically until someone deletes the file by hand.
const staged = `${CARD}.staged`;
rmSync(staged, { force: true });
symlinkSync(join("..", "providers", `${want}.md`), staged);
renameSync(staged, CARD);
console.log(`active provider -> ${want}`);
