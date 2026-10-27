"use strict";

// E1.2 ospec-cli-core: `next` and `status` are pure, deterministic reads of
// idd-state/v1 (openspec/specs/idd/spec.md, REQ-idd-011). The reference
// fixtures of E1.1 pin the expected next step of each change type.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { foundationSuggestion, nextForChange, nextForProject, statusOf } = require("./idd-next.js");
const { recordEvidence, recordGate, recordImpact, recordIntent, recordPlan, recordReferences, recordSignal } = require("./idd-record.js");

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "idd");
const NO_OPEN_FACTS = Object.freeze({ noOpenFacts: true, basis: "The request fixes every behavior." });

function loadFixtures() {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8")));
}

// Builds the state a fixture reaches through the record reducers, recording its
// expected signals in the given order.
function stateFromFixture(fixture, signalOrder = (ids) => ids) {
  const { input, expected } = fixture;
  const feature = !input.intent.ambiguous && input.intent.kind === "feature";
  const intent = input.intent.ambiguous
    ? { change: fixture.id, ambiguous: true, request: input.request }
    : {
        change: fixture.id,
        kind: input.intent.kind,
        summary: input.intent.summary,
        acceptance: input.intent.acceptance,
        ...(feature ? { coverage: require("./idd-facts.js").citedCoverage() } : NO_OPEN_FACTS),
      };
  let state = recordIntent(null, intent).state;
  if (!input.intent.ambiguous) {
    state = recordPlan(state, {
      paths: input.paths,
      workUnits: input.work_units,
      nonObviousDecision: input.non_obvious_decision,
      operations: input.operations,
    }).state;
  }
  for (const id of signalOrder(expected.signals.filter((s) => s !== "always"))) {
    state = recordSignal(state, { id, reason: `fixture ${fixture.id}`, source: "declaration" }).state;
  }
  // Declared architecture references and their impacts (E3.1): a gated impact
  // opens adr-amend-or-contradict itself.
  const architecture = input.architecture;
  if (architecture) {
    const refs = [...architecture.adrs.map((id) => ({ kind: "adr", id })), ...architecture.quality.map((id) => ({ kind: "scenario", id }))];
    state = recordReferences(state, refs).state;
    for (const entry of architecture.impacts) {
      const ref = entry.adr ? { kind: "adr", id: entry.adr } : { kind: "scenario", id: entry.quality };
      state = recordImpact(state, { ...ref, impact: entry.impact, reason: entry.reason }).state;
    }
  }
  for (const id of expected.gates.filter((g) => g !== "ambiguous-intent")) {
    state = recordGate(state, { id, action: "open", reason: `fixture ${fixture.id}` }).state;
  }
  return state;
}

// An opened change whose plan is declared, so next moves on to its obligations.
function planned(input) {
  return recordPlan(recordIntent(null, input).state, { paths: ["src/a.js"] }).state;
}

for (const fixture of loadFixtures()) {
  test(`next is deterministic for fixture ${fixture.id}`, () => {
    const state = stateFromFixture(fixture);
    const result = nextForChange(state);
    const { expected } = fixture;

    assert.deepStrictEqual(result.pending_obligations.map((o) => o.id).sort(), expected.obligations);
    const step = { action: result.next_step.action };
    if (result.next_step.obligation) step.obligation = result.next_step.obligation;
    if (result.next_step.gate) step.gate = result.next_step.gate;
    step.pending_decision = result.pending_decision ? result.pending_decision.gate : null;
    assert.deepStrictEqual(step, expected.next);
    assert.deepStrictEqual(
      result.knowledge_refs,
      expected.living_doc ? [`idd/${fixture.id}/change.md`] : [],
    );
    // The ADR promotion check suggests, and never blocks (REQ-idd-020).
    assert.deepStrictEqual((result.suggestions || []).map((s) => s.id), expected.suggestions || []);

    const reversed = stateFromFixture(fixture, (ids) => [...ids].reverse());
    assert.strictEqual(JSON.stringify(nextForChange(reversed)), JSON.stringify(nextForChange(state)));
    assert.strictEqual(JSON.stringify(nextForChange(state)), JSON.stringify(result));
  });
}

