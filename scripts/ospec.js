#!/usr/bin/env node
"use strict";

// `ospec` CLI core for IDD changes (openspec/specs/idd/spec.md, REQ-idd-011):
// status, next and record over idd/<change-id>/state.yaml, plus signals, which
// derives impact signals from the declaration and the diff (REQ-idd-012), and
// check and run, which execute the declared checks and test commands and
// record what they observed (REQ-idd-014), the fitness checks of the ADRs and
// quality scenarios the change touches included (REQ-idd-022). `record` never
// takes obligation evidence: the CLI records it only from executions it
// observes (REQ-idd-007). `doctor`
// diagnoses the installation and the project without writing (REQ-idd-019);
// `--repair` moves an unreadable IDD state aside so its change resumes.
// `team` resolves the team profile of the active mode, the defaults it
// decides and the delivery options, with their reasons (REQ-idd-023). `close`
// writes the changelog entry and proposes the release they declare
// (REQ-idd-025). `snapshot` exports the progress snapshot of the project on
// demand; no IDD or SDD step runs it (REQ-idd-026).
//
// Exit codes: 0 ok, 1 refused by the IDD contract (or doctor found an error),
// 2 usage error.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { parseArgs } = require("node:util");

const {
  COUNTERPROOF,
  RUN_OBLIGATIONS,
  ceremonyConfig,
  checkVerdict,
  counterproofWarnings,
  deferImpacts,
  pairRed,
  priorControl,
  priorCounterproof,
  recordRuns,
  settleBoundary,
  settleChecks,
  settleChecksChange,
  settleContract,
  settleImpacts,
  settleMigration,
  settlePair,
  settleTreeBound,
} = require("./lib/idd-check.js");
const { classifyContractPaths } = require("./lib/idd-contracts.js");
const { addEntry, changelogEntry, proposeRelease } = require("./lib/idd-changelog.js");
const { archiveChange, closeChange, knowledgeRecords, livingDocStatus, renderEvidence, requireResumable, staleEvidence } = require("./lib/idd-close.js");
const { CONFIG_FILE, IddConfigError, parseIddConfig } = require("./lib/idd-config.js");
const { ARCHIVE_ROOT, DECISIONS_ROOT, LIVING_DOC_FILE, STATE_FILE, counterproofDetects, isIntentAmbiguous } = require("./lib/idd-contract.js");
const { TIMED_OUT_EXIT, runCommand } = require("./lib/idd-exec.js");
const { CATEGORY_IDS, UI_CATEGORY_IDS, countTests, projectCategories, resolveFeatureCoverage } = require("./lib/idd-facts.js");
const { fitnessPlan } = require("./lib/idd-fitness.js");
const { memoryQuery, resolveReferences, touchedComponents } = require("./lib/idd-knowledge.js");
const { CHECKS_REQUIRED, FOUNDATION_STEPS, nextForChange, nextForProject, statusOf } = require("./lib/idd-next.js");
const { refusalHow } = require("./lib/idd-refusals.js");
const {
  IddRecordError,
  recordAssumption,
  recordAttestation,
  recordGate,
  recordImpact,
  recordIntent,
  recordRetract,
  recordSignal,
  recordWithdraw,
  reopenDerived,
} = require("./lib/idd-record.js");
const {
  buildCandidate,
  candidateDiffHash,
  correctTrustReview,
  currentReview,
  recordTrustFindings,
  settleReviewFreshness,
  startTrustReview,
  validateTrustCorrection,
} = require("./lib/idd-review.js");
const { IddImpactError, matchImpact } = require("./lib/idd-impact.js");
const { readReceipt } = require("./lib/review-receipt.js");
const { DEFAULT_ROADMAP, SnapshotError, buildSnapshot } = require("./lib/progress-snapshot.js");
const { DEFAULT_PROGRESS, buildSnapshotV2 } = require("./lib/progress-snapshot-v2.js");
const { buildSnapshotV3 } = require("./lib/progress-snapshot-v3.js");
const { buildSnapshotV4 } = require("./lib/progress-snapshot-v4.js");
const { DecisionGapError, nextRound, recordAnswer } = require("./lib/decision-gap.js");
const { DoctorUsageError, renderDoctor, runDoctor } = require("./lib/ospec-doctor.js");
const { addedTests, applyDerivation, classifyPath, deriveSignals, inlineTests, persistentHits, requireDeclaredCeremony } = require("./lib/idd-signals.js");
const { CHANGELOG_NONE, TeamProfileError, resolveTeam } = require("./lib/team-profile.js");
const { writeFileAtomic } = require("./lib/atomic-write.js");
const { IddStoreError, changeDir, listChanges, mutateChange, readChange, serializeState } = require("./lib/idd-store.js");
const { withFileLock } = require("./lib/ospec-state.js");
const {
  EMPTY_TREE,
  IddWorkspaceError,
  commitTree,
  counterproofMount,
  counterproofPaths,
  mountCounterproof,
  readArchitecture,
  readBaseConfig,
  readCheckTreeFingerprint,
  readDecisionRecords,
  readFitnessSources,
  readGitDiff,
  readHead,
  readKnowledgeSources,
  readProjectContext,
  readProjectFiles,
  readTreeFingerprint,
  requireWorkTree,
  snapshotTree,
  treeBlobs,
  treeLineCounter,
  treeNumstat,
} = require("./lib/idd-workspace.js");

const USAGE = `Usage:
  ospec status [--change <id>] [--json]
  ospec next [--change <id>] [--json]
  ospec record intent --change <id> --kind <bug|feature|refactor|docs> --summary <text> --acceptance <text>
                      ((--open-fact <question>)... | --no-open-facts --basis <text>)
                      [--request <text>] [--answer <text> --source user|user-unverified] [<plan>]
  ospec record intent --change <id> --kind feature --summary <text> --acceptance <text> --request <text>
                      (--open-fact <category>:<question> | --cite <category>=<path:line> | --quote <category>=<fragment>)...
                      categories: ${CATEGORY_IDS.join(", ")}; at least one is an --open-fact;
                      ${UI_CATEGORY_IDS.join(" and ")} only with a UI file or no code (ospec next prints the template)
                      [<plan>]: [--path <file>]... [--work-units <n>] [--decision <text>]... [--operation <op>]...
                                [--adr <id>]... [--quality <id>]..., declared as ospec signals does
  ospec record intent --change <id> --ambiguous --request <text>
  ospec record assumption --change <id> --text <text>
  ospec record signal --change <id> --signal <id> --reason <text> [--source declaration|diff]
  ospec record gate --change <id> --gate <id> (--open [--reason <text>] | --resolve --answer <text> --source user|user-unverified)
  ospec record withdraw --change <id> --obligation <id> --reason <text>
  ospec record retract --change <id> --signal <id> --reason <text> [--answer <text> --source user|user-unverified]
  ospec record impact --change <id> (--adr <id> | --quality <id>)
                      [--impact <none|conforms|amends|supersedes|contradicts> --reason <text>] [--record <new ADR>]
  ospec record fitness --change <id> (--adr <id> | --quality <id>) --evidence <text>
  ospec signals --change <id> [--path <file>]... [--work-units <n>] [--decision <text>]...
                [--operation <op>]... [--adr <id>]... [--quality <id>]... [--diff] [--base <ref>]
  ospec check --change <id> [--base <ref>] [--close]
  ospec run --change <id> --obligation <repro-test|tdd-red-green|migration-compat-and-test> --command <cmd>
            [--unit <name>] [--plan <compatibility or rollback plan>]
            a --command equal to the only declared check also counts as that check
  ospec review start|correct --change <id> [--base <ref>]
  ospec review record|validate --change <id> --result <json>|@<file>
  ospec close --change <id>
  ospec doctor [--target <host>] [--repair] [--json]
  ospec team [--mode <idd|sdd>] [--json]
  ospec snapshot [--schema-version <1|2|3|4>] [--roadmap <path>] [--progress <path>] [--out <file>] [--json]
  ospec foundation next [--profile <id>] [--map <path>] [--json]
  ospec foundation record --slot <id> --state <confirmed|assumed|n/a|deferred>
                          [--source-kind <user|document|repository>] [--source-ref <text>]
                          [--review-trigger <text>] [--reason <text>] [--owner <text>]
                          [--map <path>] [--json]

Options:
  --root <dir>  project root (default: current directory)
  --json        machine-readable output
  --diff        signals: also read the git diff against --base
  --base <ref>  diff base (default: the commit the change started from, else HEAD)
  --close       check: close the change in the same call when the verdict is ready
  --schema-version <1|2|3|4>
                snapshot: the version to emit (default: 1); the v3 reads the changelog
                that delivery.changelog declares in idd/config.yaml, and the v4 also
                the ADRs of docs/architecture/decisions/
  --roadmap     snapshot: the roadmap to read (default: ${DEFAULT_ROADMAP})
  --progress    snapshot v2, v3 and v4: the progress file to read (default: ${DEFAULT_PROGRESS}, when it exists)
  --out <file>  snapshot: write the snapshot to this file instead of stdout
`;

// E1.45 (B5): a usage error prints the entries of its subcommand, each with
// its continuation lines, not the whole usage; an unknown command, the list
// of commands.
const USAGE_ENTRIES = USAGE.split("\nOptions:")[0]
  .split("\n")
  .slice(1)
  .filter((line) => line.trim() !== "")
  .reduce((entries, line) => {
    const words = /^ {2}ospec (\S+)(?: ([a-z|]+)(?= |$))?/.exec(line);
    if (words) entries.push({ command: words[1], sub: words[2] ? words[2].split("|") : [], lines: [line] });
    else entries.at(-1).lines.push(line);
    return entries;
  }, []);
const COMMANDS = [...new Set(USAGE_ENTRIES.map((entry) => entry.command))];

function usageFor([command, sub] = []) {
  const entries = USAGE_ENTRIES.filter((entry) => entry.command === command);
  if (entries.length === 0) return `commands: ${COMMANDS.join(", ")}`;
  const exact = entries.filter((entry) => entry.sub.includes(sub));
  return (exact.length > 0 ? exact : entries).flatMap((entry) => entry.lines).join("\n");
}

