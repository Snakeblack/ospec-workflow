"use strict";

// Contract tests for E1.1 idd-contract: the machine-readable catalog in
// idd-contract.js stays in parity with openspec/specs/idd/spec.md, and the
// reference fixtures in scripts/fixtures/idd/ only use catalog entries.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const contract = require("./idd-contract.js");

const ROOT = path.resolve(__dirname, "..", "..");
const SPEC_PATH = path.join(ROOT, "openspec", "specs", "idd", "spec.md");
const FIXTURES_DIR = path.join(ROOT, "scripts", "fixtures", "idd");

const REFERENCE_TYPES = ["typo", "bug", "internal-feature", "public-api", "migration", "auth"];
const GATE_CASES = ["ambiguous-intent", "destructive-migration"];

function readSpec() {
  return fs.readFileSync(SPEC_PATH, "utf8");
}

function requirementSection(spec, id) {
  const start = spec.indexOf(`{#${id}}`);
  assert.ok(start !== -1, `spec must define ${id}`);
  const next = spec.indexOf("\n### Requirement:", start);
  return next === -1 ? spec.slice(start) : spec.slice(start, next);
}

function loadFixtures() {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name, data: JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8")) }));
}

function sorted(values) {
  return [...values].sort();
}

function validState(overrides = {}) {
  return {
    schema: "idd-state/v1",
    change: "fix-pagination",
    mode: "idd",
    status: "open",
    intent: { kind: "bug", summary: "Fix the last page.", acceptance: "Two full pages." },
    signals: [
      { id: "always", reason: "every change", source: "declaration" },
      { id: "bug-fix", reason: "intent kind bug", source: "declaration" },
    ],
    obligations: [
      { id: "checks-pass", signal: "always", status: "pending", evidence: [] },
      { id: "repro-test", signal: "bug-fix", status: "pending", evidence: [] },
    ],
    gates: [],
    evidence: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Catalog parity with the spec (REQ-idd-005, REQ-idd-008)
// ---------------------------------------------------------------------------

test("catalog table in the spec matches the signal → obligation → evidence catalog", () => {
  const section = requirementSection(readSpec(), "REQ-idd-005");
  const rows = [...section.matchAll(/^\| `([a-z-]+)` \| `([a-z-]+)` \| `([a-z-]+)` \|$/gm)].map((m) => ({
    signal: m[1],
    obligation: m[2],
    evidence: m[3],
  }));
  const fromCode = contract.SIGNALS.map((signal) => ({
    signal: signal.id,
    obligation: signal.obligation,
    evidence: contract.OBLIGATIONS.find((o) => o.id === signal.obligation).evidence,
  }));
  assert.deepStrictEqual(rows, fromCode);
});

test("every evidence kind is defined in the spec and used by exactly one obligation", () => {
  const section = requirementSection(readSpec(), "REQ-idd-005");
  const defined = [...section.matchAll(/^- `([a-z-]+)`:/gm)].map((m) => m[1]);
  assert.deepStrictEqual(sorted(defined), sorted(contract.EVIDENCE_KINDS));
  assert.deepStrictEqual(sorted(contract.OBLIGATIONS.map((o) => o.evidence)), sorted(contract.EVIDENCE_KINDS));
});

test("each signal derives one distinct obligation", () => {
  const obligations = contract.SIGNALS.map((s) => s.obligation);
  assert.strictEqual(new Set(obligations).size, obligations.length);
  assert.deepStrictEqual(sorted(obligations), sorted(contract.OBLIGATIONS.map((o) => o.id)));
});

test("the spec names exactly the three gates", () => {
  assert.deepStrictEqual(contract.GATES, ["ambiguous-intent", "adr-amend-or-contradict", "irreversible-operation"]);
  const section = requirementSection(readSpec(), "REQ-idd-008");
  for (const gate of contract.GATES) {
    assert.ok(section.includes(`\`${gate}\``), `REQ-idd-008 must name ${gate}`);
  }
});

test("the ADR signal is deferred to E3.1", () => {
  const adr = contract.SIGNALS.find((s) => s.id === "adr-or-quality-attribute");
  assert.strictEqual(adr.availableFrom, "E3.1");
  assert.throws(() => contract.deriveObligations(["always", "adr-or-quality-attribute"]), /not available/);
});

test("state schema, layout and living-doc template named in the spec match the module", () => {
  const spec = readSpec();
  assert.ok(requirementSection(spec, "REQ-idd-003").includes(`\`${contract.STATE_SCHEMA}\``));
  assert.ok(requirementSection(spec, "REQ-idd-002").includes(`\`${contract.CHANGE_ROOT}/<change-id>/\``));
  assert.ok(requirementSection(spec, "REQ-idd-002").includes(`\`${contract.ARCHIVE_ROOT}/<YYYY-MM-DD>-<change-id>/\``));
  const template = requirementSection(spec, "REQ-idd-004");
  for (const heading of contract.LIVING_DOC_SECTIONS) {
    assert.ok(template.includes(`\`${heading}\``), `REQ-idd-004 must name section ${heading}`);
  }
  assert.ok(template.includes(contract.EVIDENCE_MARKERS.start));
  assert.ok(template.includes(contract.EVIDENCE_MARKERS.end));
  const state = requirementSection(spec, "REQ-idd-003");
  for (const field of contract.STATE_FIELDS) {
    assert.ok(state.includes(`\`${field}\``), `REQ-idd-003 must name field ${field}`);
  }
});

// ---------------------------------------------------------------------------
// Mode resolution (REQ-idd-001)
// ---------------------------------------------------------------------------

test("mode resolves change > project > default sdd", () => {
  assert.strictEqual(contract.DEFAULT_MODE, "sdd");
  assert.strictEqual(contract.resolveMode({ changeMode: "idd", projectMode: "sdd" }), "idd");
  assert.strictEqual(contract.resolveMode({ changeMode: "sdd", projectMode: "idd" }), "sdd");
  assert.strictEqual(contract.resolveMode({ projectMode: "idd" }), "idd");
  assert.strictEqual(contract.resolveMode({}), "sdd");
  assert.throws(() => contract.resolveMode({ changeMode: "lite" }), /unknown mode/);
});

// ---------------------------------------------------------------------------
// Obligation derivation (REQ-idd-005)
// ---------------------------------------------------------------------------

test("deriveObligations is sorted, deduplicated and rejects unknown signals", () => {
  assert.deepStrictEqual(contract.deriveObligations(["bug-fix", "always", "bug-fix"]), ["checks-pass", "repro-test"]);
  assert.deepStrictEqual(contract.deriveObligations([]), []);
  assert.throws(() => contract.deriveObligations(["size-large"]), /unknown signal/);
});

// ---------------------------------------------------------------------------
// Reference fixtures (REQ-idd-010)
// ---------------------------------------------------------------------------

test("fixtures cover the six reference types and the two gate cases, as the spec lists", () => {
  const ids = loadFixtures().map(({ name, data }) => {
    assert.strictEqual(`${data.id}.json`, name, `${name} must declare id ${data.id}`);
    return data.id;
  });
  assert.deepStrictEqual(sorted(ids), sorted([...REFERENCE_TYPES, ...GATE_CASES]));
  const section = requirementSection(readSpec(), "REQ-idd-010");
  for (const id of ids) {
    assert.ok(section.includes(`\`${id}\``), `REQ-idd-010 must list fixture ${id}`);
  }
});

for (const { name, data } of loadFixtures()) {
  test(`fixture ${name} is consistent with the catalog`, () => {
    const { input, expected } = data;
    assert.strictEqual(contract.resolveMode({ projectMode: input.project.mode }), "idd");
    for (const key of ["signals", "obligations", "gates"]) {
      assert.deepStrictEqual(expected[key], sorted(new Set(expected[key])), `${key} must be sorted and unique`);
    }
    for (const gate of expected.gates) {
      assert.ok(contract.GATES.includes(gate), `unknown gate ${gate}`);
    }
    assert.deepStrictEqual(expected.obligations, contract.deriveObligations(expected.signals));
    assert.strictEqual(expected.living_doc, expected.obligations.includes("living-doc"));
    assert.strictEqual(expected.signals.includes("strict-tdd"), input.project.strict_tdd === true && expected.signals.length > 0);

    if (input.intent.ambiguous) {
      assert.deepStrictEqual(expected.signals, [], "no signal while the intent is ambiguous");
      assert.ok(expected.gates.includes("ambiguous-intent"));
    } else {
      assert.ok(expected.signals.includes("always"), "always is active once the intent is resolved");
      assert.ok(contract.INTENT_KINDS.includes(input.intent.kind));
      assert.strictEqual(expected.signals.includes("bug-fix"), input.intent.kind === "bug");
      assert.ok(!expected.gates.includes("ambiguous-intent"));
    }
  });
}

test("typo closes with checks only, no gate and no document", () => {
  const typo = loadFixtures().find(({ data }) => data.id === "typo").data.expected;
  assert.deepStrictEqual(typo, { signals: ["always"], obligations: ["checks-pass"], gates: [], living_doc: false });
});

// ---------------------------------------------------------------------------
// State validation (REQ-idd-003, REQ-idd-007)
// ---------------------------------------------------------------------------

test("a minimal open state validates", () => {
  assert.deepStrictEqual(contract.validateState(validState()), { ok: true, errors: [] });
});

test("unknown top-level fields are rejected by name", () => {
  const result = contract.validateState(validState({ route: "standard" }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("route")));
});

test("a satisfied obligation needs recorded evidence of its catalog kind", () => {
  const asserted = validState();
  asserted.obligations[1] = { id: "repro-test", signal: "bug-fix", status: "satisfied", evidence: [] };
  assert.strictEqual(contract.validateState(asserted).ok, false);

  const wrongKind = validState({
    evidence: [{ id: "ev-1", kind: "check-run", obligation: "repro-test", recorded_at: "2026-10-05T08:00:00Z" }],
  });
  wrongKind.obligations[1] = { id: "repro-test", signal: "bug-fix", status: "satisfied", evidence: ["ev-1"] };
  assert.strictEqual(contract.validateState(wrongKind).ok, false);

  const recorded = validState({
    evidence: [{ id: "ev-1", kind: "repro-run-pair", obligation: "repro-test", recorded_at: "2026-10-05T08:00:00Z" }],
  });
  recorded.obligations[1] = { id: "repro-test", signal: "bug-fix", status: "satisfied", evidence: ["ev-1"] };
  assert.deepStrictEqual(contract.validateState(recorded), { ok: true, errors: [] });
});

test("a withdrawn obligation needs a reason", () => {
  const state = validState();
  state.obligations[1] = { id: "repro-test", signal: "bug-fix", status: "withdrawn", evidence: [] };
  assert.strictEqual(contract.validateState(state).ok, false);
});

test("a resolved gate needs the user's answer and its source", () => {
  const state = validState({ gates: [{ id: "irreversible-operation", status: "resolved" }] });
  assert.strictEqual(contract.validateState(state).ok, false);
  state.gates[0] = { id: "irreversible-operation", status: "resolved", answer: "approve", source: "AskUserQuestion" };
  assert.deepStrictEqual(contract.validateState(state), { ok: true, errors: [] });
});

// ---------------------------------------------------------------------------
// Withdrawal and close (REQ-idd-006, REQ-idd-009)
// ---------------------------------------------------------------------------

test("withdrawal is refused while an active signal still derives the obligation", () => {
  assert.deepStrictEqual(contract.canWithdraw(validState(), "repro-test"), {
    ok: false,
    reason: "signal bug-fix still derives repro-test",
  });
  const recomputed = validState();
  recomputed.signals = recomputed.signals.filter((s) => s.id !== "bug-fix");
  assert.deepStrictEqual(contract.canWithdraw(recomputed, "repro-test"), { ok: true });
});

test("close is refused while an obligation is pending or a gate is open", () => {
  assert.deepStrictEqual(contract.canClose(validState()), { ok: false, blocking: ["checks-pass", "repro-test"] });

  const gated = validState({
    obligations: [],
    signals: [],
    gates: [{ id: "irreversible-operation", status: "open" }],
  });
  assert.deepStrictEqual(contract.canClose(gated), { ok: false, blocking: ["gate:irreversible-operation"] });

  const settled = validState({
    evidence: [{ id: "ev-1", kind: "check-run", obligation: "checks-pass", recorded_at: "2026-10-05T08:00:00Z" }],
  });
  settled.obligations = [
    { id: "checks-pass", signal: "always", status: "satisfied", evidence: ["ev-1"] },
    { id: "repro-test", signal: "bug-fix", status: "withdrawn", evidence: [], withdrawn_reason: "not a bug after all" },
  ];
  assert.deepStrictEqual(contract.canClose(settled), { ok: true, blocking: [] });
});
