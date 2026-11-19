"use strict";

/**
 * Projects a phase's result envelope into its change's state.yaml through the
 * same PhaseCompletionReducer SubagentStop uses (REQ-lifecycle-kernel-031).
 * The orchestrator runs it after every phase, on every host: where
 * SubagentStop already projected the same envelope the replay hash makes it a
 * noop, and on a host without SubagentStop it is the only projection.
 *
 * Usage: node scripts/phase-completion-run.js <change-name> --phase <phase> --envelope-file <file> [--workspace <path>]
 *
 * `--phase` takes the phase key (`verify`) or its agent (`sdd-verify`). The
 * file holds the subagent's final message (its `json:result-envelope` fence or
 * legacy prose) or the bare envelope JSON. Prints one JSON line; exits 0 only
 * when the projection is ok (advanced, blocked or noop-replay).
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { projectPhaseCompletion } = require("./lib/ospec-state.js");
const { envelopeFromMessage, adaptLegacyEnvelope, validateEnvelope } = require("./lib/result-envelope.js");
const { UNRESOLVED, resolveCanonicalAgent, derivePhaseKey } = require("./lib/agent-identity.js");
const { isSafeChangeName } = require("./lib/archive-plan.js");
const { ignoreOspecDir } = require("./lib/ospec-gitignore.js");

const USAGE = "Usage: node scripts/phase-completion-run.js <change-name> --phase <phase> --envelope-file <file> [--workspace <path>]";

function parseArgs(argv) {
  const args = { change: null, phase: null, file: null, workspace: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--phase") args.phase = argv[++i] ?? null;
    else if (arg === "--envelope-file") args.file = argv[++i] ?? null;
    else if (arg === "--workspace") args.workspace = argv[++i] ?? null;
    else if (!arg.startsWith("-") && args.change === null) args.change = arg;
  }
  return args;
}

// An SDD phase agent only: a review agent never projects into phases.*.
function phaseAgentOf(phase) {
  if (typeof phase !== "string") return null;
  const named = resolveCanonicalAgent(phase);
  const agent = named === UNRESOLVED ? resolveCanonicalAgent(`sdd-${phase}`) : named;
  return agent.startsWith("sdd-") ? agent : null;
}

function envelopeFromFile(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (parsed.schema_version === undefined) {
        const adapted = adaptLegacyEnvelope(parsed);
        if (adapted.ok && adapted.envelope) return adapted.envelope;
      }
      return parsed;
    }
  } catch {
    // Not bare JSON: read it as the subagent's final message.
  }
  return envelopeFromMessage(text);
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const exit = deps.exit || ((code) => process.exit(code));
  const args = parseArgs(argv);
  const workspace = path.resolve(args.workspace || deps.workspace || process.cwd());

  if (!args.change || !args.phase || !args.file) {
    error(USAGE);
    exit(1);
    return;
  }
  if (!isSafeChangeName(args.change)) {
    error("invalid change-name: no .., absolutes, or separators");
    exit(1);
    return;
  }
  const agent = phaseAgentOf(args.phase);
  if (!agent) {
    error(`invalid phase: ${args.phase} is not an SDD phase`);
    exit(1);
    return;
  }

  const report = (result) => {
    log(JSON.stringify({ change: args.change, phase: derivePhaseKey(agent), ...result }));
    exit(result.ok ? 0 : 1);
  };

  const file = path.resolve(workspace, args.file);
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (readError) {
    report({ ok: false, outcome: "unreadable-envelope-file", error: readError.message });
    return;
  }
  // A message written under .ospec/ must not show up in the repository.
  ignoreOspecDir(path.dirname(file));

  const envelope = envelopeFromFile(text);
  if (!envelope) {
    report({ ok: false, outcome: "no-envelope" });
    return;
  }
  const validation = validateEnvelope(envelope, { phase: agent });
  if (!validation.valid) {
    report({ ok: false, outcome: "invalid-envelope", errors: validation.errors });
    return;
  }

  const projection = await projectPhaseCompletion({
    changePath: path.join(workspace, "openspec", "changes", args.change),
    phase: derivePhaseKey(agent),
    envelope,
  });
  const result = { ok: Boolean(projection.ok), outcome: projection.outcome };
  if (projection.code) result.code = projection.code;
  if (projection.error) result.error = projection.error;
  report(result);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
