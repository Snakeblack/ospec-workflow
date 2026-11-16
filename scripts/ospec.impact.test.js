"use strict";

// End-to-end contract of the ospec CLI, run as a child process against a
// temporary project root: declared architecture impact, knowledge by
// reference and fitness functions (E3.1-E3.3), and how the ceremony and the
// checks rise (E1.44, E1.53, E1.67, E1.69). The helpers the parts share are
// in scripts/lib/test-support/ospec-cli.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  tempRoot,
  ospec,
  assertGateStep,
  FEATURE_COVER,
  openFeature,
  writeFile,
  VERIFY,
  project,
  stateOf,
  OPEN_DOCS,
  adrText,
  architectureProject,
  OPEN_EVENTS,
  fitnessProject,
  E2E,
} = require("./lib/test-support/ospec-cli.js");

// E3.1: declared architecture impact (REQ-idd-020)
// ---------------------------------------------------------------------------

test("signals --adr and --quality declare existing references only", (t) => {
  const { root } = architectureProject(t);
  openFeature(root, ...OPEN_EVENTS);
  const unknownAdr = ospec(root, "signals", "--change", "order-events", "--path", "src/orders.js", "--adr", "0099", "--json");
  assert.strictEqual(unknownAdr.code, 1);
  assert.deepStrictEqual(unknownAdr.json.error, {
    code: "unknown-reference",
    message: "ADR 0099 is not under docs/architecture/decisions/",
    how: "declare an ADR under docs/architecture/decisions/ or a quality scenario of docs/architecture/knowledge-map.yaml",
  });
  const unknownScenario = ospec(root, "signals", "--change", "order-events", "--quality", "fast-boot", "--json");
  assert.strictEqual(unknownScenario.json.error.code, "unknown-reference");
  const badId = ospec(root, "signals", "--change", "order-events", "--adr", "integration", "--json");
  assert.strictEqual(badId.code, 2);
  assert.strictEqual(stateOf(root, "order-events").impacts, undefined, "a refused declaration records nothing");

  const declared = ospec(root, "signals", "--change", "order-events", "--path", "src/orders.js", "--adr", "ADR-0002", "--quality", "module-integration", "--json");
  assert.strictEqual(declared.code, 0, declared.stderr);
  assert.deepStrictEqual(declared.json.added.signals, ["adr-or-quality-attribute"]);
  assert.deepStrictEqual(stateOf(root, "order-events").impacts, [
    { kind: "adr", id: "0002", impact: null },
    { kind: "scenario", id: "module-integration", impact: null },
  ]);
  assert.strictEqual(declared.json.next.next_step.obligation, "adr-impact-declaration");
});

test("an amendment stops at the gate and settles once its new ADR passes the lint and cites the old one", (t) => {
  const { root } = architectureProject(t);
  openFeature(root, ...OPEN_EVENTS);
  ospec(root, "signals", "--change", "order-events", "--path", "src/orders.js", "--adr", "0002");

  const usage = ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", "--quality", "module-integration", "--impact", "none", "--reason", "r", "--json");
  assert.strictEqual(usage.code, 2);

  const amended = ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", "--impact", "amends", "--reason", "billing consumes order-placed asynchronously", "--json");
  assert.strictEqual(amended.code, 0, amended.stderr);
  assertGateStep(amended.json.next.next_step, "adr-amend-or-contradict");
  assert.strictEqual(amended.json.next.pending_decision.reason, "ADR 0002 amends: billing consumes order-placed asynchronously");

  ospec(root, "record", "gate", "--change", "order-events", "--gate", "adr-amend-or-contradict", "--resolve", "--answer", "amend 0002 with events", "--source", "user");
  const withoutRecord = ospec(root, "check", "--change", "order-events", "--json");
  const missing = withoutRecord.json.missing.find((entry) => entry.obligation === "adr-impact-declaration");
  assert.match(missing.reason, /write the new ADR under docs\/architecture\/decisions\/ and attach it/);

  const record = "docs/architecture/decisions/0003-eventos-entre-modulos.md";
  writeFile(root, record, adrText("0003", "Los módulos se integran por eventos", { decision: "Los módulos publican hechos y se suscriben a ellos; enmienda 0002." }));
  const attached = ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", "--record", record, "--json");
  assert.strictEqual(attached.code, 0, attached.stderr);

  const settled = ospec(root, "check", "--change", "order-events", "--json");
  assert.strictEqual(settled.code, 0, settled.stderr);
  assert.ok(!(settled.json.missing || []).some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(settled.json.missing));
  const state = stateOf(root, "order-events");
  assert.strictEqual(state.obligations.find((entry) => entry.id === "adr-impact-declaration").status, "satisfied");
  assert.deepStrictEqual(state.evidence.find((entry) => entry.kind === "adr-impact-declaration").detail, { refs: ["adr:0002 amends"], records: [record] });

  // A new ADR that no longer passes the lint reopens the declaration.
  writeFile(root, record, "# 0003. Los módulos se integran por eventos\n\nEnmienda 0002.\n");
  const broken = ospec(root, "check", "--change", "order-events", "--json");
  assert.match(broken.json.missing.find((entry) => entry.obligation === "adr-impact-declaration").reason, /fails the decision-record lint/);
});

// E1.69 impact-raise: an impact declared too low is raised before close.
test("[E1.69] record impact raises conforms to amends, which opens the gate, and refuses to lower it", (t) => {
  const { root } = architectureProject(t);
  openFeature(root, ...OPEN_EVENTS);
  ospec(root, "signals", "--change", "order-events", "--path", "src/orders.js", "--adr", "0002");
  const impact = (...args) => ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", ...args, "--json");
  assert.strictEqual(impact("--impact", "conforms", "--reason", "keeps sync calls").code, 0);

  const raised = impact("--impact", "amends", "--reason", "billing consumes order-placed asynchronously");
  assert.strictEqual(raised.code, 0, raised.stderr);
  assertGateStep(raised.json.next.next_step, "adr-amend-or-contradict");
  assert.strictEqual(raised.json.next.pending_decision.reason, "ADR 0002 amends: billing consumes order-placed asynchronously");
  assert.deepStrictEqual(stateOf(root, "order-events").impacts, [
    { kind: "adr", id: "0002", impact: "amends", reason: "billing consumes order-placed asynchronously", previous: [{ impact: "conforms", reason: "keeps sync calls" }] },
  ]);

  const lowered = impact("--impact", "conforms", "--reason", "keeps sync calls");
  assert.strictEqual(lowered.code, 1);
  assert.strictEqual(lowered.json.error.code, "impact-conflict");
  assert.strictEqual(lowered.json.error.message, "ADR 0002 is already declared as amends: billing consumes order-placed asynchronously; an impact is only raised, from none or conforms");
});

