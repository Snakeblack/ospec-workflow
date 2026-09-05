"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  UNRESOLVED,
  REVIEW_AGENTS,
  resolveCanonicalAgent,
  derivePhaseKey,
} = require("./agent-identity.js");

// Tabla canónica de resolución (REQ-agent-identity-001). El caso
// `plugin-host:sdd-spec` es la REGRESIÓN del bug de prefijo de host que la
// igualdad estricta `sdd-${phase}` no reconocía.
const RESOLUTION_CASES = [
  // unprefixed sdd identity
  ["sdd-spec", "sdd-spec"],
  // host/plugin prefix strip (regresión prefijo)
  ["plugin-host:sdd-spec", "sdd-spec"],
  ["host:review-runtime", "review-runtime"],
  // trim
  ["  sdd-spec  ", "sdd-spec"],
  // double prefix / malformed colon → fail closed
  ["a:b:sdd-spec", UNRESOLVED],
  [":sdd-spec", UNRESOLVED],
  ["host:", UNRESOLVED],
  // empty suffix after sdd-
  ["sdd-", UNRESOLVED],
  // empty / non-string
  ["", UNRESOLVED],
  ["   ", UNRESOLVED],
  [undefined, UNRESOLVED],
  [null, UNRESOLVED],
  [42, UNRESOLVED],
  // closed-world review set: foreign review-* names fail
  ["review-invented", UNRESOLVED],
  ["review-reliability", UNRESOLVED],
  ["sdd", UNRESOLVED],
  ["SDD-spec", UNRESOLVED],
];

for (const [raw, expected] of RESOLUTION_CASES) {
  test(`resolveCanonicalAgent: ${JSON.stringify(raw)} -> ${expected}`, () => {
    assert.equal(resolveCanonicalAgent(raw), expected);
  });
}

for (const agent of REVIEW_AGENTS) {
  test(`resolveCanonicalAgent: allowlisted review agent ${agent} resolves to itself`, () => {
    assert.equal(resolveCanonicalAgent(agent), agent);
    assert.equal(resolveCanonicalAgent(`host:${agent}`), agent);
  });
}

// --- derivePhaseKey ----------------------------------------------------------

const PHASE_KEY_CASES = [
  ["sdd-spec", "spec"],
  ["sdd-apply", "apply"],
  ["review-runtime", "review-runtime"],
  ["review-correction", "review-correction"],
  ["unknown-agent", ""],
  [UNRESOLVED, ""],
];

for (const [canonical, expected] of PHASE_KEY_CASES) {
  test(`derivePhaseKey: ${canonical} -> ${JSON.stringify(expected)}`, () => {
    assert.equal(derivePhaseKey(canonical), expected);
  });
}

// --- O1 compatibilidad (REQ-agent-identity-002) ------------------------------

// Réplica literal de la lógica que hoy emiten los hooks para nombres sin
// prefijo: strip `sdd-` / review self / "". La resolución canónica debe
// producir exactamente estos valores para todo nombre válido sin prefijo.
function legacyEmitterOutput(agentName) {
  if (agentName.startsWith("sdd-")) return agentName.slice("sdd-".length);
  return new Set(["review-change", "review-trust", "review-runtime", "review-evolution", "review-efficiency", "review-correction"]).has(agentName)
    ? agentName
    : "";
}

test("O1 compat: todo nombre sin prefijo produce identidad + phase key idénticos a los emitidos hoy", () => {
  const unprefixed = [
    "sdd-spec",
    "sdd-apply",
    "sdd-verify",
    "sdd-document",
    "sdd-orchestrator",
    ...REVIEW_AGENTS,
  ];
  assert.ok(unprefixed.length > 0);
  for (const name of unprefixed) {
    const canonical = resolveCanonicalAgent(name);
    assert.equal(canonical, name, `identidad: ${name}`);
    assert.equal(derivePhaseKey(canonical), legacyEmitterOutput(name), `phase key: ${name}`);
  }
});

// --- Paridad E1 (REQ-agent-identity-003) -------------------------------------

// Set representativo del spec; el espejo Go (internal/agentidentity) afirma el
// MISMO mapa esperado. Cualquier divergencia entre runtimes rompe esta tabla.
const PARITY_SET = [
  ["sdd-spec", "sdd-spec", "spec"],
  ["host:sdd-spec", "sdd-spec", "spec"],
  ["review-runtime", "review-runtime", "review-runtime"],
  ["host:review-runtime", "review-runtime", "review-runtime"],
  ["review-invented", UNRESOLVED, ""],
  // caso de regresión: nombre prefijado que la igualdad estricta rechazaba
  ["plugin-host:sdd-spec", "sdd-spec", "spec"],
];

test("Paridad E1: resultados esperados idénticos a los del espejo Go", () => {
  assert.ok(PARITY_SET.length >= 6);
  for (const [raw, expectedCanonical, expectedKey] of PARITY_SET) {
    const canonical = resolveCanonicalAgent(raw);
    assert.equal(canonical, expectedCanonical, `canonical: ${raw}`);
    assert.equal(
      canonical === UNRESOLVED ? "" : derivePhaseKey(canonical),
      expectedKey,
      `phase key: ${raw}`,
    );
  }
});
