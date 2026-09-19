// Memory-provider language-bridge eval. Protocol (design, metric, decision rule, confounds)
// was committed BEFORE any data was collected: evals/PROTOCOL-memory-provider.md.
//
// The question it decides: `skills/recall/SKILL.md` justifies the whole harvest machinery in
// `hooks/recall-context.mjs` with "a raw non-English query retrieves ~0%". That was measured
// against claude-mem only. If another provider bridges RU->EN, the harvest is not core — it is
// compensation for one provider's defect and belongs behind the provider boundary.
//
// Roles are separated so none can re-run another's decision:
//   corpus sampler  — mechanical, seeded; no human picks rows
//   query author    — context-less `claude -p`, sees ONE memory's text and nothing else
//   scorer          — mechanical; gold is identity (the query was authored FROM that memory)
//
//   node memory-provider.mjs                  # both providers, N=24
//   N=12 PROVIDERS=mem0 node memory-provider.mjs
//   MODEL=haiku node memory-provider.mjs      # cheaper query author

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { claude, firstJson, ROOT, MODEL } from "./lib.mjs";

const pexec = promisify(execFile);
const N = Number(process.env.N || 24);
const SEED = Number(process.env.SEED || 20260918);
const TOP_K = Number(process.env.TOP_K || 5);
const PROVIDERS = (process.env.PROVIDERS || "mem0,claude-mem").split(",").map((s) => s.trim());
const ARMS = ["ru_bare", "ru_anchored", "en"];

// Deterministic sampling: the corpus is sorted by id, then walked with a seeded PRNG, so the
// same seed always yields the same rows and no row is chosen by hand.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(rows, n, seed) {
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const rnd = mulberry32(seed);
  for (let i = sorted.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  }
  return sorted.slice(0, n);
}

// ---------------------------------------------------------------- providers
// Deliberately NOT extracted into an adapter contract yet. The protocol's whole point is to
// measure before abstracting; freezing a contract here would bake in claude-mem's shape, which
// is the failure mode this eval exists to avoid. These become the adapters once the data says
// where the seam belongs.

// mem0 scope (app_id / project_id / user_id) is derived by the plugin through
// _legacy_project_id -> _project_id, which reads ~/.mem0/project_map.json. Reimplementing that
// in Node is exactly the fragility this eval should not introduce, so the plugin's own CLI is
// the oracle — called ONCE, cached. Everything after that is plain Node fetch, which is what
// `providers/mem0.mjs` will do: no interpreter in the hook's hot path, and the search function
// measured here is the one that ships.
const MEM0_PLUGIN =
  process.env.MEM0_PLUGIN_ROOT ||
  join(process.env.HOME, ".claude/plugins/cache/mem0-plugins/mem0/0.3.0");
const MEM0_DATA =
  process.env.MEM0_CODE_DATA_DIR ||
  join(process.env.HOME, ".claude/plugins/data/mem0-mem0-plugins");
const MEM0_API = (process.env.MEM0_API_URL || "https://api.mem0.ai").replace(/\/+$/, "");

let mem0Config = null;
async function mem0Conf() {
  if (mem0Config) return mem0Config;
  const { stdout } = await pexec(
    "python3",
    [join(MEM0_PLUGIN, "core/memory_cli.py"), "--plugin-data-dir", MEM0_DATA, "status", "--json"],
    { maxBuffer: 4e6 },
  );
  const s = JSON.parse(stdout);
  // Key resolution mirrors repo_api_key(): the repo's own project key wins, else the plugin key.
  let key = process.env.MEM0_API_KEY || "";
  for (const p of [join(process.env.HOME, ".config/mem0-keys", s.project_id), join(MEM0_DATA, "api-key")]) {
    if (key) break;
    try { key = readFileSync(p, "utf8").trim(); } catch {}
  }
  if (!key) throw new Error("mem0: no API key resolved");
  mem0Config = { appId: s.app_id, projectId: s.project_id, userId: s.user_id, key };
  return mem0Config;
}