test("next suggests an ADR for a boundary without a declared one, without blocking", (t) => {
  const { root } = architectureProject(t);
  openFeature(root, ...OPEN_EVENTS);
  const planned = ospec(root, "signals", "--change", "order-events", "--path", "src/api/orders.js");
  assert.strictEqual(planned.code, 0, planned.stderr);
  assert.match(planned.stdout, /suggestion adr-promotion: public contract: touches src\/api\/orders\.js/);
  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.deepStrictEqual(next.json.suggestions.map((entry) => entry.id), ["adr-promotion"]);
  assert.strictEqual(next.json.next_step.obligation, "contract-spec-and-test");
});

// ---------------------------------------------------------------------------
// E3.2: knowledge by reference from the component map (REQ-idd-021)
// ---------------------------------------------------------------------------

function knowledgeProject(t, { map } = {}) {
  const { root, git } = architectureProject(t);
  writeFile(root, "docs/architecture/decisions/0003-cobro.md", adrText("0003", "El cobro es síncrono"));
  writeFile(root, "docs/architecture/decisions/0004-antigua.md", adrText("0004", "Antigua").replace("- Status: accepted", "- Status: superseded by 0002"));
  const component = (id, extra) => ({ id, summary: `${id} component`, evidence: ["verify.js:1"], ...extra });
  const componentMap = map ?? {
    schema: "ospec-component-map/v2",
    components: [
      component("orders", { paths: ["src/orders/**"], knowledge: { adrs: ["0002", "0004"], scenarios: ["module-integration"], terms: ["Order"] } }),
      component("billing", { paths: ["src/billing/**"], knowledge: { adrs: ["0003"] } }),
      component("legacy", { paths: ["src/legacy/**"], knowledge: { adrs: ["0009"] } }),
    ],
    boundaries: [],
    dependencies: [],
    divergences: [],
  };
  writeFile(root, "docs/architecture/component-map.yaml", typeof componentMap === "string" ? componentMap : JSON.stringify(componentMap));
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "component map");
  return { root, git };
}

test("[REQ-idd-021] the touched component derives the ADR signal from its current references and next shows each one's currency", (t) => {
  const { root } = knowledgeProject(t);
  openFeature(root, ...OPEN_EVENTS);
  const planned = ospec(root, "signals", "--change", "order-events", "--path", "src/orders/place.js", "--json");
  assert.strictEqual(planned.code, 0, planned.stderr);
  assert.deepStrictEqual(planned.json.signals.find((entry) => entry.id === "adr-or-quality-attribute"), {
    id: "adr-or-quality-attribute",
    reason: "component orders: ADR 0002 and quality scenario module-integration",
    source: "declaration",
  });
  assert.deepStrictEqual(stateOf(root, "order-events").impacts, [
    { kind: "adr", id: "0002", impact: null },
    { kind: "scenario", id: "module-integration", impact: null },
  ]);

  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.strictEqual(next.code, 0, next.stderr);
  assert.deepStrictEqual(
    next.json.references.map((ref) => `${ref.kind}:${ref.id}:${ref.status}`),
    ["adr:0002:current", "adr:0004:stale", "scenario:module-integration:current", "term:Order:absent"],
  );
  assert.deepStrictEqual(next.json.references[0].components, ["orders"]);
  assert.strictEqual(next.json.references[0].path, "docs/architecture/decisions/0002-integracion-sincrona.md");
  assert.deepStrictEqual(next.json.warnings, [
    "stale ADR 0004 (orders): ADR 0004 is superseded",
    "absent term Order (orders): docs/product/glossary.md does not exist",
  ]);
  assert.strictEqual(next.json.knowledge_refs, undefined);
  assert.strictEqual(next.json.next_step.obligation, "adr-impact-declaration");

  const human = ospec(root, "next", "--change", "order-events");
  assert.match(human.stdout, /ref adr 0002 current \(orders\): docs\/architecture\/decisions\/0002-integracion-sincrona\.md/);
  assert.match(human.stdout, /warning: stale ADR 0004 \(orders\): ADR 0004 is superseded/);
});

test("[REQ-idd-021] check derives the references of the components the diff touches", (t) => {
  const { root } = knowledgeProject(t);
  openFeature(root, ...OPEN_EVENTS);
  ospec(root, "signals", "--change", "order-events", "--path", "src/orders/place.js");
  writeFile(root, "src/billing/charge.js", "module.exports = {};\n");
  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.deepStrictEqual(stateOf(root, "order-events").impacts.map((entry) => `${entry.kind}:${entry.id}`), ["adr:0002", "scenario:module-integration", "adr:0003"]);
  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.deepStrictEqual(next.json.references.filter((ref) => ref.kind === "adr").map((ref) => ref.id), ["0002", "0003", "0004"]);
  assert.ok(!next.json.references.some((ref) => ref.id === "0009"), "an untouched component gives no reference");
});

test("[REQ-idd-021] a broken component map warns and gives no references, and no map gives no warning", (t) => {
  const { root } = knowledgeProject(t, { map: "components: []\n" });
  openFeature(root, ...OPEN_EVENTS);
  const planned = ospec(root, "signals", "--change", "order-events", "--path", "src/orders/place.js", "--json");
  assert.strictEqual(planned.code, 0, planned.stderr);
  assert.ok(!planned.json.signals.some((entry) => entry.id === "adr-or-quality-attribute"));
  assert.match(planned.json.warnings[0], /component-map\.yaml is not JSON text/);
  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.strictEqual(next.code, 0, next.stderr);
  assert.strictEqual(next.json.references, undefined);
  assert.match(next.json.warnings[0], /component-map\.yaml is not JSON text/);
  const checked = ospec(root, "check", "--change", "order-events");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.match(checked.stdout, /warning: docs\/architecture\/component-map\.yaml is not JSON text/);

  fs.rmSync(path.join(root, "docs/architecture/component-map.yaml"));
  const bare = ospec(root, "next", "--change", "order-events", "--json");
  assert.deepStrictEqual([bare.json.references, bare.json.warnings], [undefined, undefined]);
});

