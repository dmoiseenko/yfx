// Does the pull model actually work? — provider-card compliance eval.
//
// The shipped design assumes an agent hitting an x-deficit will follow the link in /recall to
// skills/memory-provider.md, read the card, and act on it. Pull was chosen over injecting the
// card into every prompt because observation #15105 measured that standing prose suppresses
// skill invocation. That made compliance load-bearing and unmeasured — if agents skip the card
// they will guess a tool name, which is worse than the hardcoding the card layer removed.
//
// HOW COMPLIANCE IS MADE OBSERVABLE. "Read the card" is not an observable event. Naming a tool
// that cannot be guessed is. The probe card declares `tool: recall_probe_a7f3`; an agent that
// names it acted on the card, and one that reaches for `search` / `mem-search` /
// `search_memories` guessed. That distinction is the whole measurement.
//
// TWO GATES, measured separately — a first probe run showed they are not the same question:
//   gate 1 (trigger)    unforced prompt: does the agent reach for /recall at all?
//   gate 2 (compliance) forced prompt:   given /recall runs, does it act on the card?
// Gate 1 is the framework's known "trigger blindness" thread. Gate 2 is the pull question.
//
// ARMS
//   pull     card on disk, reachable only through the skill's link (as shipped, hook off)
//   nudge    pull + the x/y nudge prepended (as shipped WITH recall-context.mjs enabled). This
//            arm exists because gate 1 is exactly what the nudge hook is for, and the first run
//            measured pull with the hook off — which is not how the framework ships when the
//            loop is opted into. It doubles as the re-validation the nudge-only hook owes after
//            retrieval was stripped from it.
//   push     same card, its body also prepended to the prompt (simulates injecting the CARD)
//   control  no card at all — what the agent invents unaided, so the others have a baseline
//
// ISOLATION. Subprocesses run with CLAUDE_CONFIG_DIR pointed at a scratch dir (credentials
// symlinked, never copied) because the ambient global settings.json fires claude-mem and mem0
// hooks inside the eval: a first run had the claude-mem outage digest leak into the agent's
// answer, which both contaminates the control arm and tells the agent a provider exists.
// `--strict-mcp-config` strips MCP but NOT hooks, and `--settings '{"hooks":{}}'` does not
// override them (verified: hooks still fired). NOTE: evals/lib.mjs has the same leak.
//
//   node evals/card-pull.mjs                      # 4 arms x 2 gates x 5 prompts (n=5/cell)
//   ARMS=pull,control GATES=unforced node evals/card-pull.mjs   # a slice; writes no committed summary

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, cpSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { ROOT, REPO, MODEL } from "./lib.mjs";
import { PROBE_TOOL, DECOY_TOOLS } from "./probe-mcp.mjs";
import { XY_NUDGE } from "../hooks/recall-context.mjs";

const pexec = promisify(execFile);
const KNOWN_ARMS = ["pull", "nudge", "push", "control"];
const KNOWN_GATES = ["forced", "unforced"];
// A typo must not run silently: GATES=Forced would fail the `gate === "forced"` test, run the
// UNFORCED prompt, and stamp every row "Forced"; ARMS=nudg would skip the nudge branch but still
// get a card, i.e. a plain pull arm labelled "nudg". Either lands a plausible, wrong cell.
const pick = (env, fallback, known, label) => {
  const got = (env || fallback).split(",").map((s) => s.trim()).filter(Boolean);
  const bad = got.filter((g) => !known.includes(g));
  if (bad.length) {
    console.error(`unknown ${label}: ${bad.join(", ")}\nknown ${label}: ${known.join(", ")}`);
    process.exit(2);
  }
  return got;
};
const ARMS = pick(process.env.ARMS, KNOWN_ARMS.join(","), KNOWN_ARMS, "arms");
const GATES = pick(process.env.GATES, KNOWN_GATES.join(","), KNOWN_GATES, "gates");
// Keep this low. Each job is a full agent session AND its own MCP subprocess; at PARALLEL=4 a
// 40-job run failed 31 times, while the same arms at PARALLEL=1-2 passed cleanly. The failures
// were spread across every arm, which is what told us it was contention rather than a bug in one
// of them — and `e.message` alone (the command line) hid it, so errors now carry stderr.
const PARALLEL = Number(process.env.PARALLEL || 2);
const TIMEOUT = Number(process.env.CALL_TIMEOUT || 280000);

// Imported, never re-declared: if the scorer's list drifted from the server's, `called_decoy`
// would silently collapse to 0 and real calls would be misfiled as `called_nothing`.
const MCP = (name) => `mcp__probe__${name}`;