test("next names the evidence kind of the obligation to satisfy", () => {
  const bug = loadFixtures().find((f) => f.id === "bug");
  const result = nextForChange(stateFromFixture(bug));
  assert.deepStrictEqual(result.next_step, {
    action: "satisfy-obligation",
    obligation: "repro-test",
    evidence: "repro-run-pair",
    how: `ospec run --change ${result.change} --obligation repro-test --command "<test>": once failing before the fix, again passing after it`,
    command: `ospec run --change ${result.change} --obligation repro-test --command "<test>"`,
  });
  assert.deepStrictEqual(result.pending_obligations, [
    { id: "repro-test", signal: "bug-fix", evidence: "repro-run-pair" },
    { id: "checks-pass", signal: "always", evidence: "check-run" },
  ]);
});

test("an ambiguous intent blocks on its gate with the original request", () => {
  const ambiguous = loadFixtures().find((f) => f.id === "ambiguous-intent");
  const result = nextForChange(stateFromFixture(ambiguous));
  assert.deepStrictEqual(result.next_step, {
    action: "resolve-gate",
    gate: "ambiguous-intent",
    command:
      'ospec record intent --change ambiguous-intent --request "Improve the login." --kind <bug|feature|refactor|docs> --summary "<what>" --acceptance "<observable result>" (--open-fact "<question>"... | --no-open-facts --basis "<why>") --answer "<the user\'s words>" --source user',
  });
  assert.strictEqual(result.pending_decision.gate, "ambiguous-intent");
  assert.ok(result.pending_decision.question.length > 0);
  assert.strictEqual(result.pending_decision.reason, "Improve the login.");
  assert.deepStrictEqual(result.pending_obligations, []);
});

test("open facts are asked before any obligation, as one batch of questions", () => {
  const questions = ["Is the threshold checked after the discount?", "Is an unknown code an error?"];
  let state = planned({ change: "discount-codes", kind: "bug", summary: "s", acceptance: "a", openFacts: questions });
  const result = nextForChange(state);
  assert.deepStrictEqual(result.next_step, {
    action: "resolve-gate",
    gate: "open-facts",
    command: 'ospec record gate --change discount-codes --gate open-facts --resolve --answer "<the user\'s words>" --source user',
  });
  assert.strictEqual(result.pending_decision.gate, "open-facts");
  assert.ok(result.pending_decision.question.length > 0);
  assert.deepStrictEqual(result.pending_decision.questions, questions);
  assert.deepStrictEqual(result.pending_obligations.map((o) => o.id), ["checks-pass"]);

  state = recordGate(state, { id: "open-facts", action: "resolve", answer: "after; it throws", source: "user" }).state;
  assert.deepStrictEqual(nextForChange(state).next_step.obligation, "checks-pass");
  assert.strictEqual(nextForChange(state).pending_decision, null);
});