// E1.47 (B8): the ADRs and components the CLI derives from the paths a new
// change already names lead its memory query.
test("[REQ-idd-024] the memory query names the ADRs and components of the cited and changed paths first", (t) => {
  const { root, git } = knowledgeProject(t);
  writeFile(root, "src/orders/place.js", "module.exports = function place() {};\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "orders");
  writeFile(root, "src/billing/charge.js", "module.exports = {};\n");
  const cover = [
    "--request",
    "The request fixes every behavior.",
    "--open-fact",
    "inputs:Is a page size above 100 refused?",
    "--cite",
    "uniqueness=src/orders/place.js:1",
    ...["persistence=fixes every behavior", "copy=every behavior.", "url-state=The request fixes every", "accessibility=request fixes every behavior", "errors=quest fixes every"].flatMap((quote) => ["--quote", quote]),
  ];
  const opened = ospec(root, "record", "intent", "--change", "order-events", "--kind", "feature", "--summary", "Billing consumes order-placed.", "--acceptance", "Orders no longer calls billing.", ...cover, "--json");
  assert.strictEqual(opened.code, 0, opened.stdout);
  assert.strictEqual(opened.json.memory_query, "ADR-0002 ADR-0003 ADR-0004 billing orders request fixes behavior");
});

// ---------------------------------------------------------------------------
// E3.3: fitness functions in check (REQ-idd-022)
// ---------------------------------------------------------------------------

test("[REQ-idd-022] a boundary violation declared in an ADR blocks the close and names the ADR", (t) => {
  const { root } = fitnessProject(t);
  writeFile(root, "src/core.js", "module.exports = require('./adapter');\n");

  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  const missing = checked.json.missing.find((entry) => entry.obligation === "adr-impact-declaration");
  assert.strictEqual(missing.reason, "ADR 0006: fitness check `node boundary.js` failed with exit code 1");
  assert.deepStrictEqual(
    checked.json.fitness.checks.map(({ kind, id, command, exit_code }) => ({ kind, id, command, exit_code })),
    [{ kind: "adr", id: "0006", command: "node boundary.js", exit_code: 1 }],
  );
  const run = stateOf(root, "order-events").runs.find((entry) => entry.purpose === "fitness");
  assert.deepStrictEqual([run.ref, run.command, run.exit_code], ["adr:0006", "node boundary.js", 1]);

  const text = ospec(root, "check", "--change", "order-events");
  assert.match(text.stdout, /missing adr-impact-declaration: ADR 0006: fitness check `node boundary.js` failed with exit code 1/);
  assert.match(text.stdout, /core imports the adapter/);

  const close = ospec(root, "close", "--change", "order-events", "--json");
  assert.strictEqual(close.code, 1);
  assert.match(JSON.stringify(close.json.error), /adr-impact-declaration/);

  writeFile(root, "src/core.js", "module.exports = 2;\n");
  const fixed = ospec(root, "check", "--change", "order-events", "--json");
  assert.ok(!fixed.json.missing.some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(fixed.json.missing));
  const state = stateOf(root, "order-events");
  const evidence = state.evidence.find((entry) => entry.id === state.obligations.find((entry) => entry.id === "adr-impact-declaration").evidence[0]);
  assert.strictEqual(evidence.detail.fitness.length, 1);
});

test("[REQ-idd-022] the change cannot weaken the check its base declares", (t) => {
  const { root, boundaryAdr } = fitnessProject(t);
  writeFile(root, "src/core.js", "module.exports = require('./adapter');\n");
  writeFile(root, "docs/architecture/decisions/0006-nucleo-sin-adaptadores.md", boundaryAdr.replace("\n- Check: `node boundary.js`", ""));
  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.match(checked.json.missing.find((entry) => entry.obligation === "adr-impact-declaration").reason, /^ADR 0006: fitness check `node boundary.js` failed/);
});

test("[REQ-idd-022] a prose fitness function is a checklist item that keeps its evidence and never blocks", (t) => {
  const { root } = fitnessProject(t);
  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.deepStrictEqual(next.json.fitness.manual, [
    { kind: "adr", id: "0002", path: "docs/architecture/decisions/0002-integracion-sincrona.md", fitness: "Un test de integración entre módulos." },
  ]);
  assert.deepStrictEqual(next.json.fitness.checks.map((check) => check.command), ["node boundary.js"]);
  assert.match(ospec(root, "next", "--change", "order-events").stdout, /manual fitness ADR 0002: Un test de integración entre módulos\. \(no evidence recorded/);

  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.ok(!(checked.json.missing || []).some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(checked.json.missing));

  const refused = ospec(root, "record", "fitness", "--change", "order-events", "--adr", "0006", "--evidence", "ran it", "--json");
  assert.strictEqual(refused.json.error.code, "not-manual-fitness");
  assert.strictEqual(ospec(root, "record", "fitness", "--change", "order-events", "--adr", "0002", "--json").code, 2);

  const recorded = ospec(root, "record", "fitness", "--change", "order-events", "--adr", "0002", "--evidence", "verify.js:1 covers the integration", "--json");
  assert.strictEqual(recorded.code, 0, recorded.stderr);
  assert.deepStrictEqual(stateOf(root, "order-events").attestations.map(({ kind, id, evidence }) => ({ kind, id, evidence })), [
    { kind: "adr", id: "0002", evidence: "verify.js:1 covers the integration" },
  ]);
  assert.strictEqual(ospec(root, "next", "--change", "order-events", "--json").json.fitness.manual[0].evidence, "verify.js:1 covers the integration");
});

test("[REQ-idd-023] two projects with different teams get different defaults without a question", (t) => {
  const small = tempRoot(t);
  const multi = tempRoot(t);
  fs.mkdirSync(path.join(small, "idd"));
  fs.mkdirSync(path.join(multi, "idd"));
  fs.writeFileSync(path.join(small, "idd", "config.yaml"), "team:\n  size: solo\n  experience: senior\n");
  fs.writeFileSync(path.join(multi, "idd", "config.yaml"), "team:\n  size: multi-team\n  experience: junior\n");
  const one = ospec(small, "team", "--json").json;
  const other = ospec(multi, "team", "--json").json;
  assert.deepStrictEqual([one.mode, one.source, one.defaults.delivery_strategy, one.defaults.strict_tdd, one.defaults.mentorship], ["idd", "idd/config.yaml", "single-pr", false, "expert"]);
  assert.deepStrictEqual([other.defaults.delivery_strategy, other.defaults.strict_tdd, other.defaults.mentorship], ["auto-chain", true, "mentor"]);
  assert.notDeepStrictEqual(one.defaults.review, other.defaults.review);

  // next hands the profile to every IDD change, and strict_tdd follows it.
  for (const root of [small, multi]) {
    openFeature(root, "record", "intent", "--change", "fix-pagination", "--kind", "feature", "--summary", "Fix the last page.", "--acceptance", "Two full pages.", ...FEATURE_COVER, "--json");
  }
  ospec(small, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  ospec(multi, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  const nextSmall = ospec(small, "next", "--change", "fix-pagination", "--json").json;
  const nextMulti = ospec(multi, "next", "--change", "fix-pagination", "--json").json;
  assert.deepStrictEqual(nextSmall.team, { size: "solo", experience: "senior", source: "idd/config.yaml", delivery_strategy: "single-pr", mentorship: "expert" });
  assert.strictEqual(nextMulti.team.delivery_strategy, "auto-chain");
  assert.ok(!nextSmall.pending_obligations.some((o) => o.id === "tdd-red-green"));
  assert.ok(nextMulti.pending_obligations.some((o) => o.id === "tdd-red-green"));
  assert.strictEqual(nextSmall.pending_decision, undefined);
  assert.match(ospec(small, "next", "--change", "fix-pagination").stdout, /team: solo; delivery single-pr; mentorship expert/);
});

test("[REQ-idd-023] team follows the active mode and refuses an invalid profile", (t) => {
  const root = tempRoot(t);
  const { branching, changelog, release, ...none } = ospec(root, "team", "--json").json;
  assert.deepStrictEqual(none, { ok: true, command: "team", mode: "sdd", profile: null, source: null, defaults: null });
  assert.deepStrictEqual([changelog.value, release.value], ["CHANGELOG.md", "per-change"]);
  assert.deepStrictEqual([branching.value, branching.source], ["serial", "recommended"]);
  assert.match(ospec(root, "team").stdout, /no profile declared; defaults unchanged\nbranching: serial \(recommended\): /);
  fs.mkdirSync(path.join(root, "openspec"));
  fs.writeFileSync(path.join(root, "openspec", "config.yaml"), "schema: spec-driven\nscale: team\n");
  assert.deepStrictEqual(ospec(root, "team", "--json").json.profile, { size: "small", experience: null });
  fs.mkdirSync(path.join(root, "idd"));
  fs.writeFileSync(path.join(root, "idd", "config.yaml"), "checks:\n  test: npm test\n");
  assert.deepStrictEqual(ospec(root, "team", "--json").json.profile, null);
  // SDD reads its own declaration even while IDD is the active mode.
  const sdd = ospec(root, "team", "--mode", "sdd", "--json").json;
  assert.deepStrictEqual([sdd.mode, sdd.source, sdd.profile.size], ["sdd", "openspec/config.yaml scale", "small"]);
  assert.strictEqual(ospec(root, "team", "--mode", "both", "--json").code, 2);
  fs.writeFileSync(path.join(root, "idd", "config.yaml"), "team:\n  size: everyone\n");
  assert.strictEqual(ospec(root, "team", "--mode", "sdd", "--json").json.ok, true);
  const refused = ospec(root, "team", "--json");
  assert.strictEqual(refused.code, 1);
  assert.strictEqual(refused.json.error.code, "config-invalid");
  fs.writeFileSync(path.join(root, "idd", "config.yaml"), "mode: sdd\n");
  fs.writeFileSync(path.join(root, "openspec", "config.yaml"), "team:\n  size: everyone\n");
  assert.strictEqual(ospec(root, "team", "--json").json.error.code, "team-invalid");
});

test("[REQ-idd-023] next suggests the branching when the work starts, and an explicit one wins over the profile", (t) => {
  const root = tempRoot(t);
  const config = path.join(root, "idd", "config.yaml");
  fs.mkdirSync(path.join(root, "idd"));
  fs.writeFileSync(config, "checks:\n  test: node -e 0\n");
  // A project with code, so the foundation suggestion (E4.10) stays out.
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "a.js"), "");
  ospec(root, "record", "intent", "--change", "fix-it", "--kind", "bug", "--summary", "s", "--acceptance", "a", "--no-open-facts", "--basis", "The request fixes every behavior.");
  const start = ospec(root, "next", "--change", "fix-it", "--json").json;
  assert.strictEqual(start.next_step.action, "declare-plan");
  assert.deepStrictEqual([start.delivery.branching, start.delivery.source], ["serial", "recommended"]);
  assert.deepStrictEqual(start.suggestions.map((suggestion) => suggestion.id), ["branching-undeclared", "changelog-undeclared", "release-undeclared"]);
  const text = ospec(root, "next", "--change", "fix-it").stdout;
  assert.match(text, /suggestion branching-undeclared: delivery.branching is not declared; serial is recommended/);
  assert.match(text, /\nbranching rules: before a new branch, merge the open pull request/);

  // An unreadable configuration leaves delivery out and keeps the next step.
  fs.writeFileSync(config, "checks:\n  test: node -e 0\ndelivery:\n  branching: rebase\n");
  const unreadable = ospec(root, "next", "--change", "fix-it", "--json").json;
  assert.deepStrictEqual([unreadable.next_step.action, "delivery" in unreadable], ["declare-plan", false]);

  fs.writeFileSync(config, "team:\n  size: solo\ndelivery:\n  branching: parallel\nchecks:\n  test: node -e 0\n");
  const declared = ospec(root, "next", "--change", "fix-it", "--json").json;
  assert.deepStrictEqual([declared.delivery.branching, declared.delivery.source], ["parallel", "idd/config.yaml"]);
  assert.deepStrictEqual(declared.suggestions.map((suggestion) => suggestion.id), ["changelog-undeclared", "release-undeclared"]);
  assert.strictEqual(ospec(root, "team", "--json").json.branching.value, "parallel");
  assert.ok(!("integration" in declared.delivery) && !("integration" in ospec(root, "team", "--json").json), "only a declared integration branch adds its rules");
  ospec(root, "signals", "--change", "fix-it", "--path", "src/a.js");
  assert.ok(!("delivery" in ospec(root, "next", "--change", "fix-it", "--json").json), "building, the branching decides nothing");
});

test("[REQ-idd-011] next and record intent suggest foundation while the project has no code yet (E4.10)", (t) => {
  const root = tempRoot(t);
  const suggested = (result) => (result.suggestions || []).map((suggestion) => suggestion.id).includes("foundation");
  fs.writeFileSync(path.join(root, "README.md"), "# Todo\n");
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  // An ignored file is not the project's code.
  fs.writeFileSync(path.join(root, ".gitignore"), "vendor/\n");
  fs.mkdirSync(path.join(root, "vendor"));
  fs.writeFileSync(path.join(root, "vendor", "lib.js"), "");

  const start = ospec(root, "next", "--json");
  assert.deepStrictEqual([start.code, start.json.next_step.action, start.json.suggestions.map((suggestion) => suggestion.id)], [0, "open-change", ["foundation"]]);
  assert.match(
    ospec(root, "next").stdout,
    /\nsuggestion foundation: the project has no source code and no docs\/product or docs\/architecture; offer the user the foundation skill before the first change, as an option: it records the product docs, ADRs and idd\/config.yaml and writes no code; if the user declines, go on with the change\n/,
  );

  const intent = ["record", "intent", "--change", "todo-list", "--kind", "bug", "--summary", "s", "--acceptance", "a", "--no-open-facts", "--basis", "The request fixes every behavior."];
  const opened = ospec(root, ...intent, "--json");
  assert.deepStrictEqual([opened.code, opened.json.next.next_step.action, suggested(opened.json.next)], [0, "declare-plan", true]);
  assert.match(ospec(root, ...intent).stdout, /\nsuggestion foundation: /);
  assert.ok(suggested(ospec(root, "next", "--change", "todo-list", "--json").json));

  // Anything under docs/product or docs/architecture, or one source file, means
  // the project has started.
  fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "product", "brief.md"), "# Brief\n");
  assert.ok(!suggested(ospec(root, "next", "--change", "todo-list", "--json").json));
  fs.rmSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html>\n");
  const withCode = ospec(root, "next", "--change", "todo-list", "--json");
  assert.deepStrictEqual([withCode.code, withCode.json.next_step.action, suggested(withCode.json)], [0, "declare-plan", false]);

  // Once the plan is declared the change is being built: no more offers, even
  // in an empty project.
  fs.rmSync(path.join(root, "index.html"));
  ospec(root, "signals", "--change", "todo-list", "--path", "index.html");
  assert.ok(!suggested(ospec(root, "next", "--change", "todo-list", "--json").json));
});