async function mem0Post(path, payload, timeoutMs = 20000) {
  const { key } = await mem0Conf();
  const res = await fetch(`${MEM0_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`mem0 ${path} ${res.status}`);
  return res.json();
}

// The shipped scope filter, verbatim from memory_core._search_filters: the union of the shared
// lane (agent_id = project) and the personal lane (user_id), both narrowed to the repo's app_id.
async function mem0Filters() {
  const { appId, projectId, userId } = await mem0Conf();
  return {
    OR: [
      { AND: [{ agent_id: projectId }, { app_id: appId }] },
      { AND: [{ user_id: userId }, { app_id: appId }] },
    ],
  };
}

const mem0 = {
  id: "mem0",
  async corpus() {
    const { appId, projectId, userId } = await mem0Conf();
    const lanes = [
      { AND: [{ agent_id: projectId }, { app_id: appId }] },
      { AND: [{ user_id: userId }, { app_id: appId }] },
    ];
    const rows = [], seen = new Set();
    for (const filters of lanes) {
      for (let page = 1; page <= 20; page++) {
        const body = await mem0Post(`/v2/memories/?page=${page}&page_size=100`, { filters });
        const items = Array.isArray(body) ? body : body?.results;
        if (!Array.isArray(items) || !items.length) break;
        for (const it of items) {
          const id = String(it?.id ?? "");
          const text = String(it?.memory ?? it?.text ?? "").trim();
          if (!id || seen.has(id) || text.length < 60) continue;
          seen.add(id);
          rows.push({ id, text });
        }
        if (items.length < 100) break;
      }
    }
    return rows;
  },
  // Same call shape the shipped first-prompt hook makes (memory_core.search_memories).
  async search(query) {
    const { appId } = await mem0Conf();
    const body = await mem0Post("/v3/memories/search/", {
      query,
      app_id: appId,
      filters: await mem0Filters(),
      top_k: TOP_K,
      rerank: false,
      latest_only: true,
    });
    const items = Array.isArray(body) ? body : body?.results ?? [];
    return items.map((m) => String(m?.id ?? ""));
  },
};

const claudeMem = {
  id: "claude-mem",
  async corpus() {
    // Read-only sqlite via python3 (no node sqlite dependency in this repo).
    const script = `
import sqlite3, json, os
db = os.path.expanduser("~/.claude-mem/claude-mem.db")
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
rows = []
for oid, title, text in c.execute(
    "select id, coalesce(title,''), coalesce(text,'') from observations where project='yfx'"
):
    body = (title + ". " + text).strip()
    if len(body) >= 60:
        rows.append({"id": str(oid), "text": body[:1500]})
print(json.dumps(rows, ensure_ascii=False))
`;
    const { stdout } = await pexec("python3", ["-c", script], { maxBuffer: 6e7 });
    return JSON.parse(stdout);
  },
  async search(query) {
    const base = workerBase();
    const url =
      `${base}/api/search?query=${encodeURIComponent(query)}&limit=${TOP_K}&project=yfx`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`claude-mem search ${res.status}`);
    const body = await res.json();
    const text = String(body?.content?.[0]?.text ?? "");
    // Observation ids only: #S… are session summaries, #P… user prompts — neither is our gold.
    return [...new Set((text.match(/#\d+/g) ?? []).map((s) => s.slice(1)))];
  },
};

function workerBase() {
  let host = process.env.CLAUDE_MEM_WORKER_HOST || "";
  let port = process.env.CLAUDE_MEM_WORKER_PORT || "";
  if (!host || !port) {
    try {
      const s = JSON.parse(
        readFileSync(join(process.env.HOME, ".claude-mem", "settings.json"), "utf8"),
      );
      host ||= s.CLAUDE_MEM_WORKER_HOST || "127.0.0.1";
      port ||= s.CLAUDE_MEM_WORKER_PORT || "37777";
    } catch {
      host ||= "127.0.0.1";
      port ||= "37777";
    }
  }
  return `http://${host}:${port}`;
}

// ------------------------------------------------------------- query author
// Blind role: sees ONE memory's text. Never told which provider it came from, that a retrieval
// system exists, what the arms mean, or what the hypothesis is — so it cannot write queries
// that favour an arm.
const AUTHOR_PROMPT = (text) => `Below is one note from an engineering project's records.

Write the question a developer would ask that this note answers. Give it three ways, as JSON:

{"ru_bare": "...", "ru_anchored": "...", "en": "..."}

- "ru_bare": in Russian, using ONLY Cyrillic letters. No Latin letters at all — no file names,
  no code identifiers, no English words. Describe them in Russian words instead.
- "ru_anchored": in Russian, but keep any file names / code identifiers / config keys exactly as
  they appear in the note.
- "en": the same question in English.

Each question must be answerable by this note and must sound like something a developer would
actually type. Do not quote the note. Output only the JSON object.

NOTE:
${text}`;

const hasLatin = (s) => /[A-Za-z]/.test(s);

async function authorQueries(text) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await claude(
      attempt === 0
        ? AUTHOR_PROMPT(text)
        : AUTHOR_PROMPT(text) +
            "\n\nIMPORTANT: your previous ru_bare contained Latin letters. It must be pure Cyrillic.",
    );
    const obj = firstJson(raw);
    if (!obj) continue;
    const q = {
      ru_bare: String(obj.ru_bare ?? "").trim(),
      ru_anchored: String(obj.ru_anchored ?? "").trim(),
      en: String(obj.en ?? "").trim(),
    };
    if (!q.ru_bare || !q.ru_anchored || !q.en) continue;
    // ru_bare is the arm that tests the anchorless prompt; a Latin token in it would silently
    // turn it into ru_anchored. Retry once, then mark invalid rather than score a broken arm.
    if (hasLatin(q.ru_bare) && attempt === 0) continue;
    q.ru_bare_valid = !hasLatin(q.ru_bare);
    return q;
  }
  return null;
}

