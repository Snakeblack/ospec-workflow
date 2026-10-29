"use strict";

// Pure, deterministic reads of idd-state/v1 and supplied check and knowledge
// context for `ospec next` and `ospec status` (REQ-idd-011, REQ-idd-021). The
// same inputs yield the same output, whatever order the state's signals were
// recorded in.

const { CHANGE_ROOT, DECISIONS_ROOT, GATES, IMPACTS, INTENT_KINDS, LIVING_DOC_FILE, OBLIGATIONS, RUN_EVIDENCE } = require("./idd-contract.js");
const { configureChecksStep } = require("./idd-checks-config.js");
const { COVERAGE_RULES, featureCommand, projectCategories } = require("./idd-facts.js");
const { classifyPath } = require("./idd-signals.js");

// Order in which pending obligations are worked: evidence produced while
// building comes first, checks run on the finished diff, and the living
// document is confirmed current at close (REQ-idd-004).
const WORK_ORDER = Object.freeze([
  "repro-test",
  "tdd-red-green",
  "boundary-tests",
  "contract-spec-and-test",
  "migration-compat-and-test",
  "adr-impact-declaration",
  "trust-review",
  "checks-pass",
  "living-doc",
]);

const GATE_QUESTIONS = Object.freeze({
  "ambiguous-intent": "What must this change achieve? Confirm its kind, summary and acceptance.",
  "open-facts": "Before the change is built, answer these behavior questions that neither the request nor the code settles.",
  "adr-amend-or-contradict": "This change amends or contradicts an ADR. Approve the amendment?",
  "irreversible-operation": "This operation is destructive or irreversible. Approve it?",
  "review-limit": "The trust reviews of this change are used up. Authorize one more trust review?",
  "checks-changed": "The checks or the ceremony settings (strict_tdd, impact, contracts) in idd/config.yaml differ from the change's base. Approve them for this change?",
});

const EVIDENCE_BY_OBLIGATION = new Map(OBLIGATIONS.map((obligation) => [obligation.id, obligation.evidence]));

// The ospec command that records each obligation's evidence (REQ-idd-014).
const HOW = Object.freeze({
  "checks-pass": (change) => `ospec check --change ${change}; a run that reports tests 0 is not evidence`,
  "boundary-tests": (change) =>
    `ospec check --change ${change} after the diff adds a test for the product code; the output must report tests greater than 0, and the test must fail against the base product`,
  "repro-test": (change) =>
    `ospec run --change ${change} --obligation repro-test --command "<test>": once failing before the fix, again passing after it, with the test in a test file of the diff; it must also fail against the base product`,
  "tdd-red-green": (change) =>
    `ospec run --change ${change} --obligation tdd-red-green --command "<test>" [--unit <name>]: failing before the code, passing after it, with the test in a test file of the diff; it must also fail against the base product`,
  // The project's own patterns, so the agent need not read the CLI to learn
  // what counts as a contract document (#400).
  "contract-spec-and-test": (change, { contractPatterns } = {}) =>
    contractPatterns
      ? `in one diff, touch a contract document (${contractPatterns.documents.join(", ")}) and its test (${contractPatterns.tests.join(", ")}), then ospec check --change ${change}; if the project keeps its contract elsewhere, propose contracts.documents for idd/config.yaml to the user and edit it only after approval`
      : `in one diff, touch a contract document and its test (contracts.documents and contracts.tests of idd/config.yaml), then ospec check --change ${change}`,
  "living-doc": (change) =>
    `the CLI writes the Plan of idd/${change}/change.md from --path and its Decisions from --decision "<text>"; add by hand what they leave out, then ospec close --change ${change}`,
  "trust-review": (change) =>
    `ospec review start --change ${change}, dispatch review-trust on the returned paths, then ospec review record --change ${change} --result '<findings json>'`,
  "migration-compat-and-test": (change) =>
    `ospec run --change ${change} --obligation migration-compat-and-test --command "<migration test>" --plan "<compatibility or rollback>"`,
  "adr-impact-declaration": (change) =>
    `ospec record impact --change ${change} (--adr <id> | --quality <id>) --impact <none|conforms|amends|supersedes|contradicts> --reason "<why>" [--record <new ADR>], then ospec check --change ${change}`,
});

// The literal command of each step (E1.45, B5): the agent runs it as written,
// filling in only the <placeholders> the CLI cannot know. After a red run, the
// command of that run replaces "<test>", so the green run repeats it exactly.
const INTENT_FACTS = '(--open-fact "<question>"... | --no-open-facts --basis "<why>")';
const INTENT_FIELDS = `--kind <${INTENT_KINDS.join("|")}> --summary "<what>" --acceptance "<observable result>" ${INTENT_FACTS}`;
const USER_ANSWER = '--answer "<the user\'s words>" --source user';