// ---------------------------------------------------------------------------
// E1.44 ceremony-only-rises: the model can raise the ceremony, never lower it
// (B3, B6, B7 and B9 of the 2026-10-25 audit).
// ---------------------------------------------------------------------------

const PAGE_FEATURE = ["record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works."];

function boundaryReason(result) {
  return (result.json.missing || []).find((entry) => entry.obligation === "boundary-tests")?.reason;
}

test("[E1.44 B3] boundary-tests needs a test the diff adds, not the suite that already passed", (t) => {
  const { root, git } = project(t);
  // The suite runs every test under test/, then checks the pages.
  writeFile(root, "verify.js", `for (const file of require('fs').readdirSync('test')) require('./test/' + file);\n${VERIFY}\nconsole.log('ℹ tests 3');\n`);
  writeFile(root, "test/old.test.js", "require('node:assert').ok(true);\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "counted suite");
  openFeature(root, ...PAGE_FEATURE, ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = { maxSize: 50 };\n");

  const untested = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(untested.code, 0, untested.stdout);
  assert.ok(untested.json.added.signals.includes("untested-product"));
  assert.match(boundaryReason(untested) ?? "satisfied", /adds no line to a test/);

  fs.rmSync(path.join(root, "test", "old.test.js"));
  assert.match(boundaryReason(ospec(root, "check", "--change", "page-size", "--json")) ?? "satisfied", /adds no line to a test/, "a deleted test is not a new one");

  writeFile(root, "test/paginate.test.js", "require('node:assert').strictEqual(require('../src/paginate.js').maxSize, 50);\n");
  const tested = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(boundaryReason(tested), undefined, JSON.stringify(tested.json.missing));
  const evidence = stateOf(root, "page-size").evidence.find((entry) => entry.kind === "tested-check");
  assert.deepStrictEqual(evidence.detail.tests, ["test/paginate.test.js"]);
});

test("[E1.44 B6] a feature cite never lands in a manifest, and a code cite needs a file of the plan or the diff", (t) => {
  const { root, git } = project(t);
  writeFile(root, "package.json", '{\n  "name": "pages",\n  "version": "1.0.0"\n}\n');
  writeFile(root, "src/store.js", "// a corrupt file reads as empty\nmodule.exports = {};\n");
  writeFile(root, "README.md", "# Pages\nAn error prints one line.\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "sources");
  const intent = (...cites) => [
    ...PAGE_FEATURE,
    "--request",
    "The request fixes every behavior.",
    "--open-fact",
    "inputs:Is a page size above 100 refused?",
    ...["uniqueness=request fixes every", "copy=every behavior.", "url-state=The request fixes every", "accessibility=request fixes every behavior"].flatMap((quote) => ["--quote", quote]),
    ...cites.flatMap((cite) => ["--cite", cite]),
    "--json",
  ];

  const manifest = ospec(root, ...intent("persistence=package.json:2", "errors=README.md:2"));
  assert.strictEqual(manifest.code, 1, manifest.stdout);
  assert.strictEqual(manifest.json.error.code, "cite-unresolved");
  assert.match(manifest.json.error.message, /package\.json is a manifest/);

  const opened = ospec(root, ...intent("persistence=src/store.js:1", "errors=README.md:2"));
  assert.strictEqual(opened.code, 0, opened.stdout);
  ospec(root, "record", "gate", "--change", "page-size", "--gate", "open-facts", "--resolve", "--answer", "Yes, above 100 is refused.", "--source", "user");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = 50;\n");
  writeFile(root, "src/paginate.test.js", "require('node:assert').strictEqual(50, 50);\n");

  const outside = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(outside.code, 1, outside.stdout);
  assert.strictEqual(outside.json.error.code, "cite-outside-plan");
  assert.match(outside.json.error.message, /persistence=src\/store\.js:1/);
  assert.match(outside.json.error.how, /ospec signals --change page-size --path src\/store\.js/);

  ospec(root, "signals", "--change", "page-size", "--path", "src/store.js");
  const planned = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(planned.code, 0, planned.stdout);
  assert.strictEqual(planned.json.verdict, "ready", JSON.stringify(planned.json.missing));

  // close revalidates it: a plan edited by hand does not take the file out.
  const file = path.join(root, "idd", "page-size", "state.yaml");
  const state = stateOf(root, "page-size");
  state.plan.paths = state.plan.paths.filter((entry) => entry !== "src/store.js");
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  assert.strictEqual(ospec(root, "close", "--change", "page-size", "--json").json.error?.code, "cite-outside-plan");
});

test("[E1.44 B7] checks that differ from the base open checks-changed, and each new set needs the user's answer", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "README.md", "# Pages\n");
  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 0\n");

  const changed = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(changed.code, 0, changed.stdout);
  // E1.49: the new command does not run before the answer, so checks-pass is still missing.
  assert.deepStrictEqual([changed.json.verdict, changed.json.missing.map((entry) => entry.obligation), changed.json.checks], ["missing", ["checks-pass"], undefined]);
  assert.strictEqual(changed.json.decision.gate, "checks-changed");
  assert.match(changed.json.decision.reason, /test: node -e 0/);
  assert.match(changed.json.decision.reason, /test: node verify\.js/);
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").code, 1, "an open gate holds the close");
  const manual = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--open", "--json");
  assert.strictEqual(manual.json.error.code, "gate-managed-by-check");

  ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, node -e 0 is enough for a README.", "--source", "user");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");

  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 1\n");
  const again = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(again.json.decision?.gate, "checks-changed", "a new set of checks needs a new answer");
  assert.deepStrictEqual(stateOf(root, "fix-readme").gates.filter((gate) => gate.id === "checks-changed").map((gate) => gate.status), ["resolved", "open"]);
});

