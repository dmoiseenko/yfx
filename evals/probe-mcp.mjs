#!/usr/bin/env node
// Stub MCP server for the card-pull eval: four plausible memory tools, only one of which the
// provider card declares.
//
// A single uniquely-named tool does NOT work: the model sees its tool list, so naming it proves
// nothing about having read the card. Decoys fix that. Every arm gets the same four tools; only
// the card says which is correct, so choosing it is evidence of compliance and choosing a decoy
// is evidence of guessing — with a 1-in-4 floor that the control arm measures directly.
//
// The arguments are logged too, so the card's `query_language` row becomes measurable: an agent
// following a card that says "bridges languages" should send the user's Russian through as-is.
//
// The tool names are exported and imported by the harness and the summarizer, so the set cannot
// drift between the server that exposes them and the scorer that tests for them — a drift would
// silently collapse `called_decoy` to zero and misfile calls as `called_nothing`.
//
// Every call is appended as JSON to $PROBE_LOG. Speaks newline-delimited JSON-RPC on stdio.

import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export const PROBE_TOOL = "recall_probe_a7f3";
// Decoys: the names an agent reaches for when it is guessing rather than reading.
export const DECOY_TOOLS = ["memory_search", "search_observations", "knowledge_lookup"];
const DESC = "Search this repository's persistent memory from earlier sessions.";

function main() {
  const tool = process.env.PROBE_TOOL || PROBE_TOOL;
  const log = process.env.PROBE_LOG || "/dev/null";
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
  const reply = (id, result) => send({ jsonrpc: "2.0", id, result });

  createInterface({ input: process.stdin }).on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const { id, method, params } = msg;
    if (method === "initialize") {
      return reply(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "probe", version: "1.0.0" },
      });
    }
    if (method === "tools/list") {
      // Identical descriptions and schemas: nothing but the card distinguishes them, so the
      // choice cannot leak through wording. Order is fixed rather than shuffled so every run
      // sees the same list — the decoy floor stays comparable across arms.
      const spec = (name) => ({
        name,
        description: DESC,
        inputSchema: {
          type: "object",
          properties: { query: { type: "string", description: "A direct question about earlier work." } },
          required: ["query"],
        },
      });
      return reply(id, { tools: [DECOY_TOOLS[0], tool, DECOY_TOOLS[1], DECOY_TOOLS[2]].map(spec) });
    }
    if (method === "tools/call") {
      const query = String(params?.arguments?.query ?? "");
      try { appendFileSync(log, JSON.stringify({ tool: params?.name, query, at: Date.now() }) + "\n"); } catch {}
      // A plausible memory, with NO id — the card declares citable_ids: false, so an agent that
      // cites "#21490" afterwards invented it.
      return reply(id, {
        content: [{
          type: "text",
          text: "The retry ceiling was raised from 3 to 5 after a batch of timeouts during the " +
                "September incident; the cache was kept time-based because event invalidation " +
                "needed a broker nobody wanted to run. Batch size settled at 64 by throughput test.",
        }],
      });
    }
    // Notifications carry no id and get no reply. Anything else is a method we do not implement:
    // answering it with `result: {}` fails the client's schema for methods like resources/list
    // (which requires an array), so a validating client can drop the server mid-run with no
    // attribution. -32601 is the correct answer and fails legibly.
    if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
