"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  PLAN_SCHEMA_VERSION,
  PLAN_REJECTION_CODES,
  parsePlan,
  validatePlanShape,
  validatePlanAgainstSnapshot,
  isKnownRejectionCode,
} = require("./archive-plan.js");

function sha256Hex(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function minimalPlan(overrides = {}) {
  return {
    schema_version: 1,
    change: "hybrid-archive-transaction-runtime",
    source_fingerprint: sha256Hex(Buffer.from("inventory-v1")),
    spec_writes: [],
    adr_promotions: [],
    archive_inventory: ["proposal.md", "state.yaml"],
    accepted_warnings: [],
    rollback: { strategy: "staging-rename" },
    ...overrides,
  };
}

// --- parsePlan ---------------------------------------------------------------

test("parsePlan: valid JSON object parses", () => {
  const plan = minimalPlan();
  const result = parsePlan(JSON.stringify(plan));
  assert.equal(result.parsed, true);
  assert.deepEqual(result.value, plan);
});

test("parsePlan: malformed JSON fails closed", () => {
  const result = parsePlan("{not-json");
  assert.equal(result.parsed, false);
  assert.equal(result.value, null);
});

test("parsePlan: non-object JSON fails closed", () => {
  const result = parsePlan('"just-a-string"');
  assert.equal(result.parsed, false);
  assert.equal(result.value, null);
});

// --- validatePlanShape -------------------------------------------------------

test("validatePlanShape: minimal v1 plan succeeds", () => {
  const result = validatePlanShape(minimalPlan(), {
    changeName: "hybrid-archive-transaction-runtime",
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.codes, []);
});

test("validatePlanShape: unknown schema_version → invalid-schema", () => {
  const result = validatePlanShape(minimalPlan({ schema_version: 99 }), {
    changeName: "hybrid-archive-transaction-runtime",
  });
  assert.equal(result.valid, false);
  assert.ok(result.codes.includes("invalid-schema"));
});

test("validatePlanShape: bad rollback.strategy → invalid-rollback-strategy", () => {
  const result = validatePlanShape(
    minimalPlan({ rollback: { strategy: "delete-origin" } }),
    { changeName: "hybrid-archive-transaction-runtime" },
  );
  assert.equal(result.valid, false);
  assert.ok(result.codes.includes("invalid-rollback-strategy"));
});

test("validatePlanShape: change-name-mismatch", () => {
  const result = validatePlanShape(minimalPlan({ change: "other-change" }), {
    changeName: "hybrid-archive-transaction-runtime",
  });
  assert.equal(result.valid, false);
  assert.ok(result.codes.includes("change-name-mismatch"));
});

test("validatePlanShape: missing source_fingerprint → invalid-schema", () => {
  const plan = minimalPlan();
  delete plan.source_fingerprint;
  const result = validatePlanShape(plan, {
    changeName: "hybrid-archive-transaction-runtime",
  });
  assert.equal(result.valid, false);
  assert.ok(result.codes.includes("invalid-schema"));
  assert.ok(result.codes.every((c) => isKnownRejectionCode(c)));
});

// --- constants / allowlist ---------------------------------------------------

test("PLAN_SCHEMA_VERSION is 1 and PLAN_REJECTION_CODES is frozen allowlist", () => {
  assert.equal(PLAN_SCHEMA_VERSION, 1);
  const expected = [
    "invalid-schema",
    "invalid-rollback-strategy",
    "missing-reference",
    "hash-mismatch",
    "inventory-mismatch",
    "change-name-mismatch",
  ];
  for (const code of expected) {
    assert.ok(PLAN_REJECTION_CODES.includes(code), `missing ${code}`);
  }
  assert.equal(PLAN_REJECTION_CODES.length, expected.length);
});

test("isKnownRejectionCode: unknown future code fails closed", () => {
  assert.equal(isKnownRejectionCode("hash-mismatch"), true);
  assert.equal(isKnownRejectionCode("future-exotic-code"), false);
});

test("consumer path: unknown code in validator result is treated fail-closed", () => {
  // Simulates a consumer that only trusts allowlisted codes.
  const synthetic = { valid: false, codes: ["future-exotic-code"], errors: [] };
  const trusted = synthetic.codes.filter(isKnownRejectionCode);
  const accepted =
    synthetic.valid === true &&
    trusted.length === synthetic.codes.length &&
    synthetic.codes.length === 0;
  // Any unknown code ⇒ reject (fail-closed), even if somehow valid:true.
  const reject =
    !synthetic.valid ||
    synthetic.codes.some((c) => !isKnownRejectionCode(c)) ||
    trusted.length === 0;
  assert.equal(accepted, false);
  assert.equal(reject, true);
});

// --- validatePlanAgainstSnapshot ---------------------------------------------

test("validatePlanAgainstSnapshot: wrong content_sha256 → hash-mismatch", () => {
  const contentKey = "specs/routing/spec.md";
  const plan = minimalPlan({
    spec_writes: [
      {
        domain: "routing",
        source_delta: "specs/routing/spec.md",
        target: "openspec/specs/routing/spec.md",
        target_before_sha256: sha256Hex(Buffer.from("old-target")),
        content_sha256: sha256Hex(Buffer.from("prepared-A")),
      },
    ],
  });
  const snapshot = {
    changeName: "hybrid-archive-transaction-runtime",
    sourceFingerprint: plan.source_fingerprint,
    originInventory: [
      { path: "proposal.md", sha256: sha256Hex(Buffer.from("p")) },
      { path: "state.yaml", sha256: sha256Hex(Buffer.from("s")) },
    ],
    targets: {
      "openspec/specs/routing/spec.md": sha256Hex(Buffer.from("old-target")),
    },
    preparedContent: {
      [contentKey]: sha256Hex(Buffer.from("prepared-B")),
    },
    adrSources: {},
  };
  const result = validatePlanAgainstSnapshot(plan, snapshot);
  assert.equal(result.valid, false);
  assert.ok(result.codes.includes("hash-mismatch"));
});

test("validatePlanAgainstSnapshot: stale target_before_sha256 → hash-mismatch", () => {
  const contentKey = "specs/routing/spec.md";
  const prepared = sha256Hex(Buffer.from("prepared-A"));
  const plan = minimalPlan({
    spec_writes: [
      {
        domain: "routing",
        source_delta: "specs/routing/spec.md",
        target: "openspec/specs/routing/spec.md",
        target_before_sha256: sha256Hex(Buffer.from("stale-expected")),
        content_sha256: prepared,
      },
    ],
  });
  const snapshot = {
    changeName: "hybrid-archive-transaction-runtime",
    sourceFingerprint: plan.source_fingerprint,
    originInventory: [
      { path: "proposal.md", sha256: sha256Hex(Buffer.from("p")) },
      { path: "state.yaml", sha256: sha256Hex(Buffer.from("s")) },
    ],
    targets: {
      "openspec/specs/routing/spec.md": sha256Hex(Buffer.from("actual-live")),
    },
    preparedContent: { [contentKey]: prepared },
    adrSources: {},
  };
  const result = validatePlanAgainstSnapshot(plan, snapshot);
  assert.equal(result.valid, false);
  assert.ok(result.codes.includes("hash-mismatch"));
});

test("validatePlanAgainstSnapshot: missing prepared path → missing-reference", () => {
  const plan = minimalPlan({
    spec_writes: [
      {
        domain: "routing",
        source_delta: "specs/routing/spec.md",
        target: "openspec/specs/routing/spec.md",
        target_before_sha256: null,
        content_sha256: sha256Hex(Buffer.from("prepared-A")),
      },
    ],
  });
  const snapshot = {
    changeName: "hybrid-archive-transaction-runtime",
    sourceFingerprint: plan.source_fingerprint,
    originInventory: [
      { path: "proposal.md", sha256: sha256Hex(Buffer.from("p")) },
      { path: "state.yaml", sha256: sha256Hex(Buffer.from("s")) },
    ],
    targets: { "openspec/specs/routing/spec.md": null },
    preparedContent: {},
    adrSources: {},
  };
  const result = validatePlanAgainstSnapshot(plan, snapshot);
  assert.equal(result.valid, false);
  assert.ok(result.codes.includes("missing-reference"));
});

test("validatePlanAgainstSnapshot: inventory/fingerprint drift → inventory-mismatch", () => {
  const plan = minimalPlan({
    archive_inventory: ["proposal.md", "state.yaml", "extra.md"],
    source_fingerprint: sha256Hex(Buffer.from("wrong-fp")),
  });
  const snapshot = {
    changeName: "hybrid-archive-transaction-runtime",
    sourceFingerprint: sha256Hex(Buffer.from("actual-fp")),
    originInventory: [
      { path: "proposal.md", sha256: sha256Hex(Buffer.from("p")) },
      { path: "state.yaml", sha256: sha256Hex(Buffer.from("s")) },
    ],
    targets: {},
    preparedContent: {},
    adrSources: {},
  };
  const result = validatePlanAgainstSnapshot(plan, snapshot);
  assert.equal(result.valid, false);
  assert.ok(result.codes.includes("inventory-mismatch"));
});

test("validatePlanAgainstSnapshot: matching snapshot succeeds", () => {
  const prepared = sha256Hex(Buffer.from("prepared-A"));
  const before = sha256Hex(Buffer.from("old-target"));
  const originInventory = [
    { path: "proposal.md", sha256: sha256Hex(Buffer.from("p")) },
    { path: "state.yaml", sha256: sha256Hex(Buffer.from("s")) },
  ];
  // fingerprint = SHA-256 over "{sha256}  {posixPath}\n" sorted by path
  const lines = originInventory
    .slice()
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((e) => `${e.sha256}  ${e.path}\n`)
    .join("");
  const fingerprint = sha256Hex(Buffer.from(lines, "utf8"));
  const plan = minimalPlan({
    source_fingerprint: fingerprint,
    archive_inventory: ["proposal.md", "state.yaml"],
    spec_writes: [
      {
        domain: "routing",
        source_delta: "specs/routing/spec.md",
        target: "openspec/specs/routing/spec.md",
        target_before_sha256: before,
        content_sha256: prepared,
      },
    ],
    adr_promotions: [
      {
        source: "decisions/adr-001.md",
        target: "docs/adr/adr-001-archive.md",
        content_sha256: sha256Hex(Buffer.from("adr-bytes")),
      },
    ],
  });
  const snapshot = {
    changeName: "hybrid-archive-transaction-runtime",
    sourceFingerprint: fingerprint,
    originInventory,
    targets: { "openspec/specs/routing/spec.md": before },
    preparedContent: { "specs/routing/spec.md": prepared },
    adrSources: {
      "decisions/adr-001.md": sha256Hex(Buffer.from("adr-bytes")),
    },
  };
  const result = validatePlanAgainstSnapshot(plan, snapshot);
  assert.equal(result.valid, true);
  assert.deepEqual(result.codes, []);
});

test("validatePlanShape: path confinement rejects ../, absolute, domain ..", () => {
  const { isSafeChangeName } = require("./archive-plan.js");
  const digest = sha256Hex(Buffer.from("x"));
  const bad = [
    { spec_writes: [{ domain: "r", source_delta: "../x", target: "openspec/specs/r/spec.md", content_sha256: digest }] },
    { spec_writes: [{ domain: "r", source_delta: "s.md", target: "/etc/passwd", content_sha256: digest }] },
    { spec_writes: [{ domain: "..", source_delta: "s.md", target: "openspec/specs/r/spec.md", content_sha256: digest }] },
    { adr_promotions: [{ source: "a.md", target: "docs/../evil.md", content_sha256: digest }] },
    { archive_inventory: ["C:/Windows/System32/config"] },
  ];
  for (const overrides of bad) {
    const r = validatePlanShape(minimalPlan(overrides), { changeName: "hybrid-archive-transaction-runtime" });
    assert.equal(r.valid, false);
    assert.ok(r.codes.includes("invalid-schema"));
  }
  assert.equal(isSafeChangeName("demo-change"), true);
  assert.equal(isSafeChangeName("../evil"), false);
  assert.equal(isSafeChangeName("/tmp/x"), false);
});