// E1.67 check-path-scope: a check scoped to paths runs only when the diff of
// the change touches one of them (REQ-idd-014).
const scopedChecks = (paths) => `checks:\n  test: node -e 0\n  e2e:\n    run: ${E2E}\n    paths: [${paths.map((item) => `"${item}"`).join(", ")}]\n`;

function scopedProject(t) {
  const { root, git } = project(t, { checks: scopedChecks(["src/**"]) });
  writeFile(root, ".gitignore", "e2e.log\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "ignore the e2e log");
  const e2eRuns = () => (fs.existsSync(path.join(root, "e2e.log")) ? fs.readFileSync(path.join(root, "e2e.log"), "utf8").length : 0);
  return { root, git, e2eRuns };
}

test("[E1.67] a scoped check runs only while the change's diff touches its paths, and close lists it when skipped", (t) => {
  const { root, git, e2eRuns } = scopedProject(t);
  const skipped = [{ name: "e2e", reason: "no path of the diff matches its paths (src/**)" }];
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "docs/guide.md", "# Guide\n");

  const docsOnly = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(docsOnly.code, 0, docsOnly.stdout);
  assert.strictEqual(docsOnly.json.verdict, "ready", JSON.stringify(docsOnly.json));
  assert.deepStrictEqual(docsOnly.json.checks.map((run) => run.name), ["test"]);
  assert.deepStrictEqual(docsOnly.json.skipped, skipped);
  assert.strictEqual(e2eRuns(), 0, "the e2e check must not run for a diff outside src/**");
  const evidenceOf = (state) => state.evidence.find((entry) => entry.id === state.obligations.find((o) => o.id === "checks-pass").evidence.at(-1));
  assert.deepStrictEqual(evidenceOf(stateOf(root, "fix-readme")).detail.skipped, skipped);
  assert.match(ospec(root, "check", "--change", "fix-readme").stdout, /\ncheck e2e did not run: no path of the diff matches its paths \(src\/\*\*\)\n/);

  // The same change, once it touches src/**, runs the check on the next check.
  writeFile(root, "src/notes.md", "Notes\n");
  const touched = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.deepStrictEqual([touched.json.verdict, touched.json.checks.map((run) => run.name), touched.json.skipped], ["ready", ["test", "e2e"], undefined]);
  assert.strictEqual(e2eRuns(), 1, "the check runs once the diff touches src/**");
  assert.strictEqual(evidenceOf(stateOf(root, "fix-readme")).detail.skipped, undefined);

  // --base narrows the diff, never the scope: it follows the change's base.
  git("add", "src/notes.md");
  git("commit", "-q", "--no-verify", "-m", "notes");
  const narrowed = ospec(root, "check", "--change", "fix-readme", "--base", "HEAD", "--json");
  assert.deepStrictEqual(narrowed.json.checks.map((run) => run.name), ["test", "e2e"], JSON.stringify(narrowed.json));

  // Back to a diff outside src/**, the check is skipped again and close lists it.
  git("rm", "-q", "src/notes.md");
  git("commit", "-q", "--no-verify", "-m", "drop the notes");
  assert.deepStrictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.skipped, skipped);
  const closed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
  assert.ok(closed.json.warnings.includes("check e2e did not run: no path of the diff matches its paths (src/**)"), JSON.stringify(closed.json.warnings));
});

