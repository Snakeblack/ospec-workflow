"use strict";

// Static commands<->agents contract test (REQ-agents-007).
//
// Adapted to call the extracted J1 checker (`scripts/lib/contract-checkers/
// j1-commands-agents.js`, REQ-contract-lint-003) instead of re-implementing
// the roster-parsing + allowlist-matching logic here. This test is fully
// static: no LLM invocation, no sub-agent execution.

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { check, checkDetailed } = require("./lib/contract-checkers/j1-commands-agents.js");

const ROOT = path.resolve(__dirname, "..");

test("commands<->agents contract: every routed sub-agent exists in its router's allowlist", () => {
  assert.deepEqual(check({ root: ROOT }), []);
});

test("commands<->agents contract: rel-1/rel-2 guards and the sdd-document anchor are preserved", () => {
  const { checked, missingFromRoster, arrowRowCount } = checkDetailed({ root: ROOT });

  // rel-1 guard: no command file may be missing from the '3.2 Command Roster' table.
  assert.deepEqual(
    missingFromRoster,
    [],
    `these commands/*.prompt.md files have no matching row in the '3.2 Command Roster' table (rel-1 drift guard) — the roster row may have been deleted or reformatted: ${JSON.stringify(missingFromRoster)}`
  );

  // rel-2 guard: at least one roster row must contain a routing arrow.
  assert.ok(
    arrowRowCount > 0,
    "rel-2 guard: at least one roster row must contain a routing arrow ('→' or '->'); zero arrow rows detected suggests the arrow-detection regex broke silently"
  );

  assert.ok(checked.length > 0, "at least one command must have a verifiable routing target");

  // Anchor: sdd-document.prompt.md is the exact command this contract test was
  // written to protect — its absence here means the roster row or allowlist
  // check silently failed.
  assert.ok(
    checked.includes("sdd-document.prompt.md"),
    "rel-1 guard: sdd-document.prompt.md must be present in checked[] — this is the exact command the contract test was written to protect, and its absence here means the roster row or allowlist check silently failed"
  );
});