// x-deficit prompts: each references a past decision the code does not explain, so answering
// well REQUIRES memory. Russian, because that is the real usage and because the card's
// query_language row is what tells the agent not to translate first.
const PROMPTS = [
  "почему у нас MAX_RETRIES равен 5, а не 3 — мы это уже обсуждали раньше?",
  "мы же договаривались как-то обрабатывать таймауты в этом клиенте — напомни, к чему пришли",
  "почему кэш инвалидируется по времени, а не по событию? было какое-то обоснование",
  "какой порог мы в итоге выбрали для батча и почему именно такой",
  "мы отказывались от одного подхода к ретраям — от какого и по какой причине",
];

const CARD = `---
provider: probe
tool: ${PROBE_TOOL}
query_language: any
citable_ids: false
expansion: none
scope: [repo]
auto_injection: none
---

# Memory provider: probe

## Reaching it

Call the tool \`${PROBE_TOOL}\` with a direct question. It is the ONLY memory tool available in
this project; no other search tool exists.

## Query in the user's language

This provider bridges languages. Ask the question the way the user framed it — do not translate
it into English identifiers first.

## What comes back, and how to cite it

Full memory text, one shot. There is no second fetch and there are **no citable ids** — you
cannot write "per #21490". Quote the memory's own sentence instead.

## What is already in your context

Nothing. This provider injects nothing automatically, so any recall is your own move.
`;

// A small project where an x-deficit question is plausible: real identifiers, no rationale.
const FILES = {
  "src/retry.ts":
    "export const MAX_RETRIES = 5;\nexport const BACKOFF_MS = 250;\n\nexport async function withRetry<T>(fn: () => Promise<T>): Promise<T> {\n  for (let i = 0; i < MAX_RETRIES; i++) {\n    try { return await fn(); } catch (e) { if (i === MAX_RETRIES - 1) throw e; }\n  }\n  throw new Error(\"unreachable\");\n}\n",
  "src/cache.ts":
    "export const CACHE_TTL = 900;\nconst store = new Map<string, { at: number; value: unknown }>();\n\nexport function get(key: string) {\n  const hit = store.get(key);\n  if (!hit || Date.now() - hit.at > CACHE_TTL * 1000) return undefined;\n  return hit.value;\n}\n",
  "src/batch.ts":
    "export const BATCH_SIZE = 64;\nexport function chunk<T>(xs: T[]): T[][] {\n  const out: T[][] = [];\n  for (let i = 0; i < xs.length; i += BATCH_SIZE) out.push(xs.slice(i, i + BATCH_SIZE));\n  return out;\n}\n",
};

// One scratch config dir for the whole run: no settings.json means no ambient hooks, and the
// credentials are symlinked so the secret is never duplicated into /tmp.
function makeConfigDir() {
  const dir = mkdtempSync(join(tmpdir(), "cardpull-cfg-"));
  const creds = join(homedir(), ".claude", ".credentials.json");
  if (existsSync(creds)) symlinkSync(creds, join(dir, ".credentials.json"));
  return dir;
}