test("[E1.67] changing a check's paths opens checks-changed, and a check the change adds or changes runs whatever its paths", (t) => {
  const { root, e2eRuns } = scopedProject(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "docs/guide.md", "# Guide\n");
  writeFile(root, "idd/config.yaml", scopedChecks(["src/**", "lib/**"]));

  const changed = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(changed.json.decision?.gate, "checks-changed", JSON.stringify(changed.json));
  assert.match(changed.json.decision.reason, /e2e: .*appendFileSync.* \(paths src\/\*\*, lib\/\*\*\)/);
  assert.match(changed.json.decision.reason, /e2e: .*appendFileSync.* \(paths src\/\*\*\)/);
  assert.strictEqual(e2eRuns(), 0, "nothing runs before the answer");
  assert.deepStrictEqual(stateOf(root, "fix-readme").gates.find((gate) => gate.id === "checks-changed").checks[1].paths, ["src/**", "lib/**"]);

  ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, e2e also covers lib.", "--source", "user");
  const approved = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.deepStrictEqual([approved.json.verdict, approved.json.checks.map((run) => run.name)], ["ready", ["test", "e2e"]], JSON.stringify(approved.json));
  assert.strictEqual(e2eRuns(), 1, "a check whose paths the change changed runs once although the diff touches none of them");
});

