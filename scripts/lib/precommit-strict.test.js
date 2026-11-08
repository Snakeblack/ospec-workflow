"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { resolvePrecommitStrict } = require("./precommit-strict.js");

test("IDD without openspec follows strict_tdd, including a missing key", () => {
  assert.deepStrictEqual(resolvePrecommitStrict({ iddText: "strict_tdd: true\n" }), {
    active: "idd",
    activeStrict: true,
    contradiction: false,
    idd: { present: true, mode: null, strict: true, invalid: false },
    openspec: { present: false, strict: false },
  });
  const omitted = resolvePrecommitStrict({ iddText: "checks:\n  test: npm test\n" });
  assert.equal(omitted.active, "idd");
  assert.equal(omitted.activeStrict, false);
  assert.equal(omitted.contradiction, false);
});

test("a missing idd config follows openspec tdd_mode and ignores a legacy strict_tdd flag", () => {
  const strict = resolvePrecommitStrict({ openspecText: "testing:\n  tdd_mode: strict\n" });
  assert.equal(strict.active, "sdd");
  assert.equal(strict.activeStrict, true);
  assert.equal(strict.contradiction, false);
  const legacy = resolvePrecommitStrict({ openspecText: "testing:\n  tdd_mode: standard\nstrict_tdd: true\n" });
  assert.equal(legacy.activeStrict, false);
});

test("the inactive source is a contradiction and does not change the hook", () => {
  const idd = resolvePrecommitStrict({
    iddText: "strict_tdd: false\n",
    openspecText: "testing:\n  tdd_mode: strict\n",
  });
  assert.equal(idd.active, "idd");
  assert.equal(idd.activeStrict, false);
  assert.equal(idd.contradiction, true);

  const sdd = resolvePrecommitStrict({
    iddText: "mode: sdd\nstrict_tdd: true\n",
    openspecText: "testing:\n  tdd_mode: focused\n",
  });
  assert.equal(sdd.active, "sdd");
  assert.equal(sdd.activeStrict, false);
  assert.equal(sdd.contradiction, true);

  const agree = resolvePrecommitStrict({
    iddText: "strict_tdd: true\n",
    openspecText: "testing:\n  tdd_mode: strict\n",
  });
  assert.equal(agree.activeStrict, true);
  assert.equal(agree.contradiction, false);
});

test("an unreadable idd config stays IDD and does not fall through to openspec", () => {
  const decision = resolvePrecommitStrict({
    iddText: "strict_tdd: yes\n",
    openspecText: "testing:\n  tdd_mode: strict\n",
  });
  assert.equal(decision.active, "idd");
  assert.equal(decision.activeStrict, false);
  assert.equal(decision.idd.invalid, true);
  assert.equal(decision.contradiction, false);
});

test("openspec tdd_mode is read from testing, never from a comment or another section", () => {
  const commented = resolvePrecommitStrict({ openspecText: "# tdd_mode: strict\ntesting:\n  tdd_mode: standard\n" });
  assert.equal(commented.activeStrict, false);
  const inline = resolvePrecommitStrict({ openspecText: "testing: # tdd_mode: strict\n  tdd_mode: focused\n" });
  assert.equal(inline.activeStrict, false);
  const elsewhere = resolvePrecommitStrict({ openspecText: "review:\n  tdd_mode: strict\ntesting:\n  coverage: 80\n" });
  assert.equal(elsewhere.activeStrict, false);
  const quoted = resolvePrecommitStrict({ openspecText: "testing:\n  coverage: 80\n  tdd_mode: \"strict\" # enforced\n" });
  assert.equal(quoted.activeStrict, true);
});