function makeProject(arm) {
  const dir = mkdtempSync(join(tmpdir(), `cardpull-${arm}-`));
  for (const [rel, body] of Object.entries(FILES)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  const skills = join(dir, ".claude", "skills");
  mkdirSync(skills, { recursive: true });
  // COPIED, not symlinked. POSIX resolves symlinks before "..", so a symlinked skill dir lets
  // `.claude/skills/recall/../memory-provider.md` land in the REAL repo — where the real mem0
  // card lives. That would shadow the probe card in the pull arm and hand the control arm a
  // provider it is supposed to have none of.
  for (const item of ["recall", "clarify", "fresh-lens", "2nd", "xy-diagnosis.md"]) {
    cpSync(join(REPO, "skills", item), join(skills, item), { recursive: true, dereference: true });
  }
  // control gets no card: the skill's link dangles, exactly as with no provider wired.
  if (arm !== "control") writeFileSync(join(skills, "memory-provider.md"), CARD);
  return dir;
}

async function run(arm, gate, prompt, cfg) {
  let dir, logDir, log;
  try {
    dir = makeProject(arm);
    // OUTSIDE the agent's cwd: a JSONL file recording the agent's own memory-tool calls, sitting
    // in a project meant to look ordinary, is exactly the kind of tell this harness treats as
    // contamination elsewhere.
    logDir = mkdtempSync(join(tmpdir(), "cardpull-log-"));
    log = join(logDir, "probe-calls.jsonl");
    let text = gate === "forced" ? `Use the /recall skill first, then answer: ${prompt}` : prompt;
    // The header is not decoration: a bare card starts with "---", which `claude -p` parses as a
    // flag and kills the run (it silently wiped the whole push arm once). A real injecting hook
    // would label its block anyway, the way recall-context.mjs labels its own.
    if (arm === "push") text = `[memory] active provider card:\n\n${CARD}\n\nThe request:\n\n${text}`;
    // Verbatim from the shipped hook, so this arm tests the real artifact rather than a paraphrase.
    if (arm === "nudge") text = `${XY_NUDGE}\n\n${text}`;

    const mcpConfig = JSON.stringify({
      mcpServers: {
        probe: {
          command: process.execPath,
          args: [join(ROOT, "probe-mcp.mjs")],
          env: { PROBE_TOOL, PROBE_LOG: log },
        },
      },
    });
    const { stdout } = await pexec(
      "claude",
      ["-p", text, "--model", MODEL, "--output-format", "stream-json", "--verbose",
       "--strict-mcp-config", "--mcp-config", mcpConfig,
       "--permission-mode", "bypassPermissions"],
      { cwd: dir, maxBuffer: 6e7, timeout: TIMEOUT,
        env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } },
    );
    const calls = existsSync(log)
      ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];
    return { ...score(stdout, calls), arm, gate, prompt, model: MODEL, at: new Date().toISOString() };
  } catch (e) {
    // Capture stderr, not just the command line: `e.message` is the whole invocation, which told
    // us nothing when 31 of 40 runs failed at once.
    const detail = [e.stderr, e.stdout, e.message].map((x) => String(x ?? "").trim()).find(Boolean) ?? "";
    return { arm, gate, prompt, error: detail.slice(-300), killed: e.killed === true, code: e.code };
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (logDir) rmSync(logDir, { recursive: true, force: true });
  }
}

function score(stdout, calls) {
  const toolUses = [];
  let result = "";
  let hooks = 0;
  for (const line of stdout.split("\n")) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type === "system" && o.hook_event) hooks++;
    if (o.type === "result") result = String(o.result ?? "");
    if (o.type === "assistant") {
      for (const b of o.message?.content ?? []) {
        if (b.type === "tool_use") toolUses.push({ name: b.name, input: JSON.stringify(b.input ?? {}) });
      }
    }
  }
  const memoryCalls = toolUses.filter((t) => t.name.startsWith("mcp__probe__"));
  const first = memoryCalls[0]?.name ?? null;
  // Match the logged call to the SCORED one by tool name instead of assuming the transcript and
  // the server log share an ordering: a tool_use block that never reaches the server (denied,
  // errored, cancelled), or two calls in one turn, would otherwise attribute `ru_query` to a
  // call this row did not score.
  const scoredCall = first ? calls.find((c) => MCP(String(c.tool)) === first) : null;
  const firstQuery = scoredCall?.query ?? "";
  return {
    // PRIMARY: an actual tool CALL, and the right one among identical-looking decoys. This is a
    // real invocation, not a prose mention — the two used to collapse into one number.
    called_declared_tool: first === MCP(PROBE_TOOL),
    called_decoy: first !== null && DECOY_TOOLS.some((d) => first === MCP(d)),
    called_nothing: first === null,
    // Card says query_language: any, so a compliant agent sends the user's Russian through.
    query_cyrillic: /[А-Яа-яЁё]/.test(firstQuery),
    query_sample: firstQuery.slice(0, 80),
    // Separate channel: named it in prose without calling it. Kept apart on purpose — quoting a
    // card is not acting on it.
    mentioned_only: !memoryCalls.length && result.includes(PROBE_TOOL),
    // The pull ACTION: went for the card file. In control the file does not exist, so this reads
    // as "followed the link and found nothing" — which separates "never looked" from "looked,
    // found nothing, then guessed".
    touched_card: toolUses.some((t) => t.input.includes("memory-provider.md")),
    skill_used: toolUses.some((t) => t.name === "Skill" && /recall|clarify/.test(t.input)),
    // Card says citable_ids: false and the stub returns no ids, so any #NNNNN is invented.
    fabricated_ids: /#\d{3,}/.test(result),
    hook_leak: hooks > 0, // must stay false: a leak invalidates the control arm
    tools: toolUses.length,
  };
}