test("a check with --base still contrasts the checks with the change's base and runs nothing unapproved (gate bypass)", (t) => {
  const { root, git } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "README.md", "# Pages\n");
  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e \"require('fs').writeFileSync('ran', '')\"\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "new checks");

  const checked = ospec(root, "check", "--change", "fix-readme", "--base", "HEAD", "--json");
  assert.strictEqual(checked.code, 0, checked.stdout);
  assert.strictEqual(checked.json.decision?.gate, "checks-changed", JSON.stringify(checked.json));
  assert.strictEqual(checked.json.checks, undefined);
  assert.strictEqual(fs.existsSync(path.join(root, "ran")), false, "the new command must not run before the answer");
  assert.deepStrictEqual(stateOf(root, "fix-readme").gates.map((gate) => [gate.id, gate.status]), [["checks-changed", "open"]]);
});

test("[E1.44 B7] the first checks of a project also need the user's answer", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "README.md", "# Pages\n");
  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 0\n");
  const first = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(first.json.decision?.gate, "checks-changed", JSON.stringify(first.json));
  assert.match(first.json.decision.reason, /the base declares no checks/);
});

test("[E1.44 B9] a docs change that touches product code is refused until its kind rises", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = 50;\n");

  const refused = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(refused.code, 1, refused.stdout);
  assert.strictEqual(refused.json.error.code, "kind-mismatch");
  assert.match(refused.json.error.message, /src\/paginate\.js/);
  assert.match(refused.json.error.how, /ospec record intent --change fix-readme --kind <refactor\|bug\|feature>/);

  const rerecord = (kind, summary) => ["record", "intent", "--change", "fix-readme", "--kind", kind, "--summary", summary, "--acceptance", "Two pages, as before.", "--no-open-facts", "--basis", "The behavior stays.", "--json"];
  assert.strictEqual(ospec(root, ...rerecord("docs", "Another typo.")).json.error?.code, "intent-conflict");
  const raised = ospec(root, ...rerecord("refactor", "Move the page count to a module."));
  assert.strictEqual(raised.code, 0, raised.stdout);
  assert.strictEqual(stateOf(root, "fix-readme").intent.kind, "refactor");
  const checked = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(checked.code, 0, checked.stdout);
  assert.strictEqual(checked.json.verdict, "ready", JSON.stringify(checked.json.missing));
  assert.strictEqual(ospec(root, ...rerecord("docs", "Fix a typo.")).json.error?.code, "intent-conflict", "the kind never goes down");

  // close revalidates it: a kind lowered by hand does not close.
  const file = path.join(root, "idd", "fix-readme", "state.yaml");
  const state = stateOf(root, "fix-readme");
  state.intent.kind = "docs";
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").json.error?.code, "kind-mismatch");
});

test("[E1.44 B9] a refactor that removes a line of a contract is refused until it is a bug or a feature", (t) => {
  const { root, git } = project(t);
  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\npaths:\n  /orders: {}\n  /pages: {}\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "api");
  const intent = (kind) => ["record", "intent", "--change", "tidy-api", "--kind", kind, "--summary", "Tidy the API.", "--acceptance", "Same answers.", "--no-open-facts", "--basis", "The behavior stays.", "--json"];
  ospec(root, ...intent("refactor"));
  writeFile(root, "src/pages.txt", "2");

  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\npaths:\n  /pages: {}\n  /orders: {}\n");
  assert.strictEqual(ospec(root, "check", "--change", "tidy-api", "--json").code, 0, "a moved line is not a removed one");

  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\npaths:\n  /orders: {}\n");
  const refused = ospec(root, "check", "--change", "tidy-api", "--json");
  assert.strictEqual(refused.code, 1, refused.stdout);
  assert.strictEqual(refused.json.error.code, "kind-mismatch");
  assert.match(refused.json.error.message, /api\/openapi\.yaml/);
  assert.match(refused.json.error.how, /--kind <bug\|feature>/);

  const raised = ospec(root, ...intent("bug"));
  assert.strictEqual(raised.code, 0, raised.stdout);
  assert.strictEqual(ospec(root, "check", "--change", "tidy-api", "--json").code, 0);
});

