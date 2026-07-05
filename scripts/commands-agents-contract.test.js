"use strict";

// Static commands<->agents contract test (REQ-agents-007).
//
// For every commands/*.prompt.md file, verify that the sub-agent it routes to
// (per the "Routes to" column of the Section 3.2 Command Roster table in
// openspec/specs/agents/spec.md) is present in the `agents:` allowlist of the
// router agent declared in that command's `agent:` frontmatter field.
//
// Rows in the roster table with no `->` (routing only to sdd-orchestrator,
// with no phase-agent target) declare no sub-agent to verify and are skipped.
//
// This test is fully static: no LLM invocation, no sub-agent execution.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { parse, getField } = require("./lib/frontmatter.js");

const ROOT = path.resolve(__dirname, "..");
const AGENTS_SPEC_PATH = path.join(ROOT, "openspec", "specs", "agents", "spec.md");
const COMMANDS_DIR = path.join(ROOT, "commands");
const AGENTS_DIR = path.join(ROOT, "agents");

// Parse the "3.2 Command Roster" markdown table, returning a map from the
// command file's basename (e.g. "sdd-document.prompt.md") to a
// `{ target, hasArrow }` descriptor. `target` is the routing substring after
// the arrow (or null when the row declares no sub-agent target). `hasArrow`
// records whether an arrow (either Unicode "→" or ASCII "->") was found in
// the cell at all, independent of whether a target substring resulted —
// used as a sanity signal that the row-parsing regex itself is still
// matching real rows (rel-2 guard against silent no-op parsing).
function parseCommandRoster(specText) {
  const sectionMatch = specText.match(/### 3\.2 Command Roster\r?\n([\s\S]*?)(?:\r?\n---|\r?\n## )/);
  if (!sectionMatch) {
    throw new Error("Could not locate '### 3.2 Command Roster' section in agents spec");
  }

  const roster = new Map();
  const rowRegex = /\|\s*`(commands\/[^`]+\.prompt\.md)`\s*\|[^|]*\|\s*([^|]+)\|/g;
  let match;
  while ((match = rowRegex.exec(sectionMatch[1])) !== null) {
    const file = path.basename(match[1]);
    const routesToCell = match[2].trim();
    // Accept both Unicode "→" and ASCII "->" as valid arrow forms.
    const arrowMatch = routesToCell.match(/→|->/);
    const target = arrowMatch ? routesToCell.slice(arrowMatch.index + arrowMatch[0].length).trim() : null;
    roster.set(file, { target, hasArrow: Boolean(arrowMatch) });
  }

  return roster;
}

function readFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return parse(text).frontmatter;
}

test("commands<->agents contract: every routed sub-agent exists in its router's allowlist", () => {
  const specText = fs.readFileSync(AGENTS_SPEC_PATH, "utf8");
  const roster = parseCommandRoster(specText);
  assert.ok(roster.size > 0, "roster parse must find at least one command row");

  const commandFiles = fs
    .readdirSync(COMMANDS_DIR)
    .filter((name) => name.endsWith(".prompt.md"));
  assert.ok(commandFiles.length > 0, "commands/ must contain at least one *.prompt.md file");

  const checked = [];
  const missingFromRoster = [];
  let arrowRowCount = 0;

  for (const commandFile of commandFiles) {
    // rel-1 guard: a command file that has no matching roster row at all is
    // drift (a deleted or reformatted row), NOT a legitimate "no sub-agent
    // target" case — collect it as a hard failure instead of silently
    // skipping, so a deleted/reformatted roster row turns this test RED.
    if (!roster.has(commandFile)) {
      missingFromRoster.push(commandFile);
      continue;
    }

    const { target, hasArrow } = roster.get(commandFile);
    if (hasArrow) {
      arrowRowCount += 1;
    }

    if (!target) {
      // Row exists and was parsed, but declares no arrow: routes only to
      // sdd-orchestrator itself, with no sub-agent target to verify. This is
      // a legitimate skip, distinct from the missing-row case above.
      continue;
    }

    const commandPath = path.join(COMMANDS_DIR, commandFile);
    const commandFrontmatter = readFrontmatter(commandPath);
    const agentField = getField(commandFrontmatter, "agent");
    assert.ok(
      agentField && agentField.value,
      `${commandFile} must declare an 'agent:' frontmatter field`
    );
    const router = agentField.value;

    const routerAgentPath = path.join(AGENTS_DIR, `${router}.agent.md`);
    assert.ok(
      fs.existsSync(routerAgentPath),
      `router agent file agents/${router}.agent.md (declared by ${commandFile}) must exist`
    );
    const routerFrontmatter = readFrontmatter(routerAgentPath);
    const agentsField = getField(routerFrontmatter, "agents");
    const allowlist = Array.isArray(agentsField && agentsField.value) ? agentsField.value : [];

    assert.ok(
      allowlist.includes(target),
      `${commandFile} routes to '${target}' but agents/${router}.agent.md 'agents:' allowlist does not include it (allowlist: ${JSON.stringify(allowlist)})`
    );
    checked.push(commandFile);
  }

  assert.deepEqual(
    missingFromRoster,
    [],
    `these commands/*.prompt.md files have no matching row in the '3.2 Command Roster' table (rel-1 drift guard) — the roster row may have been deleted or reformatted: ${JSON.stringify(missingFromRoster)}`
  );

  assert.ok(
    arrowRowCount > 0,
    "rel-2 guard: at least one roster row must contain a routing arrow ('→' or '->'); zero arrow rows detected suggests the arrow-detection regex broke silently"
  );

  assert.ok(checked.length > 0, "at least one command must have a verifiable routing target");

  assert.ok(
    checked.includes("sdd-document.prompt.md"),
    "rel-1 guard: sdd-document.prompt.md must be present in checked[] — this is the exact command the contract test was written to protect, and its absence here means the roster row or allowlist check silently failed"
  );
});