test("a decision gate comes before the plan and the obligations it decides", () => {
  let state = recordIntent(null, { change: "cache-sums", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state;
  state = recordGate(state, { id: "adr-amend-or-contradict", action: "open", reason: "ADR-0003 forbids external caches" }).state;
  assert.deepStrictEqual(nextForChange(state).next_step.gate, "adr-amend-or-contradict");

  state = recordPlan(state, { paths: ["db/migrations/drop.sql"], operations: ["drop-column"] }).state;
  state = recordSignal(state, { id: "persistent-data", reason: "touches db/migrations/drop.sql", source: "declaration" }).state;
  state = recordGate(state, { id: "irreversible-operation", action: "open", reason: "declared drop-column" }).state;
  state = recordGate(state, { id: "adr-amend-or-contradict", action: "resolve", answer: "amend ADR-0003", source: "user" }).state;
  const result = nextForChange(state);
  assert.deepStrictEqual(result.next_step.gate, "irreversible-operation");
  assert.deepStrictEqual(result.pending_obligations.map((o) => o.id), ["migration-compat-and-test", "checks-pass"]);
  assert.strictEqual(result.pending_decision.gate, "irreversible-operation");

  state = recordGate(state, { id: "irreversible-operation", action: "resolve", answer: "approve", source: "user" }).state;
  assert.strictEqual(nextForChange(state).next_step.obligation, "migration-compat-and-test");
  // Checks are configured only after every decision is taken.
  assert.strictEqual(nextForChange(state, { checks: [] }).next_step.obligation, "migration-compat-and-test");
});

test("an open gate blocks close once obligations are settled, then close is next", () => {
  let state = planned({ change: "drop-fax", kind: "refactor", summary: "s", acceptance: "a", ...NO_OPEN_FACTS });
  state = recordGate(state, { id: "irreversible-operation", action: "open", reason: "drops fax_number" }).state;
  state = recordEvidence(state, { id: "ev-1", kind: "check-run", obligation: "checks-pass", recordedAt: "t" }).state;
  assert.deepStrictEqual(nextForChange(state).next_step.gate, "irreversible-operation");

  state = recordGate(state, { id: "irreversible-operation", action: "resolve", answer: "ok", source: "user" }).state;
  const result = nextForChange(state);
  assert.deepStrictEqual(result.next_step, { action: "close", command: "ospec close --change drop-fax" });
  assert.strictEqual(result.pending_decision, null);
});

test("a closed change has no next step", () => {
  const state = { ...recordIntent(null, { change: "fix-it", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state, status: "closed" };
  assert.deepStrictEqual(nextForChange(state).next_step, { action: "none", command: null });
});

test("missing checks are a prerequisite for check evidence, preserving reproduction and intent gates", () => {
  const context = { checks: [], candidateCommand: "pnpm test" };
  let state = planned({ change: "fix-it", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS });
  assert.strictEqual(nextForChange(state, context).next_step.action, "configure-checks");
  state = recordSignal(state, { id: "bug-fix", reason: "bug", source: "declaration" }).state;
  assert.strictEqual(nextForChange(state, context).next_step.obligation, "repro-test");
  state = recordEvidence(state, { id: "ev-1", kind: "repro-run-pair", obligation: "repro-test", recordedAt: "t" }).state;
  state = recordSignal(state, { id: "public-contract", reason: "CLI", source: "declaration" }).state;
  assert.strictEqual(nextForChange(state, context).next_step.action, "configure-checks");
  assert.strictEqual(nextForProject([state], context).next_step.candidate_command, "pnpm test");
  assert.strictEqual(nextForChange({ ...state, status: "closed" }, context).next_step.action, "none");

  const ambiguous = recordIntent(null, { change: "vague", ambiguous: true, request: "Improve it" }).state;
  assert.strictEqual(nextForChange(ambiguous, context).next_step.gate, "ambiguous-intent");
  const facts = recordIntent(null, { change: "facts", kind: "bug", summary: "s", acceptance: "a", openFacts: ["Which behavior?"] }).state;
  assert.strictEqual(nextForChange(facts, context).next_step.gate, "open-facts");
  assert.deepStrictEqual(nextForProject([state, facts], context).next_step.action, "choose-change");
});

test("project next picks the only open change, asks to choose among several, or to open one", () => {
  const a = recordIntent(null, { change: "b-change", kind: "docs", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state;
  const b = recordIntent(null, { change: "a-change", kind: "docs", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state;
  const closed = { ...recordIntent(null, { change: "c-change", kind: "docs", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state, status: "closed" };

  assert.deepStrictEqual(nextForProject([]).next_step, {
    action: "open-change",
    command:
      'ospec record intent --change <id> --kind <bug|feature|refactor|docs> --summary "<what>" --acceptance "<observable result>" (--open-fact "<question>"... | --no-open-facts --basis "<why>")',
  });
  assert.strictEqual(nextForProject([a, closed]).change, "b-change");
  assert.deepStrictEqual(nextForProject([a, b, closed]), {
    change: null,
    next_step: {
      action: "choose-change",
      changes: ["a-change", "b-change"],
      commands: ["ospec next --change a-change --json", "ospec next --change b-change --json"],
    },
  });
  assert.strictEqual(nextForProject([a, b], { change: "a-change" }).change, "a-change");
  assert.throws(() => nextForProject([a], { change: "missing" }), /unknown change: missing/);
});

test("status summarizes each change in id order", () => {
  let fix = recordIntent(null, { change: "fix-it", kind: "bug", summary: "Fix it.", acceptance: "a", ...NO_OPEN_FACTS }).state;
  fix = recordSignal(fix, { id: "bug-fix", reason: "bug", source: "declaration" }).state;
  fix = recordEvidence(fix, { id: "ev-1", kind: "check-run", obligation: "checks-pass", recordedAt: "t" }).state;
  const vague = recordIntent(null, { change: "improve-login", ambiguous: true, request: "Improve the login." }).state;

  assert.deepStrictEqual(statusOf([vague, fix]), {
    changes: [
      {
        change: "fix-it",
        status: "open",
        kind: "bug",
        summary: "Fix it.",
        obligations: { pending: ["repro-test"], satisfied: ["checks-pass"], withdrawn: [] },
        open_gates: [],
      },
      {
        change: "improve-login",
        status: "open",
        kind: null,
        summary: null,
        obligations: { pending: [], satisfied: [], withdrawn: [] },
        open_gates: ["ambiguous-intent"],
      },
    ],
  });
});

test("the work order and gate questions cover the whole catalog", () => {
  const { GATES, OBLIGATIONS } = require("./idd-contract.js");
  const { GATE_QUESTIONS, WORK_ORDER } = require("./idd-next.js");
  assert.deepStrictEqual([...WORK_ORDER].sort(), OBLIGATIONS.map((o) => o.id).sort());
  assert.deepStrictEqual(Object.keys(GATE_QUESTIONS).sort(), [...GATES].sort());
});

test("the work order is the one REQ-idd-011 names", () => {
  const { WORK_ORDER } = require("./idd-next.js");
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "idd", "spec.md"), "utf8");
  const section = spec.slice(spec.indexOf("{#REQ-idd-011}")).replace(/\s+/g, " ");
  const listed = WORK_ORDER.slice(0, -1).map((id) => `\`${id}\``).join(", ");
  assert.ok(section.includes(`${listed}, \`${WORK_ORDER.at(-1)}\``), "REQ-idd-011 must list the work order");
});

// E1.11: the plan is declared before any obligation is worked (REQ-idd-011).
test("next asks to declare the plan after the intent gates and before any obligation", () => {
  const { recordPlan } = require("./idd-record.js");
  const opened = recordIntent(null, { change: "fix-it", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state;
  const unplanned = recordSignal(opened, { id: "bug-fix", reason: "bug", source: "declaration" }).state;
  assert.deepStrictEqual(nextForChange(unplanned).next_step, {
    action: "declare-plan",
    how: "ospec signals --change fix-it --path <file>... [--work-units <n>] [--decision] [--operation <op>]",
    command: "ospec signals --change fix-it --path <file>...",
  });
  assert.strictEqual(nextForChange(unplanned, { checks: [] }).next_step.action, "declare-plan");
  assert.deepStrictEqual(nextForChange(unplanned).pending_obligations.map((o) => o.id), ["repro-test", "checks-pass"]);

  const planned = recordPlan(unplanned, { paths: ["src/a.js"] }).state;
  assert.strictEqual(nextForChange(planned).next_step.obligation, "repro-test");

  const fromDiff = recordSignal(opened, { id: "public-contract", reason: "diff", source: "diff" }).state;
  assert.strictEqual(nextForChange(fromDiff).next_step.obligation, "contract-spec-and-test");
  const withRun = { ...opened, runs: [{ id: "run-1" }] };
  assert.strictEqual(nextForChange(withRun).next_step.obligation, "checks-pass");

  const facts = recordIntent(null, { change: "facts", kind: "bug", summary: "s", acceptance: "a", openFacts: ["Which?"] }).state;
  assert.deepStrictEqual(nextForChange(facts).next_step.gate, "open-facts");
  const ambiguous = recordIntent(null, { change: "vague", ambiguous: true, request: "Improve it" }).state;
  assert.strictEqual(nextForChange(ambiguous).next_step.gate, "ambiguous-intent");
  assert.deepStrictEqual(nextForChange({ ...unplanned, status: "closed" }).next_step, { action: "none", command: null });
});

// ---------------------------------------------------------------------------
// The ADR impact declaration and the promotion suggestion (E3.1, REQ-idd-020)
// ---------------------------------------------------------------------------

test("next says how to declare an impact on the declared references", () => {
  let state = planned({ change: "evented", kind: "feature", summary: "s", acceptance: "a", coverage: require("./idd-facts.js").citedCoverage() });
  state = recordSignal(state, { id: "adr-or-quality-attribute", reason: "declared ADR 0002", source: "declaration" }).state;
  state = recordReferences(state, [{ kind: "adr", id: "0002" }]).state;
  const result = nextForChange(state);
  assert.deepStrictEqual(result.next_step, {
    action: "satisfy-obligation",
    obligation: "adr-impact-declaration",
    evidence: "adr-impact-declaration",
    how: 'ospec record impact --change evented (--adr <id> | --quality <id>) --impact <none|conforms|amends|supersedes|contradicts> --reason "<why>" [--record <new ADR>], then ospec check --change evented',
    command: 'ospec record impact --change evented --adr 0002 --impact <none|conforms|amends|supersedes|contradicts> --reason "<why>"',
  });
  assert.strictEqual(result.suggestions, undefined);
});

test("the contract step names where the project's contract documents and tests live (#400)", () => {
  let state = planned({ change: "orders-api", kind: "feature", summary: "s", acceptance: "a", coverage: require("./idd-facts.js").citedCoverage() });
  state = recordSignal(state, { id: "public-contract", reason: "diff", source: "diff" }).state;
  assert.strictEqual(
    nextForChange(state).next_step.how,
    "in one diff, touch a contract document and its test (contracts.documents and contracts.tests of idd/config.yaml), then ospec check --change orders-api",
  );
  const context = { checks: [{ name: "test", command: "npm test" }], contractPatterns: { documents: ["docs/api/**", "**/*.d.ts"], tests: ["**/*.test.*"] } };
  assert.strictEqual(
    nextForChange(state, context).next_step.how,
    "in one diff, touch a contract document (docs/api/**, **/*.d.ts) and its test (**/*.test.*), then ospec check --change orders-api; if the project keeps its contract elsewhere, propose contracts.documents for idd/config.yaml to the user and edit it only after approval",
  );
});

test("a boundary without a declared ADR suggests one and changes nothing else", () => {
  let state = planned({ change: "orders-api", kind: "feature", summary: "s", acceptance: "a", coverage: require("./idd-facts.js").citedCoverage() });
  state = recordSignal(state, { id: "public-contract", reason: "public contract: touches src/api/orders.js (matches **/api/**)", source: "declaration" }).state;
  const result = nextForChange(state);
  assert.deepStrictEqual(result.suggestions, [
    {
      id: "adr-promotion",
      reason: "public contract: touches src/api/orders.js (matches **/api/**)",
      how: "if the change takes an architecture decision, propose an ADR under docs/architecture/decisions/ to the user and declare the ADRs it touches with ospec signals --change orders-api --adr <id>; a development decision stays in idd/orders-api/change.md",
    },
  ]);
  assert.deepStrictEqual(result.pending_decision, null);
  assert.deepStrictEqual([result.next_step.action, result.next_step.obligation], ["satisfy-obligation", "contract-spec-and-test"]);
  assert.ok(!result.pending_obligations.some((entry) => entry.id === "adr-impact-declaration"));

  // Declaring the ADR it touches replaces the suggestion with the obligation.
  const declared = recordSignal(state, { id: "adr-or-quality-attribute", reason: "declared ADR 0002", source: "declaration" }).state;
  assert.strictEqual(nextForChange(declared).suggestions, undefined);
  // A closed change suggests nothing.
  assert.strictEqual(nextForChange({ ...state, status: "closed" }).suggestions, undefined);
});

// E4.10: the files a project with no code yet may already hold.
const GREENFIELD_FILES = ["README.md", "package.json", "package-lock.json", ".gitignore", "LICENSE", ".github/workflows/ci.yml", "openspec/config.yaml", "docs/notes.md"];
const FOUNDATION = {
  id: "foundation",
  reason: "the project has no source code and no docs/product or docs/architecture",
  how: "offer the user the foundation skill before the first change, as an option: it records the product docs, ADRs and idd/config.yaml and writes no code; if the user declines, go on with the change",
};

test("[REQ-idd-011] a project without source code or product and architecture docs suggests foundation", () => {
  assert.deepStrictEqual(foundationSuggestion([]), FOUNDATION);
  assert.deepStrictEqual(foundationSuggestion(GREENFIELD_FILES), FOUNDATION);
  // Product or test code, or anything foundation writes, means it has started.
  for (const file of ["src/app.js", "index.html", "styles/site.css", "scripts/build.sh", "main.go", "test/app.test.js", "docs/product/brief.md", "docs/architecture/knowledge-map.yaml"]) {
    assert.strictEqual(foundationSuggestion([...GREENFIELD_FILES, file]), null, file);
  }
  // Without a file list, the suggestion is left out and nothing fails.
  assert.strictEqual(foundationSuggestion(null), null);
  assert.strictEqual(foundationSuggestion(undefined), null);
});

test("[REQ-idd-011] foundation is offered only before anything is built, without changing the next step", () => {
  const projectFiles = GREENFIELD_FILES;
  assert.deepStrictEqual(nextForProject([], { projectFiles }), { ...nextForProject([]), suggestions: [FOUNDATION] });

  const questions = ["Is an empty title an error?"];
  let state = recordIntent(null, { change: "todo-list", kind: "bug", summary: "s", acceptance: "a", openFacts: questions }).state;
  const gate = nextForChange(state, { projectFiles });
  assert.deepStrictEqual([gate.next_step, gate.suggestions], [nextForChange(state).next_step, [FOUNDATION]]);

  state = recordGate(state, { id: "open-facts", action: "resolve", answer: "yes", source: "user" }).state;
  const plan = nextForChange(state, { projectFiles });
  assert.deepStrictEqual([plan.next_step.action, plan.suggestions], ["declare-plan", [FOUNDATION]]);

  // Once the plan is declared the change is being built: no more offers.
  state = recordPlan(state, { paths: ["index.html"] }).state;
  const building = nextForChange(state, { projectFiles });
  assert.deepStrictEqual([building.next_step.obligation, building.suggestions], ["checks-pass", undefined]);
  // Choosing among open changes offers nothing either.
  const other = recordIntent(null, { change: "other", kind: "docs", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state;
  assert.strictEqual(nextForProject([state, other], { projectFiles }).suggestions, undefined);
});

// The bench scenarios (E4.10 "Hecho cuando"): the greenfield ones get the
// suggestion, and none of the ones with code does.
test("[REQ-idd-011] foundation is suggested for the greenfield bench scenarios and for no scenario with code", () => {
  const bench = path.join(__dirname, "..", "evals", "bench");
  const filesOf = (repo) => fs.readdirSync(repo, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.relative(repo, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));
  const repos = (dir) => fs.readdirSync(path.join(bench, dir)).sort().map((id) => [id, filesOf(path.join(bench, dir, id, "repo"))]);
  const greenfield = repos("scenarios-greenfield");
  const withCode = [...repos("scenarios"), ...repos("scenarios-reserved")];
  assert.deepStrictEqual(greenfield.map(([id]) => id), ["receta-spa", "todo-spa"]);
  assert.strictEqual(withCode.length, 7);
  for (const [id, files] of greenfield) assert.deepStrictEqual(foundationSuggestion(files), FOUNDATION, id);
  for (const [id, files] of withCode) assert.strictEqual(foundationSuggestion(files), null, id);
});

test("[REQ-idd-021] next carries the knowledge references and warnings it is given, and keeps knowledge_refs", () => {
  const bug = loadFixtures().find((f) => f.id === "bug");
  const state = stateFromFixture(bug);
  const plain = nextForChange(state);
  assert.ok(!("references" in plain) && !("warnings" in plain));

  const knowledge = {
    references: [{ kind: "adr", id: "0002", status: "stale", components: ["orders"], path: "docs/architecture/decisions/0002-x.md", reason: "ADR 0002 is superseded" }],
    warnings: ["stale ADR 0002 (orders): ADR 0002 is superseded"],
  };
  const result = nextForChange(state, { knowledge });
  assert.deepStrictEqual(result.references, knowledge.references);
  assert.deepStrictEqual(result.warnings, knowledge.warnings);
  assert.deepStrictEqual(result.knowledge_refs, plain.knowledge_refs);
  assert.deepStrictEqual(result.next_step, plain.next_step);
});

test("[REQ-idd-022] next carries the fitness functions it is given without changing the next step", () => {
  const state = stateFromFixture(loadFixtures().find((f) => f.id === "bug"));
  const plain = nextForChange(state, { knowledge: { references: [], warnings: [] } });
  assert.ok(!("fitness" in plain));
  const fitness = {
    checks: [{ kind: "adr", id: "0006", path: "docs/architecture/decisions/0006-x.md", command: "node --test b.test.js" }],
    manual: [{ kind: "adr", id: "0003", path: "docs/architecture/decisions/0003-x.md", fitness: "Reviewed.", evidence: null }],
  };
  const result = nextForChange(state, { knowledge: { references: [], warnings: [], fitness } });
  assert.deepStrictEqual(result.fitness, fitness);
  assert.deepStrictEqual(result.next_step, plain.next_step);
});

test("[REQ-idd-023] next carries the team profile it is given without changing the next step", () => {
  const state = stateFromFixture(loadFixtures().find((f) => f.id === "bug"));
  const plain = nextForChange(state);
  assert.ok(!("team" in plain));
  const team = { size: "solo", experience: "senior", source: "idd/config.yaml", delivery_strategy: "single-pr", mentorship: "expert" };
  const result = nextForChange(state, { team });
  assert.deepStrictEqual(result.team, team);
  assert.deepStrictEqual(result.next_step, plain.next_step);
});

test("[REQ-idd-023] next gives the branching where it decides something and suggests it while undeclared", () => {
  const delivery = { branching: "serial", source: "recommended", reasons: ["why", "and why"], how: "the rules" };
  const intent = { change: "fix-it", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS };
  const unplanned = recordSignal(recordIntent(null, intent).state, { id: "bug-fix", reason: "bug", source: "declaration" }).state;
  const start = nextForChange(unplanned, { delivery });
  assert.strictEqual(start.next_step.action, "declare-plan");
  assert.deepStrictEqual(start.delivery, delivery);
  assert.deepStrictEqual(start.suggestions.map((suggestion) => suggestion.id), ["branching-undeclared"]);
  assert.match(start.suggestions[0].how, /^propose delivery.branching: serial to the user with its reasons, and write it to idd\/config.yaml only after approval$/);
  // While the change is built the branching decides nothing.
  const building = nextForChange(recordPlan(unplanned, { paths: ["src/a.js"] }).state, { delivery });
  assert.strictEqual(building.next_step.action, "satisfy-obligation");
  assert.ok(!("delivery" in building) && !("suggestions" in building));
  // At close it is back; declared, or decided by the profile, it suggests nothing.
  let done = planned({ change: "tidy", kind: "refactor", summary: "s", acceptance: "a", ...NO_OPEN_FACTS });
  done = recordEvidence(done, { id: "ev-1", kind: "check-run", obligation: "checks-pass", recordedAt: "t" }).state;
  const closing = nextForChange(done, { delivery: { ...delivery, source: "idd/config.yaml" } });
  assert.deepStrictEqual(closing.next_step, { action: "close", command: "ospec close --change tidy" });
  assert.strictEqual(closing.delivery.source, "idd/config.yaml");
  assert.ok(!("suggestions" in closing));
  assert.ok(!("suggestions" in nextForChange(unplanned, { delivery: { ...delivery, source: "team profile" } })));
});

test("[REQ-idd-025] next suggests the changelog and the release until idd/config.yaml declares them, even with a profile", () => {
  const option = (value, source) => ({ value, source, reasons: ["why"], how: "the rules" });
  const branching = { branching: "serial", source: "idd/config.yaml", reasons: ["why"], how: "the rules" };
  let done = planned({ change: "tidy", kind: "refactor", summary: "s", acceptance: "a", ...NO_OPEN_FACTS });
  done = recordEvidence(done, { id: "ev-1", kind: "check-run", obligation: "checks-pass", recordedAt: "t" }).state;
  const profiled = nextForChange(done, { delivery: { ...branching, changelog: option("CHANGELOG.md", "team profile"), release: option("batched", "team profile") } });
  assert.deepStrictEqual(profiled.next_step, { action: "close", command: "ospec close --change tidy" });
  assert.deepStrictEqual(profiled.suggestions.map((suggestion) => suggestion.id), ["changelog-undeclared", "release-undeclared"]);
  assert.strictEqual(profiled.suggestions[0].reason, "delivery.changelog is not declared; CHANGELOG.md is recommended");
  assert.match(profiled.suggestions[0].how, /^propose delivery.changelog: CHANGELOG.md to the user .* only after approval; until then ospec close writes no changelog entry$/);
  assert.match(profiled.suggestions[1].how, /until then ospec close proposes no release$/);
  const declared = nextForChange(done, { delivery: { ...branching, changelog: option("none", "idd/config.yaml"), release: option("per-change", "idd/config.yaml") } });
  assert.strictEqual(declared.delivery.release.value, "per-change");
  assert.ok(!("suggestions" in declared));
});

// ---------------------------------------------------------------------------
// The literal command of every step (E1.45, B5)
// ---------------------------------------------------------------------------

// Every step but none carries the command that does it; choose-change, one per
// open change.
function assertCommand(step, label) {
  if (step.action === "none") return assert.strictEqual(step.command, null, label);
  if (step.action === "choose-change") return assert.ok(step.commands.every((command) => command.startsWith("ospec next --change ")), label);
  assert.strictEqual(typeof step.command, "string", `${label}: ${step.action} needs a command`);
  assert.match(step.command, /^ospec [a-z]/, label);
  return undefined;
}

test("every next step of every reference fixture carries its literal command", () => {
  for (const fixture of loadFixtures()) assertCommand(nextForChange(stateFromFixture(fixture)).next_step, fixture.id);
  const context = { checks: [], candidateCommand: "pnpm test" };
  const unconfigured = nextForChange(planned({ change: "fix-it", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }), context);
  assert.strictEqual(unconfigured.next_step.action, "configure-checks");
  assert.strictEqual(unconfigured.next_step.command, "ospec next --change fix-it --json");
  for (const states of [[], [planned({ change: "a", kind: "docs", summary: "s", acceptance: "a", ...NO_OPEN_FACTS })]]) {
    assertCommand(nextForProject(states).next_step, `project of ${states.length}`);
  }
});

test("each obligation names the command that records its evidence", () => {
  const cases = [
    ["checks-pass", "ospec check --change fix-it"],
    ["boundary-tests", "ospec check --change fix-it"],
    ["contract-spec-and-test", "ospec check --change fix-it"],
    ["trust-review", "ospec review start --change fix-it"],
    ["living-doc", "ospec close --change fix-it"],
    ["migration-compat-and-test", 'ospec run --change fix-it --obligation migration-compat-and-test --command "<migration test>" --plan "<compatibility or rollback>"'],
    ["tdd-red-green", 'ospec run --change fix-it --obligation tdd-red-green --command "<test>" --unit <name>'],
  ];
  const base = planned({ change: "fix-it", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS });
  for (const [obligation, command] of cases) {
    const state = { ...base, obligations: [{ id: obligation, signal: "always", status: "pending", evidence: [] }] };
    assert.strictEqual(nextForChange(state).next_step.command, command, obligation);
  }
});

// The red run names the command to run again, so the agent need not retype it.
function withRun(state, run) {
  const runs = [...(state.runs || []), { id: `run-${(state.runs || []).length + 1}`, output_sha256: "x", tree: "y", recorded_at: "t", ...run }];
  return { ...state, runs };
}

test("after a red run, the step repeats its command instead of <test>", () => {
  let state = planned({ change: "fix-it", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS });
  state = recordSignal(state, { id: "bug-fix", reason: "bug", source: "declaration" }).state;
  assert.match(nextForChange(state).next_step.command, /--command "<test>"$/);

  state = withRun(state, { purpose: "checks", command: "npm test", exit_code: 1 });
  state = withRun(state, { purpose: "repro-test", command: "node --test test/page.test.js", exit_code: 1 });
  assert.strictEqual(nextForChange(state).next_step.command, 'ospec run --change fix-it --obligation repro-test --command "node --test test/page.test.js"');

  state = withRun(state, { purpose: "repro-test", command: "npm test -- --grep \"last page\"", exit_code: 1 });
  assert.strictEqual(nextForChange(state).next_step.command, "ospec run --change fix-it --obligation repro-test --command 'npm test -- --grep \"last page\"'");
  state = withRun(state, { purpose: "repro-test", command: "echo it's $HOME", exit_code: 1 });
  assert.strictEqual(nextForChange(state).next_step.command, "ospec run --change fix-it --obligation repro-test --command 'echo it'\\''s $HOME'");
  // A passing run that did not settle the pair is not the red to repeat.
  state = withRun(state, { purpose: "repro-test", command: "true", exit_code: 0 });
  assert.match(nextForChange(state).next_step.command, /--command 'echo it'/);
});

test("a red unit names its unit, and a red migration test keeps its plan placeholder", () => {
  const base = planned({ change: "fix-it", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS });
  const tdd = withRun({ ...base, obligations: [{ id: "tdd-red-green", signal: "always", status: "pending", evidence: [] }] }, { purpose: "tdd-red-green", command: "go test ./parser", exit_code: 1, unit: "parser" });
  assert.strictEqual(nextForChange(tdd).next_step.command, 'ospec run --change fix-it --obligation tdd-red-green --command "go test ./parser" --unit parser');
  const migration = withRun({ ...base, obligations: [{ id: "migration-compat-and-test", signal: "always", status: "pending", evidence: [] }] }, { purpose: "migration-test", command: "npm run migrate:test", exit_code: 1 });
  assert.strictEqual(
    nextForChange(migration).next_step.command,
    'ospec run --change fix-it --obligation migration-compat-and-test --command "npm run migrate:test" --plan "<compatibility or rollback>"',
  );
});

test("the impact step names the first declared reference without an impact, then check", () => {
  let state = planned({ change: "evented", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS });
  state = recordSignal(state, { id: "adr-or-quality-attribute", reason: "declared", source: "declaration" }).state;
  state = recordReferences(state, [{ kind: "adr", id: "0002" }, { kind: "scenario", id: "module-integration" }]).state;
  state = recordImpact(state, { kind: "adr", id: "0002", impact: "conforms", reason: "r" }).state;
  assert.strictEqual(
    nextForChange(state).next_step.command,
    'ospec record impact --change evented --quality module-integration --impact <none|conforms|amends|supersedes|contradicts> --reason "<why>"',
  );
  state = recordImpact(state, { kind: "scenario", id: "module-integration", impact: "none", reason: "r" }).state;
  const step = nextForChange(state).next_step;
  if (step.obligation === "adr-impact-declaration") assert.strictEqual(step.command, "ospec check --change evented");
});