async function pool(jobs, size) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < jobs.length) {
        const mine = i++;
        const r = await jobs[mine]();
        const m = r.error ? "ERR" : [r.called_declared_tool ? "P" : r.called_decoy ? "d" : "-", r.touched_card ? "R" : ".", r.skill_used ? "S" : ".", r.query_cyrillic ? "ru" : "en"].join("");
        console.log(`  [${m}] ${r.arm}/${r.gate}  ${r.prompt.slice(0, 48)}${r.error ? "  " + r.error : ""}`);
        out.push(r);
      }
    }),
  );
  return out;
}

const cfg = makeConfigDir();
const jobs = [];
for (const gate of GATES) for (const arm of ARMS) for (const prompt of PROMPTS) jobs.push(() => run(arm, gate, prompt, cfg));
console.log(`${jobs.length} runs — arms ${ARMS.join(",")} x gates ${GATES.join(",")} x ${PROMPTS.length} prompts\n`);
console.log("legend: P=called the DECLARED tool  d=called a decoy  -=called nothing  R=touched the card  S=invoked a skill  ru/en=query language\n");
let rows;
try {
  rows = await pool(jobs, PARALLEL);
} finally {
  // Always: this dir holds a symlink to the real credentials file.
  rmSync(cfg, { recursive: true, force: true });
}

mkdirSync(join(ROOT, "out"), { recursive: true });

// Every run keeps its own rows. The canonical `card-pull.jsonl` and the COMMITTED summary are
// only replaced by a run that covers the whole arm x gate matrix with at least one scored row.
// A partial or failed run used to overwrite both — which is how the 0.60 rows behind a published
// claim were destroyed before they could be committed, leaving the write-up unverifiable. A
// slice is a legitimate thing to run; silently replacing the artifact with it is not.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const stamped = join(ROOT, "out", `card-pull-${stamp}.jsonl`);
writeFileSync(stamped, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

const scored = rows.filter((r) => !r.error);
const full =
  KNOWN_ARMS.every((a) => ARMS.includes(a)) &&
  KNOWN_GATES.every((g) => GATES.includes(g)) &&
  KNOWN_ARMS.every((a) => KNOWN_GATES.every((g) => scored.some((r) => r.arm === a && r.gate === g)));

const summary = { config: { arms: ARMS, gates: GATES, prompts: PROMPTS.length, model: MODEL, probe_tool: PROBE_TOOL, decoys: DECOY_TOOLS, ran_at: new Date().toISOString() }, cells: [] };

const rate = (rs, k) => (rs.length ? rs.filter((r) => r[k]).length / rs.length : null);
console.log("\n=== compliance ===\n");
console.log(["gate", "arm", "n", "declared", "decoy", "none", "ru_query", "touched", "skill", "fab_ids"].join("\t"));
for (const gate of GATES) {
  for (const arm of ARMS) {
    const rs = rows.filter((r) => r.arm === arm && r.gate === gate && !r.error);
    if (!rs.length) continue;
    const f = (k) => { const v = rate(rs, k); return v === null ? "n/a" : v.toFixed(2); };
    console.log([gate, arm, rs.length, f("called_declared_tool"), f("called_decoy"), f("called_nothing"), f("query_cyrillic"), f("touched_card"), f("skill_used"), f("fabricated_ids")].join("\t"));
    summary.cells.push({
      gate, arm, n: rs.length,
      declared: rate(rs, "called_declared_tool"), decoy: rate(rs, "called_decoy"),
      none: rate(rs, "called_nothing"), ru_query: rate(rs, "query_cyrillic"),
      touched_card: rate(rs, "touched_card"), skill_used: rate(rs, "skill_used"),
      fabricated_ids: rate(rs, "fabricated_ids"),
    });
  }
}
const leaks = rows.filter((r) => r.hook_leak).length;
console.log(`\nhook leaks: ${leaks}${leaks ? "  ← ISOLATION BROKEN, results contaminated" : "  (isolation clean)"}`);
console.log(`errors: ${rows.filter((r) => r.error).length}`);
summary.hook_leaks = leaks;
summary.errors = rows.filter((r) => r.error).length;

if (full) {
  writeFileSync(join(ROOT, "out", "card-pull.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(ROOT, "results-card-pull.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(`rows -> evals/out/card-pull.jsonl  (also ${stamped.replace(ROOT + "/", "evals/")})`);
  console.log("summary -> evals/results-card-pull.json  (committed; RESULTS-card-pull.md cites it)");
} else {
  console.log(`rows -> ${stamped.replace(ROOT + "/", "evals/")}`);
  console.log("PARTIAL RUN — the committed summary and canonical rows were left untouched.");
  console.log("Run the full arm x gate matrix to replace them.");
}