const OPTIONS = {
  change: { type: "string" },
  kind: { type: "string" },
  summary: { type: "string" },
  acceptance: { type: "string" },
  request: { type: "string" },
  ambiguous: { type: "boolean" },
  "open-fact": { type: "string", multiple: true },
  "no-open-facts": { type: "boolean" },
  basis: { type: "string" },
  cite: { type: "string", multiple: true },
  quote: { type: "string", multiple: true },
  text: { type: "string" },
  answer: { type: "string" },
  source: { type: "string" },
  signal: { type: "string" },
  reason: { type: "string" },
  gate: { type: "string" },
  open: { type: "boolean" },
  resolve: { type: "boolean" },
  obligation: { type: "string" },
  path: { type: "string", multiple: true },
  "work-units": { type: "string" },
  decision: { type: "string", multiple: true },
  operation: { type: "string", multiple: true },
  adr: { type: "string", multiple: true },
  quality: { type: "string", multiple: true },
  impact: { type: "string" },
  record: { type: "string" },
  evidence: { type: "string" },
  diff: { type: "boolean" },
  base: { type: "string" },
  close: { type: "boolean" },
  command: { type: "string" },
  unit: { type: "string" },
  plan: { type: "string" },
  result: { type: "string" },
  root: { type: "string" },
  target: { type: "string" },
  repair: { type: "boolean" },
  mode: { type: "string" },
  profile: { type: "string" },
  map: { type: "string" },
  slot: { type: "string" },
  state: { type: "string" },
  "source-kind": { type: "string" },
  "source-ref": { type: "string" },
  "review-trigger": { type: "string" },
  owner: { type: "string" },
  roadmap: { type: "string" },
  "schema-version": { type: "string" },
  progress: { type: "string" },
  out: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.code = "usage";
  }
}

function reducerFor(type, values, root) {
  switch (type) {
    case "intent": {
      if (values.kind !== "feature" && (values.cite?.length || values.quote?.length)) {
        throw new UsageError("--cite and --quote cover the categories of a feature");
      }
      const feature = values.kind === "feature";
      // The plan rides on the intent (E4.15): one write records both, or
      // neither when the intent is refused.
      const plan = declaresPlan(values) || declaredReferences(values).length > 0 ? planContext(root, values) : null;
      if (plan && values.ambiguous) throw new UsageError("an ambiguous intent declares no plan: declare it with the record intent that resolves it");
      return (state) => {
        const recorded = recordIntent(state, {
          base: state ? undefined : readHead(root),
          change: values.change,
          kind: values.kind,
          summary: values.summary,
          acceptance: values.acceptance,
          request: values.request,
          ambiguous: values.ambiguous === true,
          openFacts: feature ? undefined : values["open-fact"],
          noOpenFacts: feature ? undefined : values["no-open-facts"],
          basis: feature ? undefined : values.basis,
          coverage: feature ? featureCoverage(root, values) : undefined,
          answer: values.answer,
          source: values.source,
        });
        if (!plan) return recorded;
        const declared = declarePlan(recorded.state, plan);
        return { ...declared, changed: recorded.changed || declared.changed };
      };
    }
    case "assumption":
      if (!values.text) throw new UsageError("record assumption needs --text <text>");
      return existing((state) => recordAssumption(state, { text: values.text }));
    case "signal":
      return existing((state) =>
        recordSignal(state, { id: values.signal, reason: values.reason, source: values.source || "declaration" }),
      );
    case "gate": {
      if (values.open === values.resolve) throw new UsageError("record gate needs exactly one of --open or --resolve");
      const action = values.open ? "open" : "resolve";
      return existing((state) =>
        recordGate(state, { id: values.gate, action, reason: values.reason, answer: values.answer, source: values.source }),
      );
    }
    case "withdraw":
      return existing((state) => recordWithdraw(state, { obligation: values.obligation, reason: values.reason }));
    case "retract":
      if (!values.signal) throw new UsageError("record retract needs --signal <id>");
      return existing((state) =>
        recordRetract(state, { id: values.signal, reason: values.reason, answer: values.answer, source: values.source, ...diffConfirmation(root, state, values.signal) }),
      );
    case "impact": {
      const refs = declaredReferences(values);
      if (refs.length !== 1) throw new UsageError("record impact needs exactly one --adr <id> or --quality <id>");
      if (values.impact === undefined && values.record === undefined) throw new UsageError("record impact needs --impact <value>, or --record to attach the new ADR");
      return existing((state) => recordImpact(state, { ...refs[0], impact: values.impact, reason: values.reason, record: values.record }));
    }
    case "fitness": {
      const refs = declaredReferences(values);
      if (refs.length !== 1) throw new UsageError("record fitness needs exactly one --adr <id> or --quality <id>");
      if (values.evidence === undefined) throw new UsageError("record fitness needs --evidence <text>");
      return existing((state) => {
        const { manual } = changeFitness(root, state);
        const isManual = manual.some((item) => item.kind === refs[0].kind && item.id === refs[0].id);
        return recordAttestation(state, { ...refs[0], evidence: values.evidence, recordedAt: new Date().toISOString(), manual: isManual });
      });
    }
    default:
      throw new UsageError(`unknown record type: ${type ?? "(none)"}; expected intent, assumption, signal, gate, withdraw, retract, impact or fitness`);
  }
}

// An ADR is named by its four-digit id, with or without the ADR- prefix
// (E3.1); a quality scenario by its id in the knowledge map.
function adrId(raw) {
  const id = String(raw).trim().replace(/^adr-?/i, "");
  if (!/^[0-9]{4}$/.test(id)) throw new UsageError(`--adr takes a four-digit ADR id such as 0004, got ${JSON.stringify(raw)}`);
  return id;
}

function declaredReferences(values) {
  return [
    ...(values.adr || []).map((id) => ({ kind: "adr", id: adrId(id) })),
    ...(values.quality || []).map((id) => ({ kind: "scenario", id: String(id).trim() })),
  ];
}

// Every declared reference must exist on disk: an ADR under
// docs/architecture/decisions/, a scenario in the knowledge map.
function requireKnownReferences(root, refs) {
  if (refs.length === 0) return;
  const { adrs, scenarios } = readArchitecture(root);
  for (const ref of refs) {
    if (ref.kind === "adr" && !adrs.has(ref.id)) {
      throw new IddRecordError("unknown-reference", `ADR ${ref.id} is not under ${DECISIONS_ROOT}/`);
    }
    if (ref.kind === "scenario" && !scenarios.has(ref.id)) {
      throw new IddRecordError("unknown-reference", `quality scenario ${ref.id} is not in the knowledge map`);
    }
  }
}

// The reason the current diff derives a signal, or null (E1.11), and whether
// only the content of the diff derives persistent-data, which the user may
// retract with the hits they saw (#416). Only the diff confirms a declared
// signal, so a retraction reads it against the change's base and needs git, as
// `ospec check` does.
function diffConfirmation(root, state, signalId) {
  if (state.status !== "open" || !state.signals.some((signal) => signal.id === signalId)) return { confirmedBy: null, contentOnly: false, hits: [] };
  const context = readProjectContext(root);
  const diff = readGitDiff(root, { base: diffBase({}, state) });
  const { map, sources } = readKnowledgeSources(root);
  const { signals: derived } = deriveSignals({ intent: state.intent, diff, patterns: context.patterns, knowledge: { map, sources }, retracted: state.retracted });
  const confirmedBy = derived.find((signal) => signal.id === signalId && signal.source === "diff")?.reason ?? null;
  const byPath = diff.paths.some((file) => matchImpact(file, context.patterns).some((hit) => hit.signal === signalId));
  const contentOnly = signalId === "persistent-data" && confirmedBy !== null && !byPath;
  return { confirmedBy, contentOnly, hits: contentOnly ? persistentHits(diff, context.patterns).map((hit) => hit.key) : [] };
}

function existing(reducer) {
  return (state) => {
    if (!state) throw new IddRecordError("unknown-change", "no such change; open it with record intent first");
    return reducer(state);
  };
}

function parseWorkUnits(raw) {
  if (raw === undefined) return 1;
  if (!/^[1-9]\d*$/.test(raw)) throw new UsageError(`--work-units must be a positive integer, got ${JSON.stringify(raw)}`);
  return Number(raw);
}

// A call that names paths, work units, a decision or an operation declares the
// plan; one that only reads the diff does not (E1.11).
function declaresPlan(values) {
  return Boolean(values.path?.length || values["work-units"] !== undefined || values.decision?.length || values.operation?.length);
}

// What a declaration of the plan reads before the state lock: the declared
// plan and references, which must exist, the project's patterns and its
// knowledge. `signals` and `record intent` take the same flags (E4.15).
function planContext(root, values) {
  const refs = declaredReferences(values);
  // Each --decision carries its text, which the CLI writes to the Decisions
  // of change.md (E4.16).
  const decisions = (values.decision || []).map((text) => text.trim());
  if (decisions.includes("")) throw new UsageError('--decision needs the text of the decision: --decision "<text>"');
  const declaration = {
    paths: values.path || [],
    workUnits: parseWorkUnits(values["work-units"]),
    nonObviousDecision: decisions.length > 0,
    decisions,
    operations: values.operation || [],
    adrs: refs.filter((ref) => ref.kind === "adr").map((ref) => ref.id),
    scenarios: refs.filter((ref) => ref.kind === "scenario").map((ref) => ref.id),
  };
  requireKnownReferences(root, refs);
  const { map, sources, warnings } = readKnowledgeSources(root);
  return { declaration, plan: declaresPlan(values), diff: {}, context: readProjectContext(root), knowledge: { map, sources }, warnings };
}

// Derives the signals of the declaration and the diff on `current` and records
// them, with the plan when the call declares one.
function declarePlan(current, { declaration, plan, diff, context, knowledge }) {
  const intent = current.intent && current.intent.kind ? current.intent : null;
  const derivation = deriveSignals({ intent, strictTdd: context.strictTdd, declaration, diff, patterns: context.patterns, knowledge, retracted: current.retracted });
  return { ...applyDerivation(current, derivation, { plan: plan ? declaration : null }), derivation };
}

// The signals a declaration derived, as `signals` reports them.
function derivationView({ added, derivation: { signals: derived, gates, floor } }) {
  return { added, signals: derived, gates, floor };
}

async function signals(root, values) {
  if (!values.change) throw new UsageError("signals needs --change <id>");
  const plan = planContext(root, values);
  if (values.diff || values.base) plan.diff = readGitDiff(root, { base: diffBase(values, await readChange(root, values.change)) });
  const declared = await mutateChange(root, values.change, existing((current) => declarePlan(current, plan)));
  const result = { change: declared.state.change, changed: declared.changed, ...derivationView(declared), next: nextAfterWrite(root, declared.state) };
  if (plan.warnings.length) result.warnings = plan.warnings;
  return result;
}

// The change's own base keeps its committed work in the diff (REQ-idd-014).
// A change opened before the first commit (base null) diffs against the empty
// tree, so commits made during the change stay in its diff.
function diffBase(values, state) {
  if (values.base) return values.base;
  if (state?.base === null) return EMPTY_TREE;
  return state?.base || "HEAD";
}

async function openChange(root, changeId) {
  const state = await readChange(root, changeId);
  if (!state) throw new IddRecordError("unknown-change", "no such change; open it with record intent first");
  if (state.status === "closed") throw new IddRecordError("change-closed", `change ${changeId} is closed`);
  return state;
}

function changedFrom(stored, state) {
  return JSON.stringify(stored) !== JSON.stringify(state);
}

