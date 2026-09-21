// Keeps provider cards honest: every capability a card CLAIMS must match what a run MEASURED.
//
// This project is a research repo — its cards describe how a memory provider behaves, and a
// card is only worth reading if it cannot quietly drift ahead of the evidence. So:
//
//   • a card may claim `query_language: any` only if the measured ru_bare/en ratio cleared the
//     protocol's 0.60 bar;
//   • a card may claim `english_only` only if that ratio fell to 0.20 or below;
//   • a ratio between the bars is INCONCLUSIVE — the card must say `unmeasured`, matching the
//     decision rule in PROTOCOL-memory-provider.md, which forbids forcing a verdict there;
//   • a card with no measurement at all must say `unmeasured` and must not carry a `measured:`
//     block pretending otherwise.
//
// Run: npm test          (or: node --test evals/check-cards.test.mjs)
// Re-measure: npm run eval:memory   -> rewrites evals/results-memory-provider.json

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, readlinkSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const PROVIDERS = join(REPO, "providers");
const RESULTS = join(REPO, "evals", "results-memory-provider.json");

// Thresholds are the protocol's, not this file's — keep them in one place conceptually.
const BRIDGES_AT = 0.6;
const FAILS_AT = 0.2;

const REQUIRED = [
  "provider", "tool", "query_language", "citable_ids", "expansion", "scope", "auto_injection",
];

function frontmatter(path) {
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let [, k, v] = kv;
    v = v.trim();
    if (v === "") { out[k] = {}; continue; } // nested block (e.g. measured:)
    if (v === "true" || v === "false") out[k] = v === "true";
    else if (/^\[.*\]$/.test(v)) out[k] = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    else out[k] = v;
  }
  // nested "measured:" block — indented key: value lines under it
  const measured = m[1].match(/^measured:\n((?:[ \t]+.*\n?)+)/m);
  if (measured) {
    out.measured = {};
    for (const line of measured[1].split("\n")) {
      const kv = line.match(/^\s+([a-z_]+):\s*(.+)$/);
      if (kv) out.measured[kv[1]] = isNaN(Number(kv[2])) ? kv[2].trim() : Number(kv[2]);
    }
  }
  return out;
}

const cards = readdirSync(PROVIDERS)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .map((f) => ({ name: basename(f, ".md"), path: join(PROVIDERS, f) }));

test("there is at least one provider card", () => {
  assert.ok(cards.length > 0, "providers/ has no cards");
});

for (const card of cards) {
  test(`card ${card.name}: declares all six axes`, () => {
    const fm = frontmatter(card.path);
    assert.ok(fm, `${card.name}.md has no frontmatter`);
    for (const key of REQUIRED) {
      assert.ok(key in fm, `${card.name}.md is missing required axis: ${key}`);
    }
    assert.equal(fm.provider, card.name, "provider field must match the file name");
    assert.ok(
      ["any", "english_only", "unmeasured"].includes(fm.query_language),
      `${card.name}.md query_language must be any | english_only | unmeasured`,
    );
  });

  test(`card ${card.name}: claims match the measured run`, () => {
    const fm = frontmatter(card.path);
    const results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : null;
    const measured = results?.providers?.find((p) => p.provider === card.name);

    // A provider present in the results but with no usable ratio (every row skipped or errored)
    // is NOT a measurement — treat it exactly like an absent run, or the protocol's "unmeasured"
    // escape hatch becomes unreachable and no card value can pass.
    if (!measured || typeof measured.ratio !== "number") {
      assert.equal(
        fm.query_language,
        "unmeasured",
        `${card.name}.md claims "${fm.query_language}" but no run measured it — ` +
          `run \`npm run eval:memory\` or declare unmeasured`,
      );
      assert.ok(
        !fm.measured,
        `${card.name}.md carries a measured: block but no run backs it`,
      );
      return;
    }

    const ratio = measured.ratio;

    const expected =
      ratio >= BRIDGES_AT ? "any" : ratio <= FAILS_AT ? "english_only" : "unmeasured";
    assert.equal(
      fm.query_language,
      expected,
      `${card.name}.md claims query_language "${fm.query_language}" but the measured ` +
        `ru_bare/en ratio is ${ratio.toFixed(2)} => "${expected}" ` +
        `(PROTOCOL-memory-provider.md: >=${BRIDGES_AT} any, <=${FAILS_AT} english_only, else inconclusive)`,
    );

    if (fm.measured?.ratio !== undefined) {
      assert.ok(
        Math.abs(fm.measured.ratio - ratio) < 0.005,
        `${card.name}.md quotes ratio ${fm.measured.ratio} but the run says ${ratio.toFixed(2)} — stale card`,
      );
    }
  });
}

test("the active card symlink points at a real provider", () => {
  const link = join(REPO, "skills", "memory-provider.md");
  assert.ok(existsSync(link), "skills/memory-provider.md is missing — run `npm run provider <name>`");
  // On a clone with core.symlinks=false (or a `git archive` export) the link materializes as a
  // regular file containing its target path; readlinkSync would throw EINVAL and fail the suite
  // with an opaque error instead of the assertion below.
  let raw;
  try { raw = readlinkSync(link); } catch { raw = readFileSync(link, "utf8").trim(); }
  const target = basename(raw, ".md");
  assert.ok(
    cards.some((c) => c.name === target),
    `skills/memory-provider.md points at "${target}", which is not in providers/`,
  );
});
