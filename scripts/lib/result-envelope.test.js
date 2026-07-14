"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { extractEnvelope, validateEnvelope } = require("./result-envelope.js");

const VALID_ENVELOPE = {
  status: "success",
  executive_summary: "Did the thing.",
  artifacts: ["openspec/changes/foo/design.md"],
  next_recommended: "sdd-tasks",
  risks: "None",
  skill_resolution: "injected",
};

function fence(obj) {
  return `Some prose before.\n\n\`\`\`json:result-envelope\n${JSON.stringify(obj)}\n\`\`\`\n\nSome prose after.`;
}

// --- extractEnvelope --------------------------------------------------------

test("extractEnvelope: finds and parses a valid fence", () => {
  const result = extractEnvelope(fence(VALID_ENVELOPE));

  assert.equal(result.found, true);
  assert.deepEqual(result.value, VALID_ENVELOPE);
});

test("extractEnvelope: absent fence returns found:false", () => {
  const result = extractEnvelope("Just prose, no fence at all.");

  assert.equal(result.found, false);
  assert.equal(result.value, undefined);
});

test("extractEnvelope: malformed JSON inside fence returns found:true, value:null", () => {
  const text = "```json:result-envelope\n{ not valid json \n```";
  const result = extractEnvelope(text);

  assert.equal(result.found, true);
  assert.equal(result.value, null);
});

test("extractEnvelope: does not match a bare json fence (no info-string suffix)", () => {
  const text = "```json\n{\"status\":\"success\"}\n```";
  const result = extractEnvelope(text);

  assert.equal(result.found, false);
});

test("extractEnvelope: never throws on non-string input", () => {
  assert.doesNotThrow(() => extractEnvelope(undefined));
  assert.doesNotThrow(() => extractEnvelope(null));
  assert.doesNotThrow(() => extractEnvelope(42));
  assert.equal(extractEnvelope(undefined).found, false);
});

// --- validateEnvelope --------------------------------------------------------

test("validateEnvelope: valid envelope passes with no errors", () => {
  const result = validateEnvelope(VALID_ENVELOPE);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

for (const field of [
  "status",
  "executive_summary",
  "artifacts",
  "next_recommended",
  "risks",
  "skill_resolution",
]) {
  test(`validateEnvelope: missing required field "${field}" is invalid`, () => {
    const envelope = { ...VALID_ENVELOPE };
    delete envelope[field];

    const result = validateEnvelope(envelope);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes(field)));
  });
}

test("validateEnvelope: bad status enum value is invalid", () => {
  const result = validateEnvelope({ ...VALID_ENVELOPE, status: "done" });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("status")));
});

test("validateEnvelope: artifacts accepts the literal string \"inline\"", () => {
  const result = validateEnvelope({ ...VALID_ENVELOPE, artifacts: "inline" });

  assert.equal(result.valid, true);
});

test("validateEnvelope: risks accepts a list as well as a string", () => {
  const result = validateEnvelope({ ...VALID_ENVELOPE, risks: ["Some risk"] });

  assert.equal(result.valid, true);
});

test("validateEnvelope: status:blocked requires question_gate", () => {
  const result = validateEnvelope({
    ...VALID_ENVELOPE,
    status: "blocked",
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("question_gate")));
});

test("validateEnvelope: status:blocked with question_gate is valid", () => {
  const result = validateEnvelope({
    ...VALID_ENVELOPE,
    status: "blocked",
    question_gate: { reason: "r", questions: [] },
  });

  assert.equal(result.valid, true);
});

test("validateEnvelope: bad blocker_type enum value is invalid", () => {
  const result = validateEnvelope({
    ...VALID_ENVELOPE,
    status: "blocked",
    question_gate: { reason: "r", questions: [] },
    blocker_type: "not-a-real-type",
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("blocker_type")));
});

test("validateEnvelope: known blocker_type enum values are valid", () => {
  for (const blockerType of [
    "needs_user_decision",
    "design-mismatch",
    "spec-change-required",
    "workload-escalation",
  ]) {
    const result = validateEnvelope({
      ...VALID_ENVELOPE,
      status: "blocked",
      question_gate: { reason: "r", questions: [] },
      blocker_type: blockerType,
    });

    assert.equal(result.valid, true, `expected ${blockerType} to be valid`);
  }
});

