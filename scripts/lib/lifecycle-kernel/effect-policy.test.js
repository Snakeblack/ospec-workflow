"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  requireEffectClass,
  applyEffectPolicy,
  selectIrreversibleAmbiguousNext,
  blockDirectWrite,
  EFFECT_CLASSES,
} = require("./effect-policy.js");
const { reconcileEffect } = require("./journal.js");

test("requireEffectClass fails closed when missing or unknown", () => {
  assert.equal(requireEffectClass({ kind: "persist-node" }).code, "effect-class-required");
  assert.equal(requireEffectClass({ effect_class: "exactly-once" }).code, "effect-class-required");
  assert.equal(requireEffectClass({ effect_class: "idempotent-keyed" }).ok, true);
});

test("idempotent-keyed retries reuse same key; pure may re-evaluate; no exactly-once claims", () => {
  const keyed = applyEffectPolicy({
    effect_class: "idempotent-keyed",
    reconcileAction: "retry-execute",
    effect_id: "sha256:effect-1",
  });
  assert.equal(keyed.ok, true);
  assert.equal(keyed.same_key, true);
  assert.equal(keyed.idempotency_key, "sha256:effect-1");
  assert.equal(keyed.claims_exactly_once, false);

  const pure = applyEffectPolicy({
    effect_class: "pure",
    reconcileAction: "execute",
  });
  assert.equal(pure.may_reevaluate, true);
  assert.equal(pure.claims_exactly_once, false);

  for (const cls of EFFECT_CLASSES) {
    const policy = applyEffectPolicy({ effect_class: cls, reconcileAction: "execute" });
    if (cls === "irreversible") {
      assert.equal(policy.claims_exactly_once, false);
    } else {
      assert.equal(policy.claims_exactly_once, false);
    }
  }
});

test("ambiguous irreversible selects decide or stop; no auto-retry; not code defect", () => {
  const ambiguous = applyEffectPolicy({
    effect_class: "irreversible",
    ambiguous: true,
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, "irreversible-ambiguous");
  assert.equal(ambiguous.auto_retry, false);
  assert.equal(ambiguous.not_code_defect, true);
  assert.ok(["decide", "stop"].includes(ambiguous.next_kind));
  assert.deepEqual([...ambiguous.allowed_next_kinds].sort(), ["decide", "stop"]);

  assert.equal(selectIrreversibleAmbiguousNext("stop"), "stop");
  assert.equal(selectIrreversibleAmbiguousNext("decide"), "decide");

  const journalAmbiguous = reconcileEffect({
    record: {
      status: "unknown",
      effect_id: "e1",
      effect_class: "irreversible",
    },
    effect_class: "irreversible",
  });
  assert.equal(journalAmbiguous.code, "irreversible-ambiguous");
});

test("direct-write without permit+CAS+class blocked; compliant path ok", () => {
  assert.equal(
    blockDirectWrite({ hasPermit: false, usedCas: true, hasEffectClass: true }).code,
    "direct-write-blocked"
  );
  assert.equal(
    blockDirectWrite({ hasPermit: true, usedCas: false, hasEffectClass: true }).code,
    "direct-write-blocked"
  );
  assert.equal(
    blockDirectWrite({ hasPermit: true, usedCas: true, hasEffectClass: false }).code,
    "direct-write-blocked"
  );
  assert.equal(
    blockDirectWrite({ hasPermit: true, usedCas: true, hasEffectClass: true }).ok,
    true
  );
});
