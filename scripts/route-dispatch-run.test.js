"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractAttributionOverride } = require("./route-dispatch-run.js");

const COMMENTED_CONFIG = `# ---------------------------------------------------------------------------
# quality_review: (OPTIONAL — commented out; uncomment to activate)
# ---------------------------------------------------------------------------
# quality_review:
#   attribution_override:
#     justification: "example"
#     scope:
#       - "schemas/kernel/**"
#     applies_to:
#       - "public-kernel-contract-unattributed"
routes:
  bugfix:
    gates: [quality-review-gate]
`;

const DECLARED_CONFIG = `routes:
  bugfix:
    gates: [quality-review-gate]

quality_review:
  attribution_override:
    justification: "Clean kernel parity change verified with zero findings"
    scope:
      - "schemas/kernel/**"
    applies_to:
      - "public-kernel-contract-unattributed"
`;

const MALFORMED_CONFIG = `quality_review:
  attribution_override:
    justification: ""
    scope:
      - "schemas/kernel/**"
    applies_to:
      - "not-an-ambiguity-code"
`;

test("QRAR-002: extractAttributionOverride is a strict no-op when the block is absent or commented", () => {
  assert.equal(extractAttributionOverride(COMMENTED_CONFIG), null);
  assert.equal(extractAttributionOverride(""), null);
  assert.equal(extractAttributionOverride(null), null);
});

test("QRAR-002: extractAttributionOverride parses and validates a declared block", () => {
  const extracted = extractAttributionOverride(DECLARED_CONFIG);
  assert.equal(extracted.valid, true);
  assert.deepEqual(extracted.errors, []);
  assert.deepEqual(extracted.block, {
    justification: "Clean kernel parity change verified with zero findings",
    scope: ["schemas/kernel/**"],
    applies_to: ["public-kernel-contract-unattributed"],
  });
});

test("QRAR-002: extractAttributionOverride fails closed on malformed declarations", () => {
  const extracted = extractAttributionOverride(MALFORMED_CONFIG);
  assert.equal(extracted.valid, false);
  assert.ok(extracted.errors.length >= 2);
  assert.deepEqual(extracted.block, {
    justification: "",
    scope: ["schemas/kernel/**"],
    applies_to: ["not-an-ambiguity-code"],
  });
});