test("validateEnvelope: invalid assumptions[] entry (missing field) is invalid", () => {
  const result = validateEnvelope({
    ...VALID_ENVELOPE,
    assumptions: [
      {
        id: "sdd-design-001",
        phase: "sdd-design",
        statement: "Use camelCase.",
        reversibility: "high",
        // basis missing
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("assumptions")));
});

test("validateEnvelope: invalid assumptions[] entry (bad reversibility enum) is invalid", () => {
  const result = validateEnvelope({
    ...VALID_ENVELOPE,
    assumptions: [
      {
        id: "sdd-design-001",
        phase: "sdd-design",
        statement: "Use camelCase.",
        reversibility: "maybe",
        basis: "existing pattern",
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("reversibility")));
});

test("validateEnvelope: well-formed assumptions[] entry is valid", () => {
  const result = validateEnvelope({
    ...VALID_ENVELOPE,
    assumptions: [
      {
        id: "sdd-design-001",
        phase: "sdd-design",
        statement: "Use camelCase.",
        reversibility: "high",
        basis: "existing pattern",
      },
    ],
  });

  assert.equal(result.valid, true);
});

test("validateEnvelope: never throws on garbage input", () => {
  assert.doesNotThrow(() => validateEnvelope(null));
  assert.doesNotThrow(() => validateEnvelope(undefined));
  assert.doesNotThrow(() => validateEnvelope("not an object"));
  assert.doesNotThrow(() => validateEnvelope([]));

  const result = validateEnvelope(null);
  assert.equal(result.valid, false);
});

// --- Deterministic error message parity (mirrored byte-for-byte in Go) -----

test("validateEnvelope: bad status enum message lists values in declaration order", () => {
  const result = validateEnvelope({ ...VALID_ENVELOPE, status: "nope" });

  assert.ok(
    result.errors.includes("status must be one of: success, partial, blocked"),
    `expected a deterministic, declaration-ordered message; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateEnvelope: bad reversibility enum message lists values in declaration order", () => {
  const result = validateEnvelope({
    ...VALID_ENVELOPE,
    assumptions: [
      { id: "a-1", phase: "sdd-apply", statement: "x", reversibility: "nope", basis: "y" },
    ],
  });

  assert.ok(
    result.errors.includes(
      "assumptions[0].reversibility must be one of: low, high",
    ),
    `expected a deterministic, declaration-ordered message; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateEnvelope: bad blocker_type enum message lists values in declaration order", () => {
  const result = validateEnvelope({ ...VALID_ENVELOPE, blocker_type: "nope" });

  assert.ok(
    result.errors.includes(
      "blocker_type must be one of: needs_user_decision, design-mismatch, spec-change-required, workload-escalation",
    ),
    `expected a deterministic, declaration-ordered message; got: ${JSON.stringify(result.errors)}`,
  );
});

// --- Phase-aware sdd-spec ambiguity contract --------------------------------

const AMBIGUITY_SIGNALS = {
  residual_ambiguity: false,
  public_contract_questions: [],
  conflicting_requirements: [],
  missing_acceptance_criteria: [],
};

function validSpecEnvelope(overrides = {}) {
  return { ...VALID_ENVELOPE, ...AMBIGUITY_SIGNALS, ...overrides };
}

test("validateEnvelope: generic validation remains compatible without spec signals", () => {
  assert.deepEqual(validateEnvelope(VALID_ENVELOPE), { valid: true, errors: [] });
  assert.deepEqual(validateEnvelope(VALID_ENVELOPE, { phase: "sdd-design" }), {
    valid: true,
    errors: [],
  });
});

test("validateEnvelope: successful sdd-spec requires signals in canonical order", () => {
  const result = validateEnvelope(VALID_ENVELOPE, { phase: "sdd-spec" });

  assert.deepEqual(result.errors, [
    "missing required field: residual_ambiguity",
    "missing required field: public_contract_questions",
    "missing required field: conflicting_requirements",
    "missing required field: missing_acceptance_criteria",
  ]);
});

test("validateEnvelope: valid successful sdd-spec signals pass", () => {
  assert.deepEqual(validateEnvelope(validSpecEnvelope(), { phase: "sdd-spec" }), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(
    validateEnvelope(
      validSpecEnvelope({ residual_ambiguity: true, public_contract_questions: ["Public API?"] }),
      { phase: "sdd-spec" },
    ),
    { valid: true, errors: [] },
  );
});

test("validateEnvelope: spec signal types and elements fail deterministically", () => {
  const result = validateEnvelope(
    validSpecEnvelope({
      residual_ambiguity: "false",
      public_contract_questions: "none",
      conflicting_requirements: ["valid", 42],
      missing_acceptance_criteria: [null],
    }),
    { phase: "sdd-spec" },
  );

  assert.deepEqual(result.errors, [
    "residual_ambiguity must be a boolean",
    "public_contract_questions must be an array of strings",
    "conflicting_requirements[1] must be a string",
    "missing_acceptance_criteria[0] must be a string",
  ]);
});

test("validateEnvelope: present spec signals are type-checked generically", () => {
  const result = validateEnvelope(
    { ...VALID_ENVELOPE, public_contract_questions: [false] },
    { phase: "sdd-design" },
  );
  assert.deepEqual(result.errors, ["public_contract_questions[0] must be a string"]);
});

test("validateEnvelope: partial and blocked sdd-spec do not require signals", () => {
  const partial = { ...VALID_ENVELOPE, status: "partial" };
  const blocked = {
    ...VALID_ENVELOPE,
    status: "blocked",
    question_gate: { reason: "Need input", questions: [] },
  };

  assert.deepEqual(validateEnvelope(partial, { phase: "sdd-spec" }), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(validateEnvelope(blocked, { phase: "sdd-spec" }), {
    valid: true,
    errors: [],
  });
});
