"use strict";

// J1 checker: commands<->agents contract (REQ-agents-007 / REQ-contract-lint-003).
//
// Moved (not rewritten) from `scripts/commands-agents-contract.test.js`: for
// every commands/*.prompt.md file, verify that the sub-agent it routes to (per
// the "Routes to" column of the Section 3.2 Command Roster table in
// openspec/specs/agents/spec.md) is present in the `agents:` allowlist of the
// router agent declared in that command's `agent:` frontmatter field.
//
// Rows in the roster table with no `->` (routing only to sdd-orchestrator,
// with no phase-agent target) declare no sub-agent to verify and are skipped.
//
// This checker is fully static: no LLM invocation, no sub-agent execution. It
// returns offenders instead of calling `assert` directly, so both the unified
// registry (`contract-lint.js`) and the adapted legacy test
// (`scripts/commands-agents-contract.test.js`) can consume the same logic.

const fs = require("node:fs");
const path = require("node:path");

const { parse, getField } = require("../frontmatter.js");

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

/**
 * Runs the full J1 cross-check and returns both the offender list AND the
 * diagnostic detail (`checked[]`, `missingFromRoster[]`, `arrowRowCount`) a
 * caller can inspect — this is the secondary export `checkDetailed` that lets
 * the adapted legacy test keep its anchored assert ("sdd-document.prompt.md
 * was actually exercised") without re-deriving the roster/allowlist logic
 * itself.
 *
 * @param {{root: string}} ctx
 */
function checkDetailed(ctx) {
  const root = ctx.root;
  const agentsSpecPath = path.join(root, "openspec", "specs", "agents", "spec.md");
  const commandsDir = path.join(root, "commands");
  const agentsDir = path.join(root, "agents");

  const offenders = [];
  const checked = [];
  const missingFromRoster = [];
  let arrowRowCount = 0;

  let specText;
  try {
    specText = fs.readFileSync(agentsSpecPath, "utf8");
  } catch (err) {
    return {
      offenders: [
        {
          checker: "j1-commands-agents",
          path: path.relative(root, agentsSpecPath),
          expected: "openspec/specs/agents/spec.md to exist and be readable",
          actual: err.message,
          message: `${path.relative(root, agentsSpecPath)} could not be read: ${err.message}`,
        },
      ],
      checked,
      missingFromRoster,
      arrowRowCount,
    };
  }

  const roster = parseCommandRoster(specText);

  if (roster.size === 0) {
    offenders.push({
      checker: "j1-commands-agents",
      path: path.relative(root, agentsSpecPath),
      expected: "at least one parsed row in the '3.2 Command Roster' table",
      actual: "0 rows parsed",
      message: "roster parse must find at least one command row in '3.2 Command Roster'",
    });
  }

  const commandFiles = fs.existsSync(commandsDir)
    ? fs.readdirSync(commandsDir).filter((name) => name.endsWith(".prompt.md"))
    : [];

  if (commandFiles.length === 0) {
    offenders.push({
      checker: "j1-commands-agents",
      path: path.relative(root, commandsDir),
      expected: "at least one *.prompt.md file",
      actual: "0 files found",
      message: "commands/ must contain at least one *.prompt.md file",
    });
  }

  for (const commandFile of commandFiles) {
    // rel-1 guard: a command file that has no matching roster row at all is
    // drift (a deleted or reformatted row), NOT a legitimate "no sub-agent
    // target" case — report it as an offender instead of silently skipping,
    // so a deleted/reformatted roster row turns this checker red.
    if (!roster.has(commandFile)) {
      missingFromRoster.push(commandFile);
      offenders.push({
        checker: "j1-commands-agents",
        path: path.join("commands", commandFile),
        expected: "a matching row in the '3.2 Command Roster' table",
        actual: "no matching row found",
        message:
          `${commandFile} has no matching row in the '3.2 Command Roster' table (rel-1 drift ` +
          "guard) — the roster row may have been deleted or reformatted",
      });
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

    const commandPath = path.join(commandsDir, commandFile);
    const commandFrontmatter = readFrontmatter(commandPath);
    const agentField = getField(commandFrontmatter, "agent");

    if (!agentField || !agentField.value) {
      offenders.push({
        checker: "j1-commands-agents",
        path: path.join("commands", commandFile),
        expected: "an 'agent:' frontmatter field",
        actual: "field absent or empty",
        message: `${commandFile} must declare an 'agent:' frontmatter field`,
      });
      continue;
    }

    const router = agentField.value;
    const routerAgentPath = path.join(agentsDir, `${router}.agent.md`);

    if (!fs.existsSync(routerAgentPath)) {
      offenders.push({
        checker: "j1-commands-agents",
        path: path.join("agents", `${router}.agent.md`),
        expected: `router agent file agents/${router}.agent.md to exist (declared by ${commandFile})`,
        actual: "file does not exist",
        message: `router agent file agents/${router}.agent.md (declared by ${commandFile}) must exist`,
      });
      continue;
    }

    const routerFrontmatter = readFrontmatter(routerAgentPath);
    const agentsField = getField(routerFrontmatter, "agents");
    const allowlist = Array.isArray(agentsField && agentsField.value) ? agentsField.value : [];

    if (!allowlist.includes(target)) {
      offenders.push({
        checker: "j1-commands-agents",
        path: path.join("agents", `${router}.agent.md`),
        expected: `'agents:' allowlist to include '${target}' (routed to by ${commandFile})`,
        actual: `allowlist: ${JSON.stringify(allowlist)}`,
        message:
          `${commandFile} routes to '${target}' but agents/${router}.agent.md 'agents:' ` +
          `allowlist does not include it (allowlist: ${JSON.stringify(allowlist)})`,
      });
      continue;
    }

    checked.push(commandFile);
  }

  // rel-2 guard: at least one roster row must contain a routing arrow; zero
  // arrow rows detected suggests the arrow-detection regex broke silently.
  if (commandFiles.length > 0 && arrowRowCount === 0) {
    offenders.push({
      checker: "j1-commands-agents",
      path: path.relative(root, agentsSpecPath),
      expected: "at least one roster row containing a routing arrow ('→' or '->')",
      actual: "0 arrow rows detected",
      message:
        "rel-2 guard: at least one roster row must contain a routing arrow ('→' or '->'); zero " +
        "arrow rows detected suggests the arrow-detection regex broke silently",
    });
  }

  return { offenders, checked, missingFromRoster, arrowRowCount };
}

/**
 * @param {{root: string}} ctx
 * @returns {import("../contract-lint.js").Offender[]}
 */
function check(ctx) {
  return checkDetailed(ctx).offenders;
}

module.exports = { check, checkDetailed, parseCommandRoster };