// ------------------------------------------------------------------- run
async function runProvider(provider) {
  const corpus = await provider.corpus();
  const rows = sample(corpus, N, SEED);
  console.log(`\n[${provider.id}] corpus ${corpus.length} -> sample ${rows.length}`);

  const out = [];
  for (const [i, row] of rows.entries()) {
    const q = await authorQueries(row.text);
    if (!q) {
      console.log(`  ${i + 1}/${rows.length} ${row.id}  AUTHOR-FAILED`);
      out.push({ provider: provider.id, gold: row.id, error: "author-failed" });
      continue;
    }
    const result = { provider: provider.id, gold: row.id, queries: q, arms: {} };
    for (const arm of ARMS) {
      if (arm === "ru_bare" && !q.ru_bare_valid) {
        result.arms[arm] = { skipped: "latin-in-ru_bare" };
        continue;
      }
      try {
        const ids = await provider.search(q[arm]);
        const rank = ids.indexOf(String(row.id));
        result.arms[arm] = { hit: rank !== -1, rank: rank === -1 ? null : rank + 1, n: ids.length };
      } catch (e) {
        result.arms[arm] = { error: String(e.message).slice(0, 120) };
      }
    }
    const mark = ARMS.map((a) => (result.arms[a]?.hit ? "+" : result.arms[a]?.skipped ? "~" : ".")).join("");
    console.log(`  ${i + 1}/${rows.length} ${row.id}  [${mark}]  ${q.ru_bare.slice(0, 60)}`);
    out.push(result);
  }
  return out;
}

function summarize(rows) {
  const byProvider = new Map();
  for (const r of rows) {
    if (r.error) continue;
    if (!byProvider.has(r.provider)) byProvider.set(r.provider, []);
    byProvider.get(r.provider).push(r);
  }
  const report = [];
  for (const [pid, rs] of byProvider) {
    const stat = {};
    // Rows scored in BOTH ru_bare and en — the decision rule reads R as a within-provider,
    // within-row ratio, so record what it was actually computed over.
    const usable = (r, arm) => r.arms[arm] && !r.arms[arm].skipped && !r.arms[arm].error;
    const pairedN = rs.filter((r) => usable(r, "ru_bare") && usable(r, "en")).length;
    for (const arm of ARMS) {
      const scored = rs.filter((r) => r.arms[arm] && !r.arms[arm].skipped && !r.arms[arm].error);
      const hits = scored.filter((r) => r.arms[arm].hit);
      const mrr = scored.reduce((s, r) => s + (r.arms[arm].hit ? 1 / r.arms[arm].rank : 0), 0);
      stat[arm] = {
        n: scored.length,
        recall: scored.length ? hits.length / scored.length : null,
        mrr: scored.length ? mrr / scored.length : null,
        skipped: rs.filter((r) => r.arms[arm]?.skipped).length,
        errors: rs.filter((r) => r.arms[arm]?.error).length,
      };
    }
    // `null / 0.79` is 0 in JS, so a fully-skipped or fully-errored ru_bare arm would report
    // ratio 0 — and check-cards.test.mjs would enforce "english_only" on the card from ZERO
    // data. That is the exact failure the card check exists to prevent, so guard both sides.
    const ratio =
      stat.ru_bare.recall === null || !stat.en.recall
        ? null
        : stat.ru_bare.recall / stat.en.recall;
    report.push({ provider: pid, ...stat, ratio, paired_n: pairedN });
  }
  return report;
}

async function main() {
  const all = [];
  for (const name of PROVIDERS) {
    const provider = name === "mem0" ? mem0 : name === "claude-mem" ? claudeMem : null;
    if (!provider) {
      console.log(`skipping unknown provider: ${name}`);
      continue;
    }
    all.push(...(await runProvider(provider)));
  }

  mkdirSync(join(ROOT, "out"), { recursive: true });
  writeFileSync(join(ROOT, "out", "memory-provider.jsonl"), all.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const report = summarize(all);

  // The raw rows are gitignored (reproducible by re-running); this summary is COMMITTED, because
  // `evals/check-cards.test.mjs` checks every provider card's claims against it. A card that
  // claims a capability no run measured fails the test — that is the point.
  writeFileSync(
    join(ROOT, "results-memory-provider.json"),
    JSON.stringify(
      { config: { N, SEED, TOP_K, model: MODEL, arms: ARMS, ran_at: new Date().toISOString() }, providers: report },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n=== recall@${TOP_K} (gold = the memory each query was authored from) ===\n`);
  console.log(["provider", ...ARMS, "R = ru_bare/en"].join("\t"));
  for (const r of report) {
    const cell = (a) =>
      r[a].recall === null ? "n/a" : `${r[a].recall.toFixed(2)} (${r[a].n}${r[a].skipped ? `, ${r[a].skipped} skip` : ""})`;
    console.log([r.provider, ...ARMS.map(cell), r.ratio === null ? "n/a" : r.ratio.toFixed(2)].join("\t"));
  }
  console.log(`\nDecision rule (PROTOCOL-memory-provider.md): mem0 R >= 0.60 -> harvest is`);
  console.log(`provider-specific. Both R <= 0.20 -> harvest is core. Between -> inconclusive.`);
  console.log(`\nrows -> evals/out/memory-provider.jsonl`);
}

export { mem0, claudeMem, sample, summarize };

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