// The fitness functions of a change (E3.3, REQ-idd-022): those of the
// references in its impacts, read from its base, while adr-impact-declaration
// is active. `checks` run in ospec check; `manual` items never block.
function changeFitness(root, state) {
  const active = state.obligations.some((entry) => entry.id === "adr-impact-declaration" && entry.status !== "withdrawn");
  if (!active || (state.impacts || []).length === 0) return { checks: [], manual: [], warnings: [] };
  const { sources, warnings } = readFitnessSources(root, diffBase({}, state));
  return { ...fitnessPlan(state, sources), warnings };
}

function fitnessView({ checks, manual }, runs = null) {
  if (checks.length === 0 && manual.length === 0) return null;
  return {
    checks: checks.map(({ kind, id, path: file, command }, index) => {
      const entry = { kind, id, path: file, command };
      if (runs) Object.assign(entry, { exit_code: runs[index].exit_code, output_tail: runs[index].output_tail });
      return entry;
    }),
    manual,
  };
}

function readCiteFile(root, file) {
  const full = path.resolve(root, file);
  const relative = path.relative(root, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  try {
    return fs.readFileSync(full, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return null;
    throw error;
  }
}

// The file a cite reaches, relative to the root with symlinks resolved (B6),
// or null when it is missing or outside the project.
function citeTarget(root, file) {
  let relative;
  try {
    relative = path.relative(fs.realpathSync(root), fs.realpathSync(path.resolve(root, file)));
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

// The categories of the project's profile (E4.16): its files and the plan of
// the intent decide whether url-state and accessibility apply.
function featureCoverage(root, values) {
  const { categories } = projectCategories({ files: readProjectFiles(root), planPaths: values.path || [], classify: classifyPath });
  const resolved = resolveFeatureCoverage({
    categories,
    openFacts: values["open-fact"] || [],
    cites: values.cite || [],
    quotes: values.quote || [],
    request: values.request,
    readFile: (file) => readCiteFile(root, file),
    classify: classifyPath,
    canonical: (file) => citeTarget(root, file),
  });
  if (resolved.error) {
    const error = new IddRecordError(resolved.error.code, resolved.error.message);
    error.how = resolved.error.how;
    throw error;
  }
  return resolved.coverage;
}

function runRecord(purpose, command, result, tree, recordedAt, extra = {}) {
  const record = { purpose, ...extra, command, exit_code: result.exit_code, output_sha256: result.output_sha256, tree, recorded_at: recordedAt };
  const tests = countTests(result.output_tail);
  if (tests != null) record.tests = tests;
  return record;
}

// --- counterproof (E1.48) ------------------------------------------------------

const COUNTERPROOF_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Runs `commands` in order on a worktree of the change's base with the tests
 * of the diff on top, until one fails where its control, the same command on
 * a worktree of the base alone, passed or failed another way (E1.48). A
 * command already counterproved on the same base and mount, or controlled on
 * the same base, reuses that run. It runs outside the state lock; without a
 * base, when the diff adds code to a Rust inline test, or when the base cannot
 * be mounted, it is skipped with the reason.
 */
function runCounterproof(root, state, { diff, commands }) {
  if (!state.base) return { skipped: "the change has no base commit to run it on" };
  const inline = inlineTests(diff);
  if (inline.length > 0) return { skipped: `the inline tests of ${inline.join(", ")} share the file with the product, so the base cannot run them without the change` };
  const paths = counterproofPaths(diff);
  const mount = counterproofMount(root, paths);
  const controlMount = counterproofMount(root, []);
  const results = [];
  const mounted = {};
  const on = (key, files) => (mounted[key] ??= mountCounterproof(root, { base: state.base, paths: files }));
  const execute = (where, command) => runCommand(command, { cwd: where.cwd, timeoutMs: COUNTERPROOF_TIMEOUT_MS, mask: where.mask });
  const reused = (prior) => ({
    id: prior.id,
    reused: true,
    command: prior.command,
    exit_code: prior.exit_code,
    output_sha256: prior.output_sha256,
    ...(prior.control ? { control: true } : {}),
    ...(prior.timed_out ? { timed_out: true } : {}),
  });
  try {
    for (const { command, name } of commands) {
      const prior = priorCounterproof(state.runs, { base: state.base, mount, command });
      const result = prior ? reused(prior) : { command, ...(name ? { name } : {}), ...execute(on("tests", paths), command) };
      results.push(result);
      if (result.exit_code === 0) continue;
      const priorControlled = priorControl(state.runs, { base: state.base, command });
      const control = priorControlled ? reused(priorControlled) : { command, ...(name ? { name } : {}), control: true, ...execute(on("base", []), command) };
      results.push(control);
      if (counterproofDetects(result, control)) break;
    }
  } catch (error) {
    if (error instanceof IddWorkspaceError) return { skipped: error.message };
    throw error;
  } finally {
    for (const where of Object.values(mounted)) where.remove();
  }
  return { base: state.base, mount, controlMount, results };
}

/**
 * Records the new runs of a counterproof for `obligation` and returns the
 * proof the settle reducers read: the runs that make it up, or why it was
 * skipped. The outcome it returns carries the id of every run, so the same
 * counterproof can prove another obligation of the same call.
 */
function recordCounterproof(state, outcome, { obligation, tree, recordedAt }) {
  if (outcome.skipped) return { state, proof: { skipped: outcome.skipped }, outcome };
  const fresh = outcome.results.filter((result) => !result.id);
  const extra = (result) => ({
    obligation,
    ...(result.name ? { name: result.name } : {}),
    base: outcome.base,
    mount: result.control ? outcome.controlMount : outcome.mount,
    ...(result.control ? { control: true } : {}),
    ...(result.timed_out ? { timed_out: true } : {}),
  });
  const recorded = recordRuns(state, fresh.map((result) => runRecord(COUNTERPROOF, result.command, result, tree, recordedAt, extra(result))));
  const ids = [...recorded.ids];
  const results = outcome.results.map((result) => (result.id ? result : { ...result, id: ids.shift() }));
  return { state: recorded.state, proof: { runs: results.map((result) => result.id) }, outcome: { ...outcome, results } };
}

// What run and check report of a counterproof, and its warnings.
function counterproofView(outcome) {
  if (outcome.skipped) return { view: { skipped: outcome.skipped }, warnings: [`counterproof skipped: ${outcome.skipped}`] };
  const runs = outcome.results.map(({ id, exit_code, control, timed_out, reused }) => ({ id, exit_code, ...(control ? { control } : {}), ...(timed_out ? { timed_out } : {}), ...(reused ? { reused } : {}) }));
  const warnings = runs
    .filter((run) => run.timed_out && !run.control)
    .map((run) => `counterproof ${run.id} timed out after ${COUNTERPROOF_TIMEOUT_MS / 60000} minutes on the base (exit ${TIMED_OUT_EXIT}): it counts as failing`);
  return { view: { base: outcome.base, runs }, warnings };
}

// What checks-changed contrasts (B7, E1.53): the checks and the ceremony
// settings of idd/config.yaml against the ones it declared at `base`.
function readConfigChange(root, base, context) {
  const baseConfig = readBaseConfig(root, base);
  return { baseChecks: baseConfig.checks, checks: context.checks, baseConfig: ceremonyConfig(baseConfig), config: ceremonyConfig(context) };
}

// What a check reads before it runs anything: the diff against the change's
// base, the configuration it contrasts and the fitness checks of the
// references the diff derives. It refuses what check refuses (E1.44).
function readCheckInputs(root, values, current, context) {
  const diff = readGitDiff(root, { base: diffBase(values, current) });
  requireDeclaredCeremony(current, { diff, contractPatterns: context.contractPatterns });
  const configChange = readConfigChange(root, diffBase(values, current), context);
  const { map, sources, warnings } = readKnowledgeSources(root);
  // The fitness checks follow the references this check's diff derives.
  const preview = applyDerivation(current, deriveSignals({ intent: current.intent, strictTdd: context.strictTdd, diff, patterns: context.patterns, knowledge: { map, sources }, retracted: current.retracted })).state;
  const fitness = changeFitness(root, preview);
  warnings.push(...fitness.warnings);
  return { diff, configChange, knowledge: { map, sources }, fitness, warnings };
}

// What a check reads once its commands ran: the contract paths of the diff,
// the new ADRs the impacts attach and whether the reviewed paths changed.
function readCheckOutcome(root, values, current, context, diff) {
  const reviewed = currentReview(current);
  let reviewedChanged = false;
  if (reviewed) {
    const trees = reviewTrees(root, values, current);
    reviewedChanged = reviewedPathsChanged(root, reviewed, trees.tree, trees.numstat, context.patterns);
  }
  return {
    contractPaths: classifyContractPaths(diff.paths, context.contractPatterns),
    records: readDecisionRecords(root, (current.impacts || []).filter((entry) => entry.record).map((entry) => entry.record)),
    reviewedChanged,
  };
}

// Whether a check whose checks returned `results` would satisfy
// boundary-tests, so its counterproof has to run first (E1.48).
function settlesBoundary(state, diff, results) {
  const target = state.obligations.find((entry) => entry.id === "boundary-tests");
  return Boolean(target && target.status !== "withdrawn" && addedTests(diff).length > 0 && results.some((result) => result.exit_code === 0 && result.tests !== 0));
}

// Settles on `stored` what a check observed: the signals of the diff, the
// checks-changed gate, the check and fitness runs and every obligation they
// prove, with the counterproof of boundary-tests (E1.48). A run that counts as
// the check (E4.15) runs no fitness checks, so with some to run the impact
// declaration keeps only evidence of this tree.
function settleCheck(stored, { context, inputs, outcome, checks, fitnessRuns, checkTreeBefore, checkTree, tree, recordedAt, fitnessDeferred = false, counterproof = null }) {
  const reasons = {};
  const derived = applyDerivation(
    stored,
    deriveSignals({ intent: stored.intent, strictTdd: context.strictTdd, diff: inputs.diff, patterns: context.patterns, knowledge: inputs.knowledge, retracted: stored.retracted }),
  );
  const reopened = reopenDerived(derived.state).state;
  const gated = settleChecksChange(reopened, inputs.configChange);
  const runs = checks.map((result) => runRecord("checks", result.command, result, checkTreeBefore, recordedAt, { name: result.name }));
  const recorded = recordRuns(gated, runs);
  const fitnessRecorded = recordRuns(recorded.state, fitnessRuns.map((result) => runRecord("fitness", result.command, result, checkTreeBefore, recordedAt, { ref: result.ref })));
  const counterproved = counterproof ? recordCounterproof(fitnessRecorded.state, counterproof, { obligation: "boundary-tests", tree, recordedAt }) : null;
  const settled = settleChecks(counterproved?.state ?? fitnessRecorded.state, { tree: checkTree, runIds: recorded.ids, recordedAt });
  const tested = settleBoundary(settled.state, { tree: checkTree, runIds: recorded.ids, recordedAt, tests: addedTests(inputs.diff), counterproof: counterproved?.proof ?? null });
  if (tested.reason) reasons["boundary-tests"] = tested.reason;
  const bound = settleTreeBound(tested.state, { tree });
  const contract = settleContract(bound, { tree: checkTree, checkEvidence: settled.evidence, ...outcome.contractPaths, recordedAt });
  if (contract.reason) reasons["contract-spec-and-test"] = contract.reason;
  const impacts = fitnessDeferred
    ? deferImpacts(contract.state, { tree: checkTree })
    : settleImpacts(contract.state, { records: outcome.records, fitness: { tree: checkTree, runIds: fitnessRecorded.ids }, recordedAt });
  if (impacts.reason) reasons["adr-impact-declaration"] = impacts.reason;
  const fresh = settleReviewFreshness(impacts.state, { reviewedChanged: outcome.reviewedChanged });
  return { state: fresh, added: derived.added, reasons, runIds: recorded.ids, evidence: settled.evidence, counterproof: counterproved?.outcome ?? null };
}

// Runs every declared check on the working tree, recomputes the signals from
// the diff and settles checks-pass on the tree the checks finished on.
async function check(root, values) {
  if (!values.change) throw new UsageError("check needs --change <id>");
  const current = await openChange(root, values.change);
  if (isIntentAmbiguous(current)) {
    const verdict = checkVerdict(current);
    return { change: current.change, changed: false, added: { signals: [], gates: [] }, checks: [], ...verdict, next: nextForChange(current) };
  }

  const context = readProjectContext(root);
  const inputs = readCheckInputs(root, values, current, context);
  const treeBefore = readTreeFingerprint(root);
  const checkTreeBefore = readCheckTreeFingerprint(root, context.checks);
  const checks = context.checks.map(({ name, command }) => {
    const result = { name, command, ...runCommand(command, { cwd: root }) };
    const tests = countTests(result.output_tail);
    if (tests != null) result.tests = tests;
    return result;
  });
  const fitnessRuns = inputs.fitness.checks.map(({ kind, id, command }) => ({ ref: `${kind}:${id}`, command, ...runCommand(command, { cwd: root }) }));
  const counterproof = settlesBoundary(current, inputs.diff, checks) ? runCounterproof(root, current, { diff: inputs.diff, commands: context.checks }) : null;
  const tree = readTreeFingerprint(root);
  const checkTree = readCheckTreeFingerprint(root);
  const recordedAt = new Date().toISOString();
  const outcome = readCheckOutcome(root, values, current, context, inputs.diff);

  let settled;
  const { state, changed } = await mutateChange(
    root,
    values.change,
    existing((stored) => {
      settled = settleCheck(stored, { context, inputs, outcome, checks, fitnessRuns, checkTreeBefore, checkTree, tree, recordedAt, counterproof });
      return { state: settled.state, changed: changedFrom(stored, settled.state) };
    }),
  );
  const verdict = checkVerdict(state, {
    checks: context.checks,
    candidateCommand: context.candidateCommand,
    results: checks,
    treeChanged: tree !== treeBefore || checkTree !== checkTreeBefore,
    reasons: settled.reasons,
    livingDoc: readLivingDoc(root, state),
  });
  const result = { change: state.change, changed, added: settled.added, checks, tree: checkTree, ...verdict, next: nextAfterWrite(root, state) };
  const view = fitnessView(inputs.fitness, fitnessRuns);
  if (view) result.fitness = view;
  const warnings = [...inputs.warnings];
  if (settled.counterproof) {
    const counterproved = counterproofView(settled.counterproof);
    result.counterproof = counterproved.view;
    warnings.push(...counterproved.warnings);
  }
  if (warnings.length) result.warnings = warnings;
  return result;
}

// check --close (E4.15): the check, then the close once its verdict is ready.
// Any other verdict, or a refused close, refuses as ospec close does, and the
// refusal carries the check's result, whose evidence stays recorded.
async function checkAndClose(root, values) {
  const result = await check(root, values);
  const refuse = (error) => {
    error.check = result;
    return error;
  };
  if (result.verdict !== "ready") {
    const pending = [...result.missing.map((entry) => entry.obligation), ...(result.decision ? [`gate ${result.decision.gate}`] : [])];
    const error = new IddRecordError("close-refused", `close refused: the check answered ${result.verdict} (${pending.join(", ")})`);
    if (result.next.next_step.command) error.how = result.next.next_step.command;
    throw refuse(error);
  }
  let closed;
  try {
    closed = await close(root, values);
  } catch (error) {
    if (error instanceof IddRecordError) throw refuse(error);
    throw error;
  }
  const { next, ...checked } = result;
  return { ...checked, close: closed };
}

// Runs one test command for an obligation `ospec run` proves and records the
// run: a passing run after a failing one on another tree records a red → green
// pair once the diff adds a line to a test and its counterproof fails on the
// base (E1.48), and a passing migration test records its evidence with the
// plan. A command equal to the only declared check also counts as that check
// (E4.15): it settles what ospec check settles, but runs no fitness check.
async function runObligation(root, values) {
  const purpose = RUN_OBLIGATIONS[values.obligation];
  if (!purpose) {
    throw new UsageError(`run proves ${Object.keys(RUN_OBLIGATIONS).join(", ")}; the declared checks run with ospec check`);
  }
  const migration = values.obligation === "migration-compat-and-test";
  if (!values.change) throw new UsageError("run needs --change <id>");
  if (!values.command) throw new UsageError("run needs --command <cmd>");
  if (migration && !values.plan?.trim()) throw new UsageError("a migration test run needs --plan <compatibility or rollback plan>");
  const current = await openChange(root, values.change);
  if (isIntentAmbiguous(current)) throw new IddRecordError("ambiguous-intent-open", "nothing runs while the intent is ambiguous");
  const target = current.obligations.find((entry) => entry.id === values.obligation);
  if (!target) throw new IddRecordError("unknown-obligation", `change ${current.change} has no obligation ${values.obligation}; derive its signals with ospec signals`);
  if (target.status === "withdrawn") throw new IddRecordError("obligation-withdrawn", `obligation ${values.obligation} is withdrawn`);

  const context = readProjectContext(root);
  const [onlyCheck] = context.checks.length === 1 && context.checks[0].command.trim() === values.command.trim() ? context.checks : [];
  const warnings = [];
  let inputs = null;
  if (onlyCheck) {
    // What check would refuse leaves the run as a test run only.
    try {
      inputs = readCheckInputs(root, values, current, context);
    } catch (error) {
      if (!(error instanceof IddRecordError)) throw error;
      warnings.push(`not counted as check ${onlyCheck.name}: ${error.message}${error.how ? `; ${error.how}` : ""}`);
    }
  }
  const tree = readTreeFingerprint(root);
  const checkTreeBefore = inputs ? readCheckTreeFingerprint(root, context.checks) : null;
  const result = runCommand(values.command, { cwd: root });
  const recordedAt = new Date().toISOString();
  const extra = values.unit ? { unit: values.unit } : {};
  const after = inputs
    ? { tree: readTreeFingerprint(root), checkTree: readCheckTreeFingerprint(root), outcome: readCheckOutcome(root, values, current, context, inputs.diff) }
    : null;
  const checkResult = inputs ? { name: onlyCheck.name, command: onlyCheck.command, ...result } : null;
  if (checkResult && countTests(result.output_tail) != null) checkResult.tests = countTests(result.output_tail);
  // E1.48: a passing run that would close its pair needs a test in the diff
  // and its counterproof; as the only check, the same counterproof proves
  // boundary-tests.
  let tests = [];
  let pairCounterproof = null;
  if (!migration && result.exit_code === 0 && pairRed(current.runs || [], { purpose, command: values.command, unit: values.unit, tree })) {
    const diff = inputs?.diff ?? readGitDiff(root, { base: diffBase(values, current) });
    tests = addedTests(diff);
    if (tests.length > 0) pairCounterproof = runCounterproof(root, current, { diff, commands: [{ command: values.command }] });
  }
  const boundaryCounterproof =
    inputs && settlesBoundary(current, inputs.diff, [checkResult])
      ? (pairCounterproof ?? runCounterproof(root, current, { diff: inputs.diff, commands: [{ command: onlyCheck.command, name: onlyCheck.name }] }))
      : null;

  let runId;
  let evidence;
  let settledCheck = null;
  let pairRecorded = null;
  const { state } = await mutateChange(
    root,
    values.change,
    existing((stored) => {
      const recorded = recordRuns(stored, [runRecord(purpose, values.command, result, tree, recordedAt, extra)]);
      [runId] = recorded.ids;
      let pairState = recorded.state;
      let proof = null;
      if (pairCounterproof) {
        const counterproved = recordCounterproof(pairState, pairCounterproof, { obligation: values.obligation, tree, recordedAt });
        ({ state: pairState, proof, outcome: pairRecorded } = counterproved);
        // The green run names its counterproof, so a refused pair says why.
        if (proof.runs) pairState.runs.find((run) => run.id === runId).counterproof = [...proof.runs];
      }
      const settled = migration
        ? settleMigration(pairState, { runId, plan: values.plan.trim(), recordedAt })
        : settlePair(pairState, { obligation: values.obligation, runId, recordedAt, tests, counterproof: proof });
      evidence = settled.evidence;
      if (!inputs) return { state: settled.state, changed: true };
      const fitnessDeferred = inputs.fitness.checks.length > 0;
      const counterproof = boundaryCounterproof && boundaryCounterproof === pairCounterproof ? pairRecorded : boundaryCounterproof;
      settledCheck = settleCheck(settled.state, { context, inputs, outcome: after.outcome, checks: [checkResult], fitnessRuns: [], checkTreeBefore, checkTree: after.checkTree, tree: after.tree, recordedAt, fitnessDeferred, counterproof });
      return { state: settledCheck.state, changed: true };
    }),
  );
  const counted = settledCheck
    ? { results: [checkResult], treeChanged: after.tree !== tree || after.checkTree !== checkTreeBefore, reasons: settledCheck.reasons }
    : {};
  const verdict = checkVerdict(state, { ...context, ...counted, livingDoc: readLivingDoc(root, state) });
  const output = { change: state.change, run: { id: runId, ...extra, ...result }, evidence };
  if (settledCheck) output.check = { name: onlyCheck.name, run: settledCheck.runIds[0], evidence: settledCheck.evidence, added: settledCheck.added };
  const counterproved = pairRecorded ?? settledCheck?.counterproof;
  if (counterproved) {
    const view = counterproofView(counterproved);
    output.counterproof = view.view;
    warnings.push(...view.warnings);
  }
  if (warnings.length) output.warnings = warnings;
  return { ...output, ...verdict, next: nextAfterWrite(root, state) };
}

// --- close (REQ-idd-009, REQ-idd-017) ---------------------------------------

function livingDocFile(root, changeId) {
  return path.join(changeDir(root, changeId), LIVING_DOC_FILE);
}

// Decisions may stay empty only when the declared plan holds no decision
// (E4.16); a change without a plan keeps needing them.
function readLivingDoc(root, state) {
  if (!state.obligations.some((entry) => entry.id === "living-doc" && entry.status !== "withdrawn")) return null;
  try {
    return livingDocStatus(fs.readFileSync(livingDocFile(root, state.change), "utf8"), { decisionRequired: state.plan?.decision !== false });
  } catch (error) {
    if (error.code === "ENOENT") return livingDocStatus(null);
    throw error;
  }
}

function writeEvidenceSection(root, state) {
  const file = livingDocFile(root, state.change);
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  const rendered = renderEvidence(text, state);
  if (rendered !== text) fs.writeFileSync(file, rendered);
}

// The tree-bound evidence must come from the tree being closed: the last check
// settled it on that tree (B2: a hand edit could restore an older one).
function requireFreshEvidence(root, state) {
  const read = (fingerprint) => {
    let value;
    return () => (value ??= fingerprint(root));
  };
  const stale = staleEvidence(state, { tree: read(readTreeFingerprint), checkTree: read(readCheckTreeFingerprint) });
  if (stale.length === 0) return;
  const what = stale.includes("checks-pass") ? "the tree changed after the last ospec check" : `${stale.join(", ")} holds evidence of another tree`;
  throw new IddRecordError("evidence-stale", `${what}: run ospec check before closing`);
}

// close derives the signals again as ospec check does (B2): a signal, gate or
// reference the diff derives and the state lacks was removed by hand, and
// check records it again. It refuses what check refuses (E1.44).
function requireDerived(root, state) {
  const context = readProjectContext(root);
  const diff = readGitDiff(root, { base: diffBase({}, state) });
  requireDeclaredCeremony(state, { diff, contractPatterns: context.contractPatterns });
  // A check against another --base may have counted older tests as added (B3),
  // or older contract documents and tests as touched (E1.53).
  const satisfied = (id) => state.obligations.some((entry) => entry.id === id && entry.status === "satisfied");
  const contract = classifyContractPaths(diff.paths, context.contractPatterns);
  const inflated = [
    satisfied("boundary-tests") && addedTests(diff).length === 0 && "boundary-tests is satisfied, but the diff against the change's base adds no line to a test",
    satisfied("contract-spec-and-test") &&
      (contract.documents.length === 0 || contract.tests.length === 0) &&
      "contract-spec-and-test is satisfied, but the diff against the change's base touches no contract document or no test of the contract",
  ].find(Boolean);
  if (inflated) {
    const error = new IddRecordError("close-refused", `close refused: ${inflated}`);
    error.how = `ospec check --change ${state.change} reads the diff against the change's base`;
    throw error;
  }
  const { map, sources } = readKnowledgeSources(root);
  const derived = applyDerivation(state, deriveSignals({ intent: state.intent, strictTdd: context.strictTdd, diff, patterns: context.patterns, knowledge: { map, sources }, retracted: state.retracted }));
  const known = new Set((state.impacts || []).map((entry) => `${entry.kind}:${entry.id}`));
  const gated = settleChecksChange(state, readConfigChange(root, diffBase({}, state), context));
  const lacking = [
    ...derived.added.signals.map((id) => `signal ${id}`),
    ...derived.added.gates.map((id) => `gate ${id}`),
    ...(derived.state.impacts || []).filter((entry) => !known.has(`${entry.kind}:${entry.id}`)).map((entry) => `${entry.kind} ${entry.id}`),
    ...(JSON.stringify(gated.gates) === JSON.stringify(state.gates) ? [] : ["gate checks-changed"]),
  ];
  if (lacking.length === 0) return;
  const error = new IddRecordError("close-refused", `close refused: the diff derives ${lacking.join(", ")}, which the state lacks`);
  error.how = `ospec check --change ${state.change} records it`;
  throw error;
}

async function findArchived(root, changeId) {
  const archive = path.join(root, ...ARCHIVE_ROOT.split("/"));
  let names = [];
  try {
    names = await fsp.readdir(archive);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const name = names.filter((entry) => entry.endsWith(`-${changeId}`) && /^\d{4}-\d{2}-\d{2}-/.test(entry)).sort().at(-1);
  if (!name) return null;
  const state = JSON.parse(await fsp.readFile(path.join(archive, name, STATE_FILE), "utf8"));
  return state.change === changeId && state.status === "closed" ? state : null;
}

async function close(root, values) {
  if (!values.change) throw new UsageError("close needs --change <id>");
  changeDir(root, values.change);
  await fsp.mkdir(path.join(root, ...ARCHIVE_ROOT.split("/")), { recursive: true });
  const lockTarget = path.join(root, ...ARCHIVE_ROOT.split("/"), `${values.change}.close`);
  return withFileLock(lockTarget, async () => {
    let state = await readChange(root, values.change);
    let delivery = null;
    if (!state) {
      const archived = await findArchived(root, values.change);
      if (!archived) throw new IddRecordError("unknown-change", "no such change; open it with record intent first");
      state = archived;
    } else if (state.status === "open") {
      requireFreshEvidence(root, state);
      const livingDoc = readLivingDoc(root, state);
      const closedAt = new Date().toISOString();
      // A refused close leaves the changelog as it was, so it is refused first.
      closeChange(state, { closedAt, livingDoc });
      requireDerived(root, state);
      const validated = serializeState(state);
      ({ state } = await mutateChange(root, values.change, existing((stored) => {
        // The state closed is the one validated above (B2): git runs outside
        // the state lock, so a write in between refuses before the changelog.
        if (serializeState(stored) !== validated) {
          throw new IddRecordError("state-changed", "state.yaml changed while close validated it: run ospec close again");
        }
        const closed = closeChange(stored, { closedAt, livingDoc });
        delivery = closeDelivery(root, stored, { write: true });
        return { ...closed, changed: true };
      })));
    } else {
      requireResumable(state);
    }
    if (await fsp.stat(changeDir(root, state.change)).then(() => true, () => false)) writeEvidenceSection(root, state);
    const archive = await archiveChange(root, state);
    const warnings = counterproofWarnings(state);
    return {
      change: state.change,
      status: state.status,
      closed_at: state.closed_at,
      archive,
      assumptions: state.assumptions || [],
      reviews: reviewAttestations(state),
      ...(warnings.length ? { warnings } : {}),
      records: readKnowledgeRecords(root, state, archive.destination),
      ...(delivery ?? closeDelivery(root, state, { write: false })),
    };
  });
}

// The changelog entry and the release of a closing change (REQ-idd-025), only
// for what idd/config.yaml declares: the profile recommends, never writes.
// Closing writes the entry once; closing again reads the file and reports it.
// An unreadable configuration refuses the first close and is skipped after it.
function closeDelivery(root, state, { write }) {
  let team;
  try {
    team = readTeam(root, "idd");
  } catch (error) {
    if (!write && (error instanceof IddConfigError || error instanceof TeamProfileError)) return {};
    throw error;
  }
  const declared = (option) => (option.source === CONFIG_FILE ? option.value : null);
  const file = declared(team.changelog);
  const result = {};
  let text = null;
  if (file && file !== CHANGELOG_NONE) {
    const target = path.join(root, ...file.split("/"));
    const entry = changelogEntry(state);
    text = readText(target);
    let written = false;
    if (write) {
      const added = addEntry(text, entry);
      if (added.written) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, added.text);
      }
      ({ text, written } = added);
    }
    result.changelog = { path: file, section: entry.section, entry: entry.line, written };
  }
  if (declared(team.release) === "per-change") {
    // Without a changelog nothing gives the version or the notes.
    const proposal = text == null ? (result.changelog ? null : { version: null, bump: null, tag: null, notes: null }) : proposeRelease(text);
    if (proposal) result.release = proposal;
  }
  return result;
}

// How each trust review evidence of the change was attested (OSP-029); null
// for evidence recorded before attestation existed.
function reviewAttestations(state) {
  return state.evidence
    .filter((entry) => entry.kind === "frozen-review")
    .map((entry) => ({ evidence: entry.id, lineage_id: entry.detail?.lineage_id ?? null, attestation: entry.detail?.attestation ?? null }));
}

// The knowledge records of REQ-idd-024, read from the archived change and the
// new ADRs it attached; a missing ADR keeps its id as the title.
function readKnowledgeRecords(root, state, destination) {
  const livingDoc = readText(path.join(root, ...destination.split("/"), LIVING_DOC_FILE));
  const adrTitles = new Map();
  for (const { record } of state.impacts || []) {
    if (!record) continue;
    const heading = /^# +(.+?)\s*$/m.exec(readText(path.join(root, ...record.split("/"))) || "");
    if (heading) adrTitles.set(record, heading[1]);
  }
  return knowledgeRecords({ state, livingDoc, destination, adrTitles });
}

// --- trust review on the bounded review lineage (REQ-idd-016) --------------

function readResult(raw) {
  if (!raw) throw new UsageError("review record and review validate need --result <json> or --result @<file>");
  let text = raw;
  if (raw.startsWith("@")) {
    try {
      text = fs.readFileSync(raw.slice(1), "utf8");
    } catch (error) {
      throw new UsageError(`cannot read ${raw.slice(1)}: ${error.message}`);
    }
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(`--result is not JSON: ${error.message}`);
  }
}

// Whether the reviewed paths, or any security-boundary path the diff now
// touches, differ from the last reviewed candidate.
function reviewedPathsChanged(root, lineage, tree, numstat, patterns) {
  if (!lineage) return true;
  const paths = new Set(lineage.genesis.paths);
  for (const { path: file } of numstat) {
    if (matchImpact(file, patterns).some((hit) => hit.signal === "security-boundary")) paths.add(file);
  }
  const reviewed = treeBlobs(root, lineage.current_candidate.candidate_tree);
  const current = treeBlobs(root, tree);
  return [...paths].some((file) => reviewed.get(file) !== current.get(file));
}

function reviewTrees(root, values, state) {
  const baseTree = commitTree(root, values.base || state.base || readHead(root));
  const tree = snapshotTree(root);
  return { baseTree, tree, numstat: treeNumstat(root, baseTree, tree) };
}

async function review(root, positionals, values) {
  const [action] = positionals;
  if (!["start", "record", "correct", "validate"].includes(action)) {
    throw new UsageError(`unknown review action: ${action ?? "(none)"}; expected start, record, correct or validate`);
  }
  if (!values.change) throw new UsageError(`review ${action} needs --change <id>`);
  const result = action === "record" || action === "validate" ? readResult(values.result) : null;
  const current = await openChange(root, values.change);
  if (isIntentAmbiguous(current)) throw new IddRecordError("ambiguous-intent-open", "no review runs while the intent is ambiguous");
  const recordedAt = new Date().toISOString();
  const context = action === "start" || action === "correct" ? readProjectContext(root) : null;
  const trees = context ? reviewTrees(root, values, current) : null;
  // The SubagentStop hook's receipt of a reviewer result (REQ-hooks-027).
  const receiptFor = (digest) => readReceipt(root, digest);

  let outcome;
  const { state } = await mutateChange(
    root,
    values.change,
    existing((stored) => {
      const lineage = currentReview(stored);
      if (action === "start") {
        const { baseTree, tree, numstat } = trees;
        const candidate = buildCandidate({
          baseTree,
          candidateTree: tree,
          numstat,
          baseBlobs: treeBlobs(root, baseTree),
          candidateBlobs: treeBlobs(root, tree),
        });
        const reviewedChanged = reviewedPathsChanged(root, lineage, tree, numstat, context.patterns);
        // A review waiting for its correction: the changes since the reviewed
        // candidate decide whether they still fit one bounded correction.
        const correctionChanges = lineage && lineage.status === "correction-required"
          ? treeNumstat(root, lineage.current_candidate.candidate_tree, tree)
          : undefined;
        outcome = startTrustReview(stored, { candidate, reviewedChanged, correctionChanges });
      } else if (action === "record") {
        // Cites resolve in the frozen candidate, or in its base for a deleted path.
        const frozen = lineage ? [lineage.genesis.candidate.candidate_tree, lineage.genesis.candidate.base_tree] : [];
        outcome = recordTrustFindings(stored, { result, recordedAt, lineCount: treeLineCounter(root, frozen), receiptFor });
      } else if (action === "correct") {
        if (!lineage) throw new IddRecordError("review-refused", "no trust review to correct: run ospec review start");
        const { tree } = trees;
        const changes = treeNumstat(root, lineage.current_candidate.candidate_tree, tree);
        const diffHash = candidateDiffHash(lineage.genesis.paths, treeBlobs(root, lineage.genesis.candidate.base_tree), treeBlobs(root, tree));
        outcome = correctTrustReview(stored, { changes, candidateTree: tree, diffHash });
      } else {
        // Cites resolve in the corrected tree, or in the reviewed one for a path the correction deletes.
        const trees = lineage ? [lineage.current_candidate.candidate_tree, lineage.genesis.candidate.candidate_tree] : [];
        outcome = validateTrustCorrection(stored, { result, recordedAt, lineCount: treeLineCounter(root, trees), receiptFor });
      }
      return { state: outcome.state, changed: outcome.changed !== false };
    }),
  );
  const lineage = currentReview(state);
  const summary = { lineage_id: lineage.lineage_id, generation: lineage.generation, status: lineage.status };
  if (outcome.request) summary.request = outcome.request;
  if (outcome.validate) summary.validate = outcome.validate;
  if (lineage.findings.length) summary.findings = lineage.findings.map(({ id, severity, summary: text, blocking }) => ({ id, severity, summary: text, blocking }));
  return {
    change: state.change,
    action,
    review: summary,
    evidence: outcome.evidence ?? null,
    ...(outcome.warnings?.length ? { warnings: outcome.warnings } : {}),
    ...checkVerdict(state, { checks: (context || readProjectContext(root)).checks, livingDoc: readLivingDoc(root, state) }),
    next: nextAfterWrite(root, state),
  };
}

// The knowledge references of an open change (E3.2, REQ-idd-021): those of the
// components its declared plan and its current diff touch, each with the
// currency read from disk now. A diff that cannot be read narrows the paths to
// the plan and says so.
function changeKnowledge(root, state) {
  if (!state || state.status !== "open" || isIntentAmbiguous(state)) return null;
  const { map, sources, warnings } = readKnowledgeSources(root);
  const fitness = changeFitness(root, state);
  const view = fitnessView(fitness);
  warnings.push(...fitness.warnings);
  if (!map) return { references: [], warnings, ...(view ? { fitness: view } : {}) };
  let diffPaths = [];
  try {
    diffPaths = readGitDiff(root, { base: diffBase({}, state) }).paths;
  } catch (error) {
    if (!(error instanceof IddWorkspaceError)) throw error;
    warnings.push(`references use the declared plan only: ${error.message}`);
  }
  const resolved = resolveReferences({ map, paths: [...(state.plan?.paths || []), ...diffPaths], sources });
  return { references: resolved.references, warnings: [...warnings, ...resolved.warnings], ...(view ? { fitness: view } : {}) };
}

// The memory query hint of a resolved intent (E1.47, REQ-idd-024): the ADRs
// and components of the paths the change already names (its plan, its diff
// and the cites of a feature), then the words of its request. A diff that
// cannot be read leaves the other paths, and a query without terms is left
// out. The CLI reads no memory (ADR 0006).
function intentMemoryQuery(root, state) {
  if (isIntentAmbiguous(state)) return null;
  const { map, sources } = readKnowledgeSources(root);
  let diffPaths = [];
  try {
    diffPaths = readGitDiff(root, { base: diffBase({}, state) }).paths;
  } catch (error) {
    if (!(error instanceof IddWorkspaceError)) throw error;
  }
  const cites = (state.facts?.coverage || []).filter((entry) => entry.cite?.kind === "path").map((entry) => entry.cite.path);
  const paths = [...(state.plan?.paths || []), ...diffPaths, ...cites];
  const adrs = map ? resolveReferences({ map, paths, sources }).references.filter((ref) => ref.kind === "adr").map((ref) => ref.id) : [];
  return memoryQuery({ intent: state.intent, adrs, components: touchedComponents(map, paths) });
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// The team profile of the active mode, or of the --mode given, and its
// defaults (REQ-idd-023): IDD reads idd/config.yaml, SDD reads
// openspec/config.yaml (ADR 0011).
function readTeam(root, mode = null) {
  if (mode !== null && !["idd", "sdd"].includes(mode)) throw new UsageError(`team --mode must be idd or sdd, got ${mode}`);
  const iddText = mode === "sdd" ? null : readText(path.join(root, CONFIG_FILE));
  return resolveTeam({
    idd: iddText == null ? null : parseIddConfig(iddText),
    openspecText: mode === "idd" ? null : readText(path.join(root, "openspec", "config.yaml")),
    mode,
  });
}

// The team and delivery blocks of ospec next: team only for an IDD profile,
// delivery for every IDD project. A configuration that does not parse leaves
// both out, since the next step never depends on them.
function nextTeamContext(root) {
  let team;
  try {
    team = readTeam(root);
  } catch (error) {
    if (error instanceof IddConfigError || error instanceof TeamProfileError) return {};
    throw error;
  }
  if (team.mode !== "idd") return {};
  const { value, ...branching } = team.branching;
  const delivery = { branching: value, ...branching, changelog: team.changelog, release: team.release };
  if (!team.profile) return { delivery };
  return {
    team: {
      ...team.profile,
      source: team.source,
      delivery_strategy: team.defaults.delivery_strategy,
      mentorship: team.defaults.mentorship,
    },
    delivery,
  };
}

// The next step of one change with everything `ospec next` adds to it: the
// knowledge of the touched components, the team and delivery, the foundation
// suggestion and, only where check evidence is next, the check configuration.
// Every command that writes a change returns it (E4.15), so `ospec next` is
// needed only to resume.
function changeNext(root, state) {
  const bare = nextForChange(state);
  // The project's files feed the foundation suggestion, read only on the
  // steps that offer it (E4.10).
  const projectFiles = FOUNDATION_STEPS.includes(bare.next_step.action) ? readProjectFiles(root) : undefined;
  const context = { knowledge: changeKnowledge(root, state), projectFiles, ...nextTeamContext(root) };
  // Intent gates and change selection do not depend on configuration.
  if (bare.next_step.action !== "satisfy-obligation" || !CHECKS_REQUIRED.includes(bare.next_step.obligation)) return nextForChange(state, context);
  return nextForChange(state, { ...context, ...readProjectContext(root) });
}

// The next of a command that writes (E4.15) leaves out the intent, which the
// agent has just recorded or already holds (E4.16); ospec next keeps it.
function nextAfterWrite(root, state) {
  const { intent, ...next } = changeNext(root, state);
  return next;
}

async function run(command, positionals, values) {
  const root = values.root || process.cwd();
  if (command === "status") {
    const states = await listChanges(root);
    return statusOf(values.change ? states.filter((s) => s.change === values.change) : states);
  }
  if (command === "next") {
    requireWorkTree(root);
    const states = await listChanges(root);
    let next;
    try {
      next = nextForProject(states, { change: values.change });
    } catch (error) {
      if (/^unknown change/.test(error.message)) throw new IddRecordError("unknown-change", error.message);
      throw error;
    }
    if (next.change) return changeNext(root, states.find((state) => state.change === next.change));
    return nextForProject(states, { projectFiles: FOUNDATION_STEPS.includes(next.next_step.action) ? readProjectFiles(root) : undefined });
  }
  if (command === "signals") return signals(root, values);
  if (command === "check") return values.close ? checkAndClose(root, values) : check(root, values);
  if (command === "run") return runObligation(root, values);
  if (command === "review") return review(root, positionals, values);
  if (command === "close") return close(root, values);
  if (command === "doctor") return runDoctor({ root, target: values.target ?? null, repair: values.repair === true });
  if (command === "foundation") return foundation(root, positionals, values);
  if (command === "team") return readTeam(root, values.mode ?? null);
  if (command === "snapshot") return snapshot(root, values);
  if (command === "record") {
    const [type] = positionals;
    // A change opens only inside a project (E4.8); the other records act on
    // a change that already exists.
    if (type === "intent") requireWorkTree(root);
    const reducer = reducerFor(type, values, root);
    if (!values.change) throw new UsageError(`record ${type} needs --change <id>`);
    const recorded = await mutateChange(root, values.change, reducer);
    const { state, changed } = recorded;
    const query = type === "intent" ? intentMemoryQuery(root, state) : null;
    // The signals the plan of record intent derived, as signals reports them.
    const plan = recorded.derivation ? { plan: derivationView(recorded) } : {};
    return { record: type, change: state.change, changed, ...(query ? { memory_query: query } : {}), ...plan, next: nextAfterWrite(root, state) };
  }
  throw new UsageError(`unknown command: ${command ?? "(none)"}`);
}

function describeNext(result) {
  const step = result.next_step;
  const lines = [];
  if (result.change) lines.push(`change: ${result.change} (${result.status})`);
  switch (step.action) {
    case "configure-checks":
      lines.push(`next: ${step.how}`);
      break;
    case "declare-plan":
      lines.push(`next: declare the plan: ${step.how}`);
      break;
    case "satisfy-obligation":
      lines.push(`next: satisfy ${step.obligation} with ${step.evidence} evidence`);
      if (step.how) lines.push(step.how);
      break;
    case "resolve-gate":
      lines.push(`next: resolve gate ${step.gate}`);
      break;
    case "choose-change":
      lines.push(`next: choose a change with --change (${step.changes.join(", ")})`);
      break;
    case "open-change":
      lines.push("next: open a change with ospec record intent");
      break;
    default:
      lines.push(`next: ${step.action}`);
  }
  // The literal command of the step (E1.45).
  for (const command of step.commands || (step.command ? [step.command] : [])) lines.push(`run: ${command}`);
  if (step.feature) {
    lines.push(`feature: ${step.feature.command}`, `  ${step.feature.how}`);
    if (step.feature.omitted) lines.push(`  left out: ${step.feature.omitted.join(", ")} (${step.feature.reason})`);
  }
  if (result.pending_obligations?.length) {
    lines.push(`pending: ${result.pending_obligations.map((o) => o.id).join(", ")}`);
  }
  if (result.pending_decision) {
    const { gate, question, reason, questions = [] } = result.pending_decision;
    lines.push(`decision: ${gate}: ${question}${reason ? ` (${reason})` : ""}`);
    for (const entry of questions) lines.push(`  - ${entry}`);
  }
  if (result.knowledge_refs?.length) lines.push(`refs: ${result.knowledge_refs.join(", ")}`);
  for (const ref of result.references || []) {
    lines.push(`ref ${ref.kind} ${ref.id} ${ref.status} (${ref.components.join(", ")})${ref.path ? `: ${ref.path}` : ""}`);
  }
  lines.push(...describeFitness(result.fitness));
  for (const warning of result.warnings || []) lines.push(`warning: ${warning}`);
  for (const suggestion of result.suggestions || []) lines.push(`suggestion ${suggestion.id}: ${suggestion.reason}; ${suggestion.how}`);
  if (result.team) lines.push(`team: ${result.team.size}; delivery ${result.team.delivery_strategy}; mentorship ${result.team.mentorship}`);
  if (result.delivery) lines.push(...describeDelivery({ ...result.delivery, value: result.delivery.branching }, result.delivery));
  return lines.join("\n");
}

// The step a command that writes returns, in one line with its literal
// command, and what that step needs: the gate's questions, the warnings and
// the suggestions (E4.16). ospec next prints the rest: the pending list, the
// references, the fitness functions, the team and the delivery.
function describeStep(next) {
  const step = next.next_step;
  const command = step.command ? `: ${step.command}` : "";
  const lines = [];
  if (step.action === "satisfy-obligation") {
    lines.push(`next (${step.obligation})${command}`);
    // A run records its own evidence; the other obligations need work first.
    if (step.how && !Object.hasOwn(RUN_OBLIGATIONS, step.obligation)) lines.push(`  ${step.how}`);
  } else if (step.action === "resolve-gate") lines.push(`next (gate ${step.gate})${command}`);
  else if (step.action === "declare-plan" || step.action === "configure-checks") lines.push(`next (${step.action}): ${step.how}`);
  else if (step.action === "none") lines.push(`next: none, ${next.change} is ${next.status}`);
  else lines.push(`next (${step.action})${command}`);
  if (next.pending_decision) {
    const { gate, question, reason, questions = [] } = next.pending_decision;
    lines.push(`decision: ${gate}: ${question}${reason ? ` (${reason})` : ""}`);
    for (const entry of questions) lines.push(`  - ${entry}`);
  }
  for (const warning of next.warnings || []) lines.push(`warning: ${warning}`);
  for (const suggestion of next.suggestions || []) lines.push(`suggestion ${suggestion.id}: ${suggestion.reason}; ${suggestion.how}`);
  return lines;
}

// A delivery option, why it fits and the rules that follow from it.
function describeOption(label, { value, source, reasons, how }) {
  return [`${label}: ${value} (${source}): ${reasons.join("; ")}`, `${label} rules: ${how}`];
}

function describeDelivery(branching, { changelog, release }) {
  const lines = describeOption("branching", branching);
  if (changelog) lines.push(...describeOption("changelog", changelog));
  if (release) lines.push(...describeOption("release", release));
  return lines;
}

const FITNESS_LABELS = Object.freeze({ adr: "ADR", scenario: "quality scenario" });

// The fitness functions of the change (REQ-idd-022): each check, with its exit
// code once ospec check ran it, and each manual item with its evidence.
function describeFitness(fitness) {
  if (!fitness) return [];
  const lines = [];
  for (const check of fitness.checks) {
    const label = `fitness ${FITNESS_LABELS[check.kind]} ${check.id} \`${check.command}\``;
    if (check.exit_code === undefined) lines.push(`${label}: runs in ospec check`);
    else lines.push(...describeRun(label, check));
  }
  for (const item of fitness.manual) {
    const evidence = item.evidence ? `evidence: ${item.evidence}` : `no evidence recorded (ospec record fitness --${item.kind === "adr" ? "adr" : "quality"} ${item.id} --evidence <text>)`;
    lines.push(`manual fitness ${FITNESS_LABELS[item.kind]} ${item.id}: ${item.fitness} (${evidence})`);
  }
  return lines;
}

// What a declaration recorded, as part of a status line (E4.16): the signals
// and gates it added, and the ceremony floor; `changed` says whether the call
// recorded anything else, such as the plan.
function describeDerivation(result, changed) {
  const added = [...result.added.signals, ...result.added.gates.map((g) => `gate:${g}`)];
  let recorded = "the plan and every derived signal were already recorded";
  if (added.length) recorded = `recorded ${added.join(", ")}`;
  else if (changed) recorded = "recorded the plan; every derived signal was already recorded";
  return `${recorded}${result.floor ? `; floor ${result.floor}` : ""}`;
}

function describeSignals(result) {
  const lines = [`plan of ${result.change}: ${describeDerivation(result, result.changed)}`];
  for (const warning of result.warnings || []) lines.push(`warning: ${warning}`);
  lines.push(...describeStep(result.next));
  return lines.join("\n");
}

// The verdict of a check; a decision it needs is the next step's.
function describeVerdict(result) {
  const lines = [];
  if (result.verdict === "ready") lines.push(`ready: ${result.change} can close`);
  for (const entry of result.missing) lines.push(`missing ${entry.obligation}: ${entry.reason}`);
  return lines;
}

function describeRun(label, run) {
  const lines = [`${label}: exit ${run.exit_code}`];
  if (run.exit_code !== 0) for (const line of run.output_tail) lines.push(`  ${line}`);
  return lines;
}

// The verdict, one line with the exit code of every run and the output of
// the failing ones, and the manual fitness items still without evidence
// (E4.16).
function describeCheck(result) {
  const lines = describeVerdict(result);
  const runs = [
    ...result.checks.map((run) => ({ ...run, label: `check ${run.name}` })),
    ...(result.fitness?.checks || []).map((run) => ({ ...run, label: `fitness ${FITNESS_LABELS[run.kind]} ${run.id}` })),
  ];
  if (runs.length) lines.push(`ran: ${runs.map((run) => `${run.label} exit ${run.exit_code}`).join(", ")}`);
  for (const run of runs.filter((entry) => entry.exit_code !== 0)) lines.push(`${run.label} \`${run.command}\`:`, ...run.output_tail.map((line) => `  ${line}`));
  lines.push(...describeFitness({ checks: [], manual: (result.fitness?.manual || []).filter((item) => !item.evidence) }));
  lines.push(...describeCounterproof(result.counterproof));
  lines.push(...describeAdded(result.added));
  for (const warning of result.warnings || []) lines.push(`warning: ${warning}`);
  // check --close reports the close in place of the next step (E4.15).
  lines.push(...(result.close ? [describeClose(result.close)] : describeStep(result.next)));
  return lines.join("\n");
}

// One line per counterproof run (E1.48); a skipped one is a warning.
function describeCounterproof(counterproof) {
  if (!counterproof?.runs) return [];
  return counterproof.runs.map(
    (run) => `counterproof ${run.id}: exit ${run.exit_code} on base ${counterproof.base.slice(0, 12)}${run.control ? " without the tests of the diff" : ""}${run.reused ? " (recorded before)" : ""}`,
  );
}

function describeAdded(added) {
  const ids = [...added.signals, ...added.gates.map((g) => `gate:${g}`)];
  return ids.length ? [`recorded from the diff: ${ids.join(", ")}`] : [];
}

function describeRunResult(result) {
  const evidence = result.evidence ? `recorded evidence ${result.evidence}` : "no evidence recorded by this run";
  const lines = [`${result.run.id}: exit ${result.run.exit_code}; ${evidence}`];
  if (result.run.exit_code !== 0) lines.push(...result.run.output_tail.map((line) => `  ${line}`));
  lines.push(...describeCounterproof(result.counterproof));
  if (result.check) {
    const { name, run, evidence: checked, added } = result.check;
    lines.push(`counted as check ${name} (${run}): ${checked ? `recorded evidence ${checked}` : "no check evidence"}`, ...describeAdded(added));
  }
  for (const warning of result.warnings || []) lines.push(`warning: ${warning}`);
  lines.push(...describeStep(result.next));
  return lines.join("\n");
}

function describeReview(result) {
  const { review } = result;
  const lines = [`review ${review.generation} (${review.status}) of ${result.change}`];
  if (review.request) {
    lines.push(`dispatch ${review.request.reviewer} (lens ${review.request.lens}) on: ${review.request.paths.join(", ")}`);
    lines.push(`hand it request_digest ${review.request.request_digest} and: ${review.request.result_contract}`);
    lines.push(`then: ospec review record --change ${result.change} --result '{"request_digest":"...","reviewed":[...],"findings":[...]}'`);
  }
  if (review.validate) {
    lines.push(`dispatch ${review.validate.validator} for ${review.validate.finding_ids.join(", ")} on: ${review.validate.paths.join(", ")}`);
    lines.push(`hand it request_digest ${review.validate.request_digest} and: ${review.validate.result_contract}`);
    lines.push(`then: ospec review validate --change ${result.change} --result '{"request_digest":"...","reviewed":[...],"outcomes":[...],"regression":{...}}'`);
  }
  for (const finding of review.findings || []) lines.push(`${finding.id} ${finding.severity}: ${finding.summary}`);
  if (result.evidence) lines.push(`recorded evidence ${result.evidence}`);
  for (const warning of result.warnings || []) lines.push(`warning: ${warning}`);
  lines.push(...describeStep(result.next));
  return lines.join("\n");
}

function describeClose(result) {
  const { archive } = result;
  const how = archive.already_complete ? "already archived in" : "closed and archived in";
  const line = `${result.change} ${how} ${archive.destination} (${archive.files} files, ${archive.inventory_sha256})`;
  const assumptions = result.assumptions || [];
  const listed = assumptions.length ? assumptions.map((item) => `- ${item}`).join("\n") : "none declared";
  const reviews = (result.reviews || []).map((entry) => `\ntrust review ${entry.evidence}: ${entry.attestation ?? "not attested"}`).join("");
  const body = `${line}\nassumptions:\n${listed}${reviews}`;
  const records = result.records || [];
  const lines = [body, ...(result.warnings || []).map((warning) => `warning: ${warning}`), ...describeCloseDelivery(result)];
  // Each topic, since agents read the text (E1.47); --json adds the rest.
  if (records.length) {
    lines.push(`${records.length} knowledge record(s) to keep in cross-session memory under its topic; summary and provenance: ospec close --change ${result.change} --json`);
    for (const record of records) lines.push(`- ${record.topic} | ${record.title}`);
  }
  return lines.join("\n");
}

function describeCloseDelivery({ changelog, release }) {
  const lines = [];
  if (changelog) {
    const how = changelog.written ? "added" : "already holds";
    lines.push(`changelog: ${changelog.path} ${how} under [Unreleased] ### ${changelog.section}: ${changelog.entry}`);
  }
  if (release) {
    const version = release.tag ? `${release.tag} (${release.bump})` : "a version the user chooses";
    const notes = release.notes ? "the notes of [Unreleased]" : "notes the user approves";
    lines.push(`release: propose ${version} with ${notes}; ask whether it breaks compatibility (a major), and cut it only with the user's OK`);
  }
  return lines;
}

// The progress snapshot, v1 unless --schema-version asks for the v2, the v3
// or the v4, on stdout or written whole to --out; an invalid one is refused
// before anything is written (REQ-idd-026).
const SNAPSHOT_BUILDERS = Object.freeze({ 1: buildSnapshot, 2: buildSnapshotV2, 3: buildSnapshotV3, 4: buildSnapshotV4 });

async function snapshot(root, values) {
  const version = values["schema-version"] ?? "1";
  if (!Object.hasOwn(SNAPSHOT_BUILDERS, version)) throw new UsageError(`snapshot --schema-version takes 1, 2, 3 or 4, got ${JSON.stringify(version)}`);
  if (version === "1" && values.progress !== undefined) throw new UsageError("snapshot --progress needs --schema-version 2, 3 or 4");
  const built = SNAPSHOT_BUILDERS[version]({ root, roadmap: values.roadmap ?? DEFAULT_ROADMAP, progress: values.progress });
  const { roadmap, snapshot: document, text } = built;
  if (values.out === undefined) return { text };
  await writeFileAtomic(path.resolve(root, values.out), text);
  const report = { roadmap, out: values.out, phases: document.phases.length, bytes: Buffer.byteLength(text) };
  if (version === "1") return report;
  const v2 = { schema_version: Number(version), ...report, progress: built.progress };
  if (version === "2") return v2;
  const v3 = { ...v2, changelog: built.changelog };
  return version === "3" ? v3 : { ...v3, decisions: built.decisions };
}

async function foundation(root, positionals, values) {
  const action = positionals[0];
  const map = values.map ?? null;
  if (action === "next") return nextRound({ root, profile: values.profile ?? null, map });
  if (action === "record") {
    if (!values.slot) throw new UsageError("foundation record needs --slot <id>");
    if (!values.state) throw new UsageError("foundation record needs --state <confirmed|assumed|n/a|deferred>");
    return recordAnswer({
      root,
      map,
      slot: values.slot,
      state: values.state,
      sourceKind: values["source-kind"] ?? null,
      sourceRef: values["source-ref"] ?? null,
      reviewTrigger: values["review-trigger"] ?? null,
      reason: values.reason ?? null,
      owner: values.owner ?? null,
    });
  }
  throw new UsageError(`foundation needs next or record, got ${action ?? "(none)"}`);
}

function describeFoundation(result) {
  const lines = [];
  if ("changed" in result) lines.push(result.changed ? `recorded ${result.slot}` : `no change: ${result.slot} already recorded`);
  lines.push(`profile: ${result.profile}`);
  if (result.round.length === 0) {
    lines.push("round: no open gaps");
  } else {
    lines.push(`theme: ${result.theme}`);
    for (const slot of result.round) lines.push(`- ${slot.id} (priority ${slot.priority}; unblocks ${slot.decisions.join(", ")})`);
  }
  if (result.exists === false) lines.push("map: missing; template returned and not written");
  return lines.join("\n");
}

function describeTeam(result) {
  const branching = describeDelivery(result.branching, result);
  if (!result.profile) return [`mode: ${result.mode}`, "team: no profile declared; defaults unchanged", ...branching].join("\n");
  const { profile, defaults } = result;
  return [
    `mode: ${result.mode}`,
    `team: size ${profile.size}, experience ${profile.experience ?? "unset"} (${result.source})`,
    `delivery: ${defaults.delivery_strategy} (review budget ${defaults.review.budget_lines} lines)`,
    ...branching,
    `review: quality review ${defaults.review.quality_review ? "on" : "off"}, traceability ${defaults.review.traceability}`,
    `strict tdd: ${defaults.strict_tdd} (sdd tdd_mode ${defaults.tdd_mode})`,
    `mentorship: ${defaults.mentorship}`,
  ].join("\n");
}

function describe(command, result) {
  if (command === "next") return describeNext(result);
  if (command === "team") return describeTeam(result);
  if (command === "foundation") return describeFoundation(result);
  if (command === "close") return describeClose(result);
  if (command === "doctor") return renderDoctor(result);
  if (command === "review") return describeReview(result);
  if (command === "signals") return describeSignals(result);
  if (command === "check") return describeCheck(result);
  if (command === "run") return describeRunResult(result);
  if (command === "snapshot") {
    const head = result.schema_version ? `snapshot v${result.schema_version}` : "snapshot";
    const sources = [result.roadmap, result.progress, result.changelog, result.decisions].filter(Boolean);
    const from = sources.length > 1 ? `${sources.slice(0, -1).join(", ")} and ${sources.at(-1)}` : sources[0];
    return `${head}: ${result.phases} phases from ${from} written to ${result.out} (${result.bytes} bytes)`;
  }
  if (command === "status") {
    if (result.changes.length === 0) return "No IDD changes.";
    return result.changes
      .map((c) => {
        const pending = c.obligations.pending.join(", ") || "-";
        const gates = c.open_gates.join(", ") || "-";
        return `${c.change}  ${c.status}  ${c.kind ?? "ambiguous"}  pending: ${pending}  gates: ${gates}`;
      })
      .join("\n");
  }
  const head = result.changed
    ? `recorded ${result.record} on ${result.change}`
    : `no change: ${result.record} already recorded on ${result.change}`;
  const lines = [result.plan ? `${head}; ${describeDerivation(result.plan, result.changed)}` : head];
  if (result.memory_query !== undefined) lines.push(`memory query: ${result.memory_query}`);
  return [...lines, ...describeStep(result.next)].join("\n");
}

// The commands of the IDD loop leave out empty fields in JSON (E4.16): null,
// [] and {} at any depth, while false and 0 stay.
const COMPACT_JSON = Object.freeze(["status", "next", "record", "signals", "check", "run", "review", "close"]);

function isEmpty(value) {
  return value == null || (typeof value === "object" && Object.keys(value).length === 0);
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (value === null || typeof value !== "object") return value;
  const kept = {};
  for (const [key, entry] of Object.entries(value)) {
    const compacted = compact(entry);
    if (!isEmpty(compacted)) kept[key] = compacted;
  }
  return kept;
}

function jsonOf(command, payload) {
  return `${JSON.stringify(COMPACT_JSON.includes(command) ? compact(payload) : payload, null, 2)}\n`;
}

// parseArgs drops what no option takes: `--path a b` keeps only `a`, and a
// single-value flag given twice keeps its last value. Such a call is refused
// instead. How many words a command takes comes from its usage lines: the
// command, and its subcommand when it has one. A repeated boolean drops
// nothing.
function requireEveryArgument(positionals, tokens) {
  const [command] = positionals;
  const entries = USAGE_ENTRIES.filter((entry) => entry.command === command);
  if (entries.length === 0) return;
  const words = entries.some((entry) => entry.sub.length > 0) ? 2 : 1;
  const stray = positionals.slice(words);
  if (stray.length > 0) {
    const takes = positionals.slice(0, words).join(" ");
    throw new UsageError(`${takes} does not take ${stray.map((word) => JSON.stringify(word)).join(", ")}: each value needs its own flag (--path a --path b), and a value with spaces needs quotes`);
  }
  const seen = new Set();
  for (const token of tokens) {
    if (token.kind !== "option" || OPTIONS[token.name].type !== "string" || OPTIONS[token.name].multiple) continue;
    if (seen.has(token.name)) throw new UsageError(`--${token.name} takes one value and was given more than once`);
    seen.add(token.name);
  }
}

// The words and the change of a call that failed to parse, to point its
// refusal at the right usage and change.
function lenientArgs(argv) {
  try {
    return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: false });
  } catch {
    return { values: {}, positionals: [] };
  }
}

async function main(argv = process.argv.slice(2)) {
  const wantsJson = argv.includes("--json");
  let command;
  try {
    const { values, positionals, tokens } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true, tokens: true });
    if (values.help) {
      process.stdout.write(USAGE);
      return 0;
    }
    command = positionals[0];
    requireEveryArgument(positionals, tokens);
    const result = await run(command, positionals.slice(1), values);
    // The snapshot is JSON already: stdout holds it alone, with or without --json.
    if (command === "snapshot" && "text" in result) process.stdout.write(result.text);
    else if (wantsJson) process.stdout.write(jsonOf(command, { ok: true, command, ...result }));
    else process.stdout.write(`${describe(command, result)}\n`);
    return command === "doctor" ? result.exit_code : 0;
  } catch (error) {
    const usage = error instanceof UsageError || error instanceof DoctorUsageError || error.code?.startsWith?.("ERR_PARSE_ARGS");
    const known =
      usage ||
      error instanceof IddRecordError ||
      error instanceof IddStoreError ||
      error instanceof IddConfigError ||
      error instanceof TeamProfileError ||
      error instanceof IddImpactError ||
      error instanceof IddWorkspaceError ||
      error instanceof DecisionGapError ||
      error instanceof SnapshotError;
    if (!known) throw error;
    const code = usage ? "usage" : error.code;
    // A refusal says how to get past it: its own how, the usage of its
    // subcommand, or the one its code has (E1.45).
    const { values, positionals } = lenientArgs(argv);
    const how = error.how || (usage ? usageFor(positionals) : refusalHow(code, { change: typeof values.change === "string" ? values.change : undefined }));
    // A refused check --close keeps the check it ran (E4.15).
    const checked = error.check ? { check: error.check } : {};
    if (wantsJson) {
      process.stdout.write(jsonOf(command, { ok: false, command, error: { code, message: error.message, ...(how ? { how } : {}) }, ...checked }));
    } else {
      if (error.check) process.stdout.write(`${describeCheck(error.check)}\n`);
      process.stderr.write(`ospec: ${error.message} (${code})\n${how ? `${how}\n` : ""}`);
    }
    return usage ? 2 : 1;
  }
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`ospec: ${error.stack || error.message}\n`);
      process.exitCode = 1;
    },
  );
}

module.exports = { main };
