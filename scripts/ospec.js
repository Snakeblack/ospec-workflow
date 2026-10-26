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
// diagnoses the installation and the project without writing (REQ-idd-019).
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
  RUN_OBLIGATIONS,
  ceremonyConfig,
  checkVerdict,
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
const { ARCHIVE_ROOT, DECISIONS_ROOT, LIVING_DOC_FILE, STATE_FILE, isIntentAmbiguous } = require("./lib/idd-contract.js");
const { runCommand } = require("./lib/idd-exec.js");
const { CATEGORY_IDS, countTests, resolveFeatureCoverage } = require("./lib/idd-facts.js");
const { fitnessPlan } = require("./lib/idd-fitness.js");
const { resolveReferences } = require("./lib/idd-knowledge.js");
const { nextForChange, nextForProject, statusOf } = require("./lib/idd-next.js");
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
const { DecisionGapError, nextRound, recordAnswer } = require("./lib/decision-gap.js");
const { DoctorUsageError, renderDoctor, runDoctor } = require("./lib/ospec-doctor.js");
const { addedTests, applyDerivation, classifyPath, deriveSignals, persistentHits, requireDeclaredCeremony } = require("./lib/idd-signals.js");
const { CHANGELOG_NONE, TeamProfileError, resolveTeam } = require("./lib/team-profile.js");
const { writeFileAtomic } = require("./lib/atomic-write.js");
const { IddStoreError, changeDir, listChanges, mutateChange, readChange, serializeState } = require("./lib/idd-store.js");
const { withFileLock } = require("./lib/ospec-state.js");
const {
  EMPTY_TREE,
  IddWorkspaceError,
  commitTree,
  readArchitecture,
  readBaseConfig,
  readCheckTreeFingerprint,
  readDecisionRecords,
  readFitnessSources,
  readGitDiff,
  readHead,
  readKnowledgeSources,
  readProjectContext,
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
                      (--open-fact <question>... | --no-open-facts --basis <text>)
                      [--request <text>] [--answer <text> --source user|user-unverified]
  ospec record intent --change <id> --kind feature --summary <text> --acceptance <text> --request <text>
                      (--open-fact <category>:<question> | --cite <category>=<path:line> | --quote <category>=<fragment>)...
                      categories: ${CATEGORY_IDS.join(", ")}; at least one is an --open-fact
  ospec record intent --change <id> --ambiguous --request <text>
  ospec record assumption --change <id> --text <text>
  ospec record signal --change <id> --signal <id> --reason <text> [--source declaration|diff]
  ospec record gate --change <id> --gate <id> (--open [--reason <text>] | --resolve --answer <text> --source user|user-unverified)
  ospec record withdraw --change <id> --obligation <id> --reason <text>
  ospec record retract --change <id> --signal <id> --reason <text> [--answer <text> --source user|user-unverified]
  ospec record impact --change <id> (--adr <id> | --quality <id>)
                      [--impact <none|conforms|amends|supersedes|contradicts> --reason <text>] [--record <new ADR>]
  ospec record fitness --change <id> (--adr <id> | --quality <id>) --evidence <text>
  ospec signals --change <id> [--path <file>]... [--work-units <n>] [--decision]
                [--operation <op>]... [--adr <id>]... [--quality <id>]... [--diff] [--base <ref>]
  ospec check --change <id> [--base <ref>]
  ospec run --change <id> --obligation <repro-test|tdd-red-green|migration-compat-and-test> --command <cmd>
            [--unit <name>] [--plan <compatibility or rollback plan>]
  ospec review start|correct --change <id> [--base <ref>]
  ospec review record|validate --change <id> --result <json>|@<file>
  ospec close --change <id>
  ospec doctor [--target <host>] [--json]
  ospec team [--mode <idd|sdd>] [--json]
  ospec snapshot [--roadmap <path>] [--out <file>] [--json]
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
  --roadmap     snapshot: the roadmap to read (default: ${DEFAULT_ROADMAP})
  --out <file>  snapshot: write the snapshot to this file instead of stdout
`;

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
  decision: { type: "boolean" },
  operation: { type: "string", multiple: true },
  adr: { type: "string", multiple: true },
  quality: { type: "string", multiple: true },
  impact: { type: "string" },
  record: { type: "string" },
  evidence: { type: "string" },
  diff: { type: "boolean" },
  base: { type: "string" },
  command: { type: "string" },
  unit: { type: "string" },
  plan: { type: "string" },
  result: { type: "string" },
  root: { type: "string" },
  target: { type: "string" },
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
      return (state) =>
        recordIntent(state, {
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
  return Boolean(values.path?.length || values["work-units"] !== undefined || values.decision || values.operation?.length);
}

async function signals(root, values) {
  if (!values.change) throw new UsageError("signals needs --change <id>");
  const refs = declaredReferences(values);
  const declaration = {
    paths: values.path || [],
    workUnits: parseWorkUnits(values["work-units"]),
    nonObviousDecision: values.decision === true,
    operations: values.operation || [],
    adrs: refs.filter((ref) => ref.kind === "adr").map((ref) => ref.id),
    scenarios: refs.filter((ref) => ref.kind === "scenario").map((ref) => ref.id),
  };
  requireKnownReferences(root, refs);
  const context = readProjectContext(root);
  const { map, sources, warnings } = readKnowledgeSources(root);
  const stored = values.diff || values.base ? await readChange(root, values.change) : null;
  const diff = values.diff || values.base ? readGitDiff(root, { base: diffBase(values, stored) }) : {};
  let derivation;
  const { state, changed, added } = await mutateChange(
    root,
    values.change,
    existing((current) => {
      const intent = current.intent && current.intent.kind ? current.intent : null;
      derivation = deriveSignals({ intent, strictTdd: context.strictTdd, declaration, diff, patterns: context.patterns, knowledge: { map, sources }, retracted: current.retracted });
      return applyDerivation(current, derivation, { plan: declaresPlan(values) ? declaration : null });
    }),
  );
  const { signals: derived, gates, floor } = derivation;
  const result = { change: state.change, changed, added, signals: derived, gates, floor, next: nextForChange(state, context) };
  if (warnings.length) result.warnings = warnings;
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

function featureCoverage(root, values) {
  const resolved = resolveFeatureCoverage({
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

// What checks-changed contrasts (B7, E1.53): the checks and the ceremony
// settings of idd/config.yaml against the ones it declared at `base`.
function readConfigChange(root, base, context) {
  const baseConfig = readBaseConfig(root, base);
  return { baseChecks: baseConfig.checks, checks: context.checks, baseConfig: ceremonyConfig(baseConfig), config: ceremonyConfig(context) };
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
  const diff = readGitDiff(root, { base: diffBase(values, current) });
  requireDeclaredCeremony(current, { diff, contractPatterns: context.contractPatterns });
  const configChange = readConfigChange(root, diffBase(values, current), context);
  const { map, sources, warnings } = readKnowledgeSources(root);
  // The fitness checks follow the references this check's diff derives.
  const preview = applyDerivation(current, deriveSignals({ intent: current.intent, strictTdd: context.strictTdd, diff, patterns: context.patterns, knowledge: { map, sources }, retracted: current.retracted })).state;
  const fitness = changeFitness(root, preview);
  warnings.push(...fitness.warnings);
  const treeBefore = readTreeFingerprint(root);
  const checkTreeBefore = readCheckTreeFingerprint(root, context.checks);
  const checks = context.checks.map(({ name, command }) => {
    const result = { name, command, ...runCommand(command, { cwd: root }) };
    const tests = countTests(result.output_tail);
    if (tests != null) result.tests = tests;
    return result;
  });
  const fitnessRuns = fitness.checks.map(({ kind, id, command }) => ({ ref: `${kind}:${id}`, command, ...runCommand(command, { cwd: root }) }));
  const tree = readTreeFingerprint(root);
  const checkTree = readCheckTreeFingerprint(root);
  const recordedAt = new Date().toISOString();
  const contractPaths = classifyContractPaths(diff.paths, context.contractPatterns);
  const records = readDecisionRecords(root, (current.impacts || []).filter((entry) => entry.record).map((entry) => entry.record));
  const reasons = {};
  const reviewed = currentReview(current);
  let reviewedChanged = false;
  if (reviewed) {
    const trees = reviewTrees(root, values, current);
    reviewedChanged = reviewedPathsChanged(root, reviewed, trees.tree, trees.numstat, context.patterns);
  }

  let added;
  const { state, changed } = await mutateChange(
    root,
    values.change,
    existing((stored) => {
      const derivation = deriveSignals({
        intent: stored.intent,
        strictTdd: context.strictTdd,
        diff,
        patterns: context.patterns,
        knowledge: { map, sources },
        retracted: stored.retracted,
      });
      const derived = applyDerivation(stored, derivation);
      added = derived.added;
      const reopened = reopenDerived(derived.state).state;
      const gated = settleChecksChange(reopened, configChange);
      const runs = checks.map((result) => runRecord("checks", result.command, result, checkTreeBefore, recordedAt, { name: result.name }));
      const recorded = recordRuns(gated, runs);
      const fitnessRecorded = recordRuns(recorded.state, fitnessRuns.map((result) => runRecord("fitness", result.command, result, checkTreeBefore, recordedAt, { ref: result.ref })));
      const settled = settleChecks(fitnessRecorded.state, { tree: checkTree, runIds: recorded.ids, recordedAt });
      const tested = settleBoundary(settled.state, { tree: checkTree, runIds: recorded.ids, recordedAt, tests: addedTests(diff) });
      if (tested.reason) reasons["boundary-tests"] = tested.reason;
      const bound = settleTreeBound(tested.state, { tree });
      const contract = settleContract(bound, { tree: checkTree, checkEvidence: settled.evidence, ...contractPaths, recordedAt });
      if (contract.reason) reasons["contract-spec-and-test"] = contract.reason;
      const impacts = settleImpacts(contract.state, { records, fitness: { tree: checkTree, runIds: fitnessRecorded.ids }, recordedAt });
      if (impacts.reason) reasons["adr-impact-declaration"] = impacts.reason;
      const fresh = settleReviewFreshness(impacts.state, { reviewedChanged });
      return { state: fresh, changed: changedFrom(stored, fresh) };
    }),
  );
  const verdict = checkVerdict(state, {
    checks: context.checks,
    candidateCommand: context.candidateCommand,
    results: checks,
    treeChanged: tree !== treeBefore || checkTree !== checkTreeBefore,
    reasons,
    livingDoc: readLivingDoc(root, state),
  });
  const result = { change: state.change, changed, added, checks, tree: checkTree, ...verdict, next: nextForChange(state, context) };
  const view = fitnessView(fitness, fitnessRuns);
  if (view) result.fitness = view;
  if (warnings.length) result.warnings = warnings;
  return result;
}

// Runs one test command for an obligation `ospec run` proves and records the
// run: a passing run after a failing one on another tree records a red → green
// pair, and a passing migration test records its evidence with the plan.
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
  const tree = readTreeFingerprint(root);
  const result = runCommand(values.command, { cwd: root });
  const recordedAt = new Date().toISOString();
  const extra = values.unit ? { unit: values.unit } : {};

  let runId;
  let evidence;
  const { state } = await mutateChange(
    root,
    values.change,
    existing((stored) => {
      const recorded = recordRuns(stored, [runRecord(purpose, values.command, result, tree, recordedAt, extra)]);
      [runId] = recorded.ids;
      const settled = migration
        ? settleMigration(recorded.state, { runId, plan: values.plan.trim(), recordedAt })
        : settlePair(recorded.state, { obligation: values.obligation, runId, recordedAt });
      evidence = settled.evidence;
      return { state: settled.state, changed: true };
    }),
  );
  const verdict = checkVerdict(state, { ...context, livingDoc: readLivingDoc(root, state) });
  return { change: state.change, run: { id: runId, ...extra, ...result }, evidence, ...verdict, next: nextForChange(state, context) };
}

// --- close (REQ-idd-009, REQ-idd-017) ---------------------------------------

function livingDocFile(root, changeId) {
  return path.join(changeDir(root, changeId), LIVING_DOC_FILE);
}

function readLivingDoc(root, state) {
  if (!state.obligations.some((entry) => entry.id === "living-doc" && entry.status !== "withdrawn")) return null;
  try {
    return livingDocStatus(fs.readFileSync(livingDocFile(root, state.change), "utf8"));
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
    return {
      change: state.change,
      status: state.status,
      closed_at: state.closed_at,
      archive,
      assumptions: state.assumptions || [],
      reviews: reviewAttestations(state),
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
    next: nextForChange(state),
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

async function run(command, positionals, values) {
  const root = values.root || process.cwd();
  if (command === "status") {
    const states = await listChanges(root);
    return statusOf(values.change ? states.filter((s) => s.change === values.change) : states);
  }
  if (command === "next") {
    requireWorkTree(root);
    try {
      const states = await listChanges(root);
      const next = nextForProject(states, { change: values.change });
      if (!next.change) return next;
      const knowledge = changeKnowledge(root, states.find((state) => state.change === next.change));
      const context = { change: values.change, knowledge, ...nextTeamContext(root) };
      // Intent gates and change selection do not depend on configuration.
      if (next.next_step.action !== "satisfy-obligation" || !["checks-pass", "contract-spec-and-test"].includes(next.next_step.obligation)) {
        return nextForProject(states, context);
      }
      return nextForProject(states, { ...context, ...readProjectContext(root) });
    } catch (error) {
      if (/^unknown change/.test(error.message)) throw new IddRecordError("unknown-change", error.message);
      throw error;
    }
  }
  if (command === "signals") return signals(root, values);
  if (command === "check") return check(root, values);
  if (command === "run") return runObligation(root, values);
  if (command === "review") return review(root, positionals, values);
  if (command === "close") return close(root, values);
  if (command === "doctor") return runDoctor({ root, target: values.target ?? null });
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
    const { state, changed } = await mutateChange(root, values.change, reducer);
    return { record: type, change: state.change, changed, next: nextForChange(state) };
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

function describeSignals(result) {
  const lines = result.signals.map((s) => `${s.id} (${s.source}): ${s.reason}`);
  for (const gate of result.gates) lines.push(`gate ${gate.id}: ${gate.reason}`);
  const added = [...result.added.signals, ...result.added.gates.map((g) => `gate:${g}`)];
  if (added.length) lines.push(`recorded: ${added.join(", ")}`);
  else if (result.changed) lines.push("recorded the plan; every derived signal was already recorded");
  else lines.push("no change: the plan and every derived signal were already recorded");
  if (result.floor) lines.push(`floor: ${result.floor}`);
  for (const warning of result.warnings || []) lines.push(`warning: ${warning}`);
  lines.push(describeNext(result.next));
  return lines.join("\n");
}

function describeVerdict(result) {
  const lines = [];
  if (result.verdict === "ready") lines.push(`ready: ${result.change} can close`);
  for (const entry of result.missing) lines.push(`missing ${entry.obligation}: ${entry.reason}`);
  if (result.decision) {
    const { gate, question, reason } = result.decision;
    lines.push(`needs your decision: ${gate}: ${question}${reason ? ` (${reason})` : ""}`);
  }
  return lines;
}

function describeRun(label, run) {
  const lines = [`${label}: exit ${run.exit_code}`];
  if (run.exit_code !== 0) for (const line of run.output_tail) lines.push(`  ${line}`);
  return lines;
}

function describeCheck(result) {
  const lines = describeVerdict(result);
  for (const run of result.checks) lines.push(...describeRun(`check ${run.name}`, run));
  lines.push(...describeFitness(result.fitness));
  const added = [...result.added.signals, ...result.added.gates.map((g) => `gate:${g}`)];
  if (added.length) lines.push(`recorded from the diff: ${added.join(", ")}`);
  for (const warning of result.warnings || []) lines.push(`warning: ${warning}`);
  lines.push(describeNext(result.next));
  return lines.join("\n");
}

function describeRunResult(result) {
  const lines = describeRun(`${result.run.id}`, result.run);
  lines.push(result.evidence ? `recorded evidence ${result.evidence}` : "no evidence recorded by this run");
  lines.push(...describeVerdict(result), describeNext(result.next));
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
  lines.push(...describeVerdict(result), describeNext(result.next));
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
  const records = result.records?.length || 0;
  const lines = [body, ...describeCloseDelivery(result)];
  if (records) lines.push(`${records} knowledge record(s) to keep in cross-session memory (see --json)`);
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

// The progress snapshot, on stdout or written whole to --out; an invalid one
// is refused before anything is written (REQ-idd-026).
async function snapshot(root, values) {
  const { roadmap, snapshot: document, text } = buildSnapshot({ root, roadmap: values.roadmap ?? DEFAULT_ROADMAP });
  if (values.out === undefined) return { text };
  await writeFileAtomic(path.resolve(root, values.out), text);
  return { roadmap, out: values.out, phases: document.phases.length, bytes: Buffer.byteLength(text) };
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
  if (command === "snapshot") return `snapshot: ${result.phases} phases from ${result.roadmap} written to ${result.out} (${result.bytes} bytes)`;
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
  return `${head}\n${describeNext(result.next)}`;
}

async function main(argv = process.argv.slice(2)) {
  const wantsJson = argv.includes("--json");
  let command;
  try {
    const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    if (values.help) {
      process.stdout.write(USAGE);
      return 0;
    }
    command = positionals[0];
    const result = await run(command, positionals.slice(1), values);
    // The snapshot is JSON already: stdout holds it alone, with or without --json.
    if (command === "snapshot" && "text" in result) process.stdout.write(result.text);
    else if (wantsJson) process.stdout.write(`${JSON.stringify({ ok: true, command, ...result }, null, 2)}\n`);
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
    if (wantsJson) {
      const how = error.how ? { how: error.how } : {};
      process.stdout.write(`${JSON.stringify({ ok: false, command, error: { code, message: error.message, ...how } }, null, 2)}\n`);
    } else {
      process.stderr.write(`ospec: ${error.message} (${code})\n${error.how ? `${error.how}\n` : ""}${usage ? USAGE : ""}`);
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