// One shell word in bash, zsh and fish: double quotes, or single quotes for a
// value whose quotes, $, backticks or backslashes double quotes would expand.
function shellArg(value) {
  return /["$`\\]/.test(value) ? `'${value.replace(/'/g, "'\\''")}'` : `"${value}"`;
}

// The run purpose of each obligation `ospec run` proves.
const RUN_PURPOSE = Object.freeze({
  "repro-test": RUN_EVIDENCE["repro-run-pair"],
  "tdd-red-green": RUN_EVIDENCE["tdd-red-green"],
  "migration-compat-and-test": RUN_EVIDENCE["migration-test"],
});

function runCommand(state, obligation, placeholder, extra = "") {
  const red = (state.runs || []).filter((run) => run.purpose === RUN_PURPOSE[obligation] && run.exit_code !== 0).at(-1);
  const unit = obligation === "tdd-red-green" ? ` --unit ${red?.unit ? (/^[\w.-]+$/.test(red.unit) ? red.unit : shellArg(red.unit)) : "<name>"}` : "";
  return `ospec run --change ${state.change} --obligation ${obligation} --command ${red ? shellArg(red.command) : `"${placeholder}"`}${unit}${extra}`;
}

// The first declared reference without its impact, or the check that settles
// the rest of the declaration.
function impactCommand(state) {
  const next = (state.impacts || []).find((entry) => entry.impact == null);
  if (!next) return `ospec check --change ${state.change}`;
  return `ospec record impact --change ${state.change} --${next.kind === "adr" ? "adr" : "quality"} ${next.id} --impact <${IMPACTS.join("|")}> --reason "<why>"`;
}

const OBLIGATION_COMMAND = Object.freeze({
  "repro-test": (state) => runCommand(state, "repro-test", "<test>"),
  "tdd-red-green": (state) => runCommand(state, "tdd-red-green", "<test>"),
  "migration-compat-and-test": (state) => runCommand(state, "migration-compat-and-test", "<migration test>", ' --plan "<compatibility or rollback>"'),
  "adr-impact-declaration": impactCommand,
  "trust-review": (state) => `ospec review start --change ${state.change}`,
  "living-doc": (state) => `ospec close --change ${state.change}`,
});

// The obligations ospec check settles. Once only they and the living document
// are pending, with every declared impact recorded, the check closes the
// change in the same call (E4.15).
const CHECK_SETTLED = Object.freeze(["boundary-tests", "contract-spec-and-test", "adr-impact-declaration", "checks-pass"]);

function closesWithCheck(state, pending) {
  const impacts = state.impacts || [];
  const settled = (id) => CHECK_SETTLED.includes(id) && (id !== "adr-impact-declaration" || (impacts.length > 0 && impacts.every((entry) => entry.impact != null)));
  return pending.every(({ id }) => id === "living-doc" || settled(id));
}

function obligationCommand(state, obligation, pending) {
  const check = `ospec check --change ${state.change}`;
  const command = OBLIGATION_COMMAND[obligation] ? OBLIGATION_COMMAND[obligation](state) : check;
  return command === check && closesWithCheck(state, pending) ? `${check} --close` : command;
}

function gateCommand(state, gate) {
  if (gate === "ambiguous-intent") {
    return `ospec record intent --change ${state.change} --request ${shellArg(state.intent.request)} ${INTENT_FIELDS} ${USER_ANSWER}`;
  }
  return `ospec record gate --change ${state.change} --gate ${gate} --resolve ${USER_ANSWER}`;
}

// Obligations whose evidence runs the declared checks: without one, the next
// step is to configure them.
const CHECKS_REQUIRED = Object.freeze(["checks-pass", "contract-spec-and-test"]);

// Signals that mark an architecture boundary: a change that crosses one and
// declares no ADR may be making an architecture decision (E3.1).
const BOUNDARY_SIGNALS = Object.freeze(["public-contract", "persistent-data", "security-boundary"]);

// The promotion check (E3.1): a suggestion, never a gate. It asks the agent to
// weigh an ADR when the change crosses a boundary without declaring one; a
// development decision stays in the living document.
function adrSuggestion(state) {
  if (state.status !== "open" || state.signals.some((signal) => signal.id === "adr-or-quality-attribute")) return null;
  const boundary = state.signals.find((signal) => BOUNDARY_SIGNALS.includes(signal.id));
  if (!boundary) return null;
  return {
    id: "adr-promotion",
    reason: boundary.reason,
    how: `if the change takes an architecture decision, propose an ADR under ${DECISIONS_ROOT}/ to the user and declare the ADRs it touches with ospec signals --change ${state.change} --adr <id>; a development decision stays in ${CHANGE_ROOT}/${state.change}/${LIVING_DOC_FILE}`,
  };
}

// The steps taken before anything is built: only there is the foundation
// suggestion offered (E4.10).
const FOUNDATION_STEPS = Object.freeze(["open-change", "resolve-gate", "declare-plan"]);

// The documentation foundation writes: any file under them means the project
// has started recording its product or architecture.
const FOUNDATION_ROOTS = Object.freeze(["docs/product/", "docs/architecture/"]);

// The foundation suggestion (E4.10): a suggestion, never a gate, while the
// project's files hold no source code, product or test, and nothing under
// docs/product or docs/architecture. Without a file list there is none.
function foundationSuggestion(files) {
  if (!files) return null;
  if (files.some((file) => ["product", "test"].includes(classifyPath(file)) || FOUNDATION_ROOTS.some((root) => file.startsWith(root)))) return null;
  return {
    id: "foundation",
    reason: "the project has no source code and no docs/product or docs/architecture",
    how: "offer the user the foundation skill before the first change, as an option: it records the product docs, ADRs and idd/config.yaml and writes no code; if the user declines, go on with the change",
  };
}

// The plan is declared once `ospec signals` recorded it, or once the change
// has evidence of its own: a signal the diff derived or a run the CLI observed
// (E1.11). States recorded before the plan existed are judged by the latter.
function planDeclared(state) {
  return state.plan != null || state.signals.some((signal) => signal.source === "diff") || (state.runs || []).length > 0;
}

function declarePlanStep(change) {
  return {
    action: "declare-plan",
    how: `ospec signals --change ${change} [--path <file>]... [--work-units <n>] [--decision "<text>"]... [--operation <op>]`,
    command: `ospec signals --change ${change} [--path <file>]...`,
  };
}

function byWorkOrder(left, right) {
  return WORK_ORDER.indexOf(left.id) - WORK_ORDER.indexOf(right.id);
}

function byGateOrder(left, right) {
  return GATES.indexOf(left.id) - GATES.indexOf(right.id);
}

function pendingDecision(state, gate) {
  const reason = gate.id === "ambiguous-intent" ? state.intent.request : gate.reason;
  const decision = { gate: gate.id, question: GATE_QUESTIONS[gate.id] };
  if (reason) decision.reason = reason;
  if (gate.id === "open-facts") {
    const facts = state.facts || {};
    decision.questions = facts.open || (facts.coverage || []).flatMap((entry) => (entry.question ? [entry.question] : []));
  }
  return decision;
}

// The steps where the branching decides something: the work starts on a
// branch, and the change is delivered once it closes.
const DELIVERY_STEPS = Object.freeze(["declare-plan", "close"]);

// A project that declares neither a profile nor delivery.branching gets the
// recommended value as a suggestion, never as a step (REQ-idd-023).
function branchingSuggestion(delivery) {
  return {
    id: "branching-undeclared",
    reason: `delivery.branching is not declared; ${delivery.branching} is recommended`,
    how: `propose delivery.branching: ${delivery.branching} to the user with its reasons, and write it to ${CHANGE_ROOT}/config.yaml only after approval`,
  };
}

// Close writes the changelog and proposes the release only once they are
// declared, so a value the profile recommends is still a suggestion
// (REQ-idd-025).
const CLOSE_ACTS_ON = Object.freeze({ changelog: "writes no changelog entry", release: "proposes no release" });

function closeOptionSuggestions(delivery) {
  return Object.entries(CLOSE_ACTS_ON)
    .filter(([key]) => delivery[key] && delivery[key].source !== "idd/config.yaml")
    .map(([key, until]) => ({
      id: `${key}-undeclared`,
      reason: `delivery.${key} is not declared; ${delivery[key].value} is recommended`,
      how: `propose delivery.${key}: ${delivery[key].value} to the user with its reasons, and write it to ${CHANGE_ROOT}/config.yaml only after approval; until then ospec close ${until}`,
    }));
}

function nextForChange(state, { checks, candidateCommand, contractPatterns, knowledge, team, delivery, projectFiles } = {}) {
  const pending = state.obligations
    .filter((obligation) => obligation.status === "pending")
    .sort(byWorkOrder)
    .map(({ id, signal }) => ({ id, signal, evidence: EVIDENCE_BY_OBLIGATION.get(id) }));
  const openGates = state.gates.filter((gate) => gate.status === "open").sort(byGateOrder);
  const livingDoc = state.obligations.some((o) => o.id === "living-doc" && o.status !== "withdrawn");

  let nextStep;
  if (state.status === "closed") {
    nextStep = { action: "none", command: null };
  } else if (openGates.length > 0) {
    // Every gate is the user's decision, taken before the work it decides
    // (REQ-idd-008, REQ-idd-018), in gate order: ambiguous-intent first.
    nextStep = { action: "resolve-gate", gate: openGates[0].id, command: gateCommand(state, openGates[0].id) };
  } else if (!planDeclared(state)) {
    // The plan is declared before anything is edited (E1.11).
    nextStep = declarePlanStep(state.change);
  } else if (pending.length > 0) {
    nextStep = { action: "satisfy-obligation", obligation: pending[0].id, evidence: pending[0].evidence };
    if (HOW[pending[0].id]) nextStep.how = HOW[pending[0].id](state.change, { contractPatterns });
    nextStep.command = obligationCommand(state, pending[0].id, pending);
    if (checks?.length === 0 && CHECKS_REQUIRED.includes(pending[0].id)) {
      // Once the user approved the checks and they are written, next goes on.
      nextStep = { ...configureChecksStep(candidateCommand), command: `ospec next --change ${state.change} --json` };
    }
  } else {
    nextStep = { action: "close", command: `ospec close --change ${state.change}` };
  }

  const result = {
    change: state.change,
    status: state.status,
    intent: state.intent,
    pending_obligations: pending,
    pending_decision: state.status === "open" && openGates.length > 0 ? pendingDecision(state, openGates[0]) : null,
    next_step: nextStep,
    knowledge_refs: livingDoc ? [`${CHANGE_ROOT}/${state.change}/${LIVING_DOC_FILE}`] : [],
  };
  // The ids of the knowledge of the touched components, with their currency,
  // and a warning for each stale or absent one (E3.2, REQ-idd-021). The caller
  // resolves them from disk; knowledge_refs keeps its meaning.
  if (knowledge) {
    result.references = knowledge.references;
    result.warnings = knowledge.warnings;
    // The fitness functions of the change's references (E3.3, REQ-idd-022).
    if (knowledge.fitness) result.fitness = knowledge.fitness;
  }
  const suggestions = [adrSuggestion(state), FOUNDATION_STEPS.includes(nextStep.action) && foundationSuggestion(projectFiles)].filter(Boolean);
  // How the change reaches the default branch, with its reasons and rules,
  // where it decides something (REQ-idd-023).
  if (delivery && DELIVERY_STEPS.includes(nextStep.action)) {
    result.delivery = delivery;
    if (delivery.source === "recommended") suggestions.push(branchingSuggestion(delivery));
    suggestions.push(...closeOptionSuggestions(delivery));
  }
  if (suggestions.length > 0) result.suggestions = suggestions;
  // The delivery and mentorship the team profile decides (E3.4, REQ-idd-023).
  if (team) result.team = team;
  return result;
}

function nextForProject(states, { change, ...context } = {}) {
  if (change) {
    const state = states.find((entry) => entry.change === change);
    if (!state) throw new Error(`unknown change: ${change}`);
    return nextForChange(state, context);
  }
  const open = states.filter((state) => state.status === "open");
  if (open.length === 0) {
    // A feature gets the template of the categories its project covers
    // (E4.16), so its first record intent need not be refused to learn them.
    const { categories, omitted, reason } = projectCategories({ files: context.projectFiles, classify: classifyPath });
    const feature = { command: featureCommand(categories), how: COVERAGE_RULES, categories };
    if (omitted.length > 0) Object.assign(feature, { omitted, reason });
    const result = { change: null, next_step: { action: "open-change", command: `ospec record intent --change <id> ${INTENT_FIELDS}`, feature } };
    const foundation = foundationSuggestion(context.projectFiles);
    if (foundation) result.suggestions = [foundation];
    return result;
  }
  if (open.length === 1) return nextForChange(open[0], context);
  const changes = open.map((state) => state.change).sort();
  return {
    change: null,
    next_step: { action: "choose-change", changes, commands: changes.map((change) => `ospec next --change ${change} --json`) },
  };
}

function idsWithStatus(state, status) {
  return state.obligations
    .filter((obligation) => obligation.status === status)
    .sort(byWorkOrder)
    .map((obligation) => obligation.id);
}

function statusOf(states) {
  const changes = [...states]
    .sort((left, right) => (left.change < right.change ? -1 : left.change > right.change ? 1 : 0))
    .map((state) => ({
      change: state.change,
      status: state.status,
      kind: state.intent.kind,
      summary: state.intent.summary,
      obligations: {
        pending: idsWithStatus(state, "pending"),
        satisfied: idsWithStatus(state, "satisfied"),
        withdrawn: idsWithStatus(state, "withdrawn"),
      },
      open_gates: state.gates
        .filter((gate) => gate.status === "open")
        .sort(byGateOrder)
        .map((gate) => gate.id),
    }));
  return { changes };
}

module.exports = {
  CHECKS_REQUIRED,
  FOUNDATION_STEPS,
  GATE_QUESTIONS,
  HOW,
  WORK_ORDER,
  foundationSuggestion,
  nextForChange,
  planDeclared,
  nextForProject,
  statusOf,
};
