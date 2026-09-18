#!/usr/bin/env node
// Switch the active memory provider card.
//
//   npm run provider            # show the active card and the available ones
//   npm run provider mem0       # point skills/memory-provider.md at providers/mem0.md
//
// The card is a symlink so there is exactly one copy of each provider's declaration; switching
// is a one-line diff, and `npm test` re-checks the new card's claims against measured results.

import { readdirSync, symlinkSync, unlinkSync, readlinkSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const CARD = join(REPO, "skills", "memory-provider.md");
const DIR = join(REPO, "providers");

const available = readdirSync(DIR)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .map((f) => basename(f, ".md"))
  .sort();

const active = () => {
  try { return basename(readlinkSync(CARD), ".md"); } catch { return null; }
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
if (existsSync(CARD) || active() !== null) unlinkSync(CARD);
symlinkSync(join("..", "providers", `${want}.md`), CARD);
console.log(`active provider -> ${want}`);