test("[E1.44 B3] a test deleted or emptied before the first check does not stand for a new one", (t) => {
  const { root, git } = project(t);
  writeFile(root, "verify.js", `${VERIFY}\nconsole.log('ℹ tests 3');\n`);
  writeFile(root, "test/old.test.js", "require('node:assert').ok(true);\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "counted suite");
  openFeature(root, ...PAGE_FEATURE, ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = { maxSize: 50 };\n");
  fs.rmSync(path.join(root, "test", "old.test.js"));
  writeFile(root, "test/empty.test.js", "\n");

  const first = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(first.code, 0, first.stdout);
  assert.ok(first.json.added.signals.includes("untested-product"), JSON.stringify(first.json.added));
  assert.match(boundaryReason(first) ?? "satisfied", /adds no line to a test/);
});

test("[E1.44 B3] close reads boundary-tests against the change's base, not a --base the check chose", (t) => {
  const { root, git } = project(t);
  writeFile(root, "verify.js", `${VERIFY}\nconsole.log('ℹ tests 3');\n`);
  writeFile(root, "test/old.test.js", "require('node:assert').ok(true);\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "counted suite");
  openFeature(root, ...PAGE_FEATURE, ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = { maxSize: 50 };\n");
  assert.match(boundaryReason(ospec(root, "check", "--change", "page-size", "--json")) ?? "satisfied", /adds no line to a test/);

  // An older base puts the suite's test in the diff, but the change's base
  // already holds it: its counterproof fails the same way as its control (E1.48).
  const older = ospec(root, "check", "--change", "page-size", "--base", "HEAD~1", "--json");
  assert.match(boundaryReason(older) ?? "satisfied", /^the checks fail the same way on the base without the tests the diff adds /);
  const refused = ospec(root, "close", "--change", "page-size", "--json");
  assert.strictEqual(refused.json.error?.code, "close-refused", refused.stdout);
  assert.match(refused.json.error.message, /boundary-tests/);
  assert.match(boundaryReason(ospec(root, "check", "--change", "page-size", "--json")) ?? "satisfied", /adds no line to a test/);
});

test("[E1.44 B6] a cite through a symlink is judged by the file it reads", (t) => {
  const { root, git } = project(t);
  writeFile(root, "package.json", '{\n  "name": "pages",\n  "version": "1.0.0"\n}\n');
  fs.mkdirSync(path.join(root, "docs"));
  try {
    fs.symlinkSync(path.join("..", "package.json"), path.join(root, "docs", "notes.md"), "file");
  } catch (error) {
    t.skip(`symlink unavailable: ${error.message}`);
    return;
  }
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "sources");
  const intent = (cite) => [
    ...PAGE_FEATURE,
    "--request",
    "The request fixes every behavior.",
    "--open-fact",
    "inputs:Is a page size above 100 refused?",
    ...["uniqueness=request fixes every", "copy=every behavior.", "url-state=The request fixes every", "accessibility=request fixes every behavior", "errors=quest fixes every"].flatMap((quote) => ["--quote", quote]),
    "--cite",
    cite,
    "--json",
  ];
  for (const cite of ["persistence=docs/notes.md:2", "persistence=package.json/:2"]) {
    const refused = ospec(root, ...intent(cite));
    assert.strictEqual(refused.json.error?.code, "cite-unresolved", `${cite}: ${refused.stdout}`);
    assert.match(refused.json.error.message, /package\.json is a manifest/);
  }
});

// ---------------------------------------------------------------------------
// E1.53 config-only-rises: strict_tdd, impact and contracts of idd/config.yaml
// are contrasted with the change's base as checks is (E1.44 B7), and the
// residues of the E1.44 reviews.
// ---------------------------------------------------------------------------

test("[E1.53] a new impact.exclude needs the user's answer before close, and each new set another one", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "README.md", "# Pages\n");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\nimpact:\n  exclude:\n    - src/auth/**\n");

  const changed = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(changed.code, 0, changed.stdout);
  assert.strictEqual(changed.json.decision?.gate, "checks-changed", JSON.stringify(changed.json));
  assert.match(changed.json.decision.reason, /impact/);
  assert.match(changed.json.decision.reason, /src\/auth\/\*\*/);
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").code, 1, "an open gate holds the close");

  ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, src/auth is generated.", "--source", "user");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");

  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\nimpact:\n  exclude:\n    - src/**\n");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.decision?.gate, "checks-changed", "another exclude needs another answer");

  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\nimpact:\n  exclude:\n    - src/auth/**\n");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready", "back to the approved set");
  const closed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
});

test("[E1.53] strict_tdd, the team profile and contracts that differ from the base need the user's answer; a reordered list does not", (t) => {
  const checks = "checks:\n  test: node verify.js\n";
  const cases = [
    { base: "strict_tdd: true\n", now: "strict_tdd: false\n", reason: /strict_tdd/ },
    { base: "team:\n  size: small\n", now: "team:\n  size: solo\n", reason: /strict_tdd/ },
    { base: "", now: "contracts:\n  defaults: false\n", reason: /contracts/ },
    { base: "", now: "strict_tdd: true\n", reason: /strict_tdd/ },
    { base: "impact:\n  exclude:\n    - a/**\n    - b/**\n", now: "impact:\n  exclude:\n    - b/**\n    - a/**\n", reason: null },
    { base: "team:\n  size: solo\n", now: "team:\n  size: solo\n  experience: senior\n", reason: null },
  ];
  for (const { base, now, reason } of cases) {
    const label = `${JSON.stringify(base)} -> ${JSON.stringify(now)}`;
    const { root } = project(t, { checks: `${checks}${base}` });
    ospec(root, ...OPEN_DOCS);
    writeFile(root, "README.md", "# Pages\n");
    writeFile(root, "src/pages.txt", "2");
    writeFile(root, "idd/config.yaml", `${checks}${now}`);
    const checked = ospec(root, "check", "--change", "fix-readme", "--json");
    assert.strictEqual(checked.code, 0, `${label}: ${checked.stdout}`);
    if (reason) {
      assert.strictEqual(checked.json.decision?.gate, "checks-changed", `${label}: ${JSON.stringify(checked.json)}`);
      assert.match(checked.json.decision.reason, reason, label);
    } else {
      assert.strictEqual(checked.json.verdict, "ready", `${label}: ${JSON.stringify(checked.json)}`);
    }
  }
});

test("[E1.53] close reads contract-spec-and-test against the change's base, not a --base the check chose", (t) => {
  const { root, git } = project(t);
  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\n");
  writeFile(root, "src/api/orders.test.js", "require('node:assert').ok(true);\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "contract");
  openFeature(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");
  writeFile(root, "test/orders-size.test.js", "require('node:assert').strictEqual(50, 50);\n");
  const reason = (result) => result.json.missing.find((entry) => entry.obligation === "contract-spec-and-test")?.reason;
  assert.match(reason(ospec(root, "check", "--change", "page-size", "--json")) ?? "satisfied", /touches no contract document/);

  // An older base puts the committed contract document in the diff.
  const older = ospec(root, "check", "--change", "page-size", "--base", "HEAD~1", "--json");
  assert.strictEqual(older.json.verdict, "ready", JSON.stringify(older.json.missing));
  const refused = ospec(root, "close", "--change", "page-size", "--json");
  assert.strictEqual(refused.json.error?.code, "close-refused", refused.stdout);
  assert.match(refused.json.error.message, /contract-spec-and-test/);
  assert.match(refused.json.error.how, /ospec check --change page-size/);
});
