"use strict";

// End-to-end contract of the ospec CLI, run as a child process against a
// temporary project root: the trust review on the bounded review lineage
// (E1.4 b2) and the files it keeps watching (E1.50). The helpers the parts
// share are in scripts/lib/test-support/ospec-cli.js.

const test = require("node:test");
const assert = require("node:assert");
const {
  ospec,
  assertGateStep,
  writeFile,
  stateOf,
  openRotation,
  review,
  BLOCKER,
  recordAnswer,
} = require("./lib/test-support/ospec-cli.js");

// E1.4 (b2): the trust review on the bounded review lineage (REQ-idd-016).

test("a trust review without blockers satisfies trust-review until the reviewed paths change", (t) => {
  const root = openRotation(t);
  const started = review(root, "start");
  assert.strictEqual(started.code, 0, started.stderr);
  const { request_digest: digest, result_contract: contract, ...request } = started.json.review.request;
  assert.deepStrictEqual(request, {
    lineage_id: started.json.review.lineage_id,
    generation: 1,
    lens: "trust",
    reviewer: "review-trust",
    paths: ["src/auth/tokens.js", "src/auth/tokens.test.js", "src/pages.txt"],
  });
  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(contract, /reviewed/);

  const recorded = recordAnswer(root);
  assert.strictEqual(recorded.code, 0, recorded.stderr);
  assert.strictEqual(recorded.json.review.status, "approved");
  assert.ok(recorded.json.evidence);
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");

  writeFile(root, "notes.md", "unrelated\n");
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready", "other paths keep the review");

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 60 };\n");
  const stale = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.match(stale.json.missing.find((entry) => entry.obligation === "trust-review").reason, /reviewed paths changed after the review/);
  const successor = review(root, "start");
  assert.strictEqual(successor.json.review.generation, 2);
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 2);
  assert.strictEqual(successor.json.review.request.reviewer, "review-trust");
});

// E1.50: a file that gains a security sink after the approval is watched like
// a security path, whether or not the review saw it.
test("[E1.50] a file that gains a security sink after the approval leaves the trust review stale", (t) => {
  const root = openRotation(t);
  recordAnswer(root);
  const trust = () => ospec(root, "check", "--change", "rotate-tokens", "--json").json.missing?.find((entry) => entry.obligation === "trust-review");
  assert.strictEqual(trust(), undefined);
  writeFile(root, "src/report.js", "module.exports = (rows) => rows.length;\n");
  writeFile(root, "src/report.test.js", "test('rows', () => {});\n");
  assert.strictEqual(trust(), undefined, "a file without a sink keeps the review");
  writeFile(root, "src/report.js", "module.exports = (rows, id) => db.query(`SELECT * FROM rows WHERE id = ${id}`);\n");
  assert.match(trust()?.reason ?? "", /reviewed paths changed after the review/);
  assert.strictEqual(review(root, "start").json.review.generation, 2);
});

test("an IDD successor needs no approval, and an unchanged or exhausted review is refused", (t) => {
  const root = openRotation(t);
  review(root, "start");
  recordAnswer(root);
  const same = review(root, "start");
  assert.strictEqual(same.code, 1);
  assert.strictEqual(same.json.error.code, "review-current");
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 1);

  for (let generation = 2; generation <= 3; generation += 1) {
    writeFile(root, "src/auth/tokens.js", `module.exports = { ttl: ${generation} };\n`);
    ospec(root, "check", "--change", "rotate-tokens", "--json");
    const started = review(root, "start");
    assert.strictEqual(started.code, 0, started.stderr);
    assert.strictEqual(started.json.review.generation, generation);
    recordAnswer(root);
  }
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 4 };\n");
  const stale = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(stale.code, 0, stale.stderr);
  const exhausted = review(root, "start");
  assert.strictEqual(exhausted.code, 1);
  assert.strictEqual(exhausted.json.error.code, "review-limit");
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 3);
  ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 3, "check does not open another review");
});

test("a tree back on the approved candidate satisfies trust-review again", (t) => {
  const root = openRotation(t);
  review(root, "start");
  recordAnswer(root);
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 60 };\n");
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "missing");

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600 };\n");
  const restored = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(restored.json.verdict, "ready");
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 1);
});

test("after the last review the person authorizes one more through the review-limit gate", (t) => {
  const root = openRotation(t);
  const reviewLimit = () => stateOf(root, "rotate-tokens").gates.filter((gate) => gate.id === "review-limit");
  for (let generation = 1; generation <= 3; generation += 1) {
    writeFile(root, "src/auth/tokens.js", `module.exports = { ttl: ${generation} };\n`);
    ospec(root, "check", "--change", "rotate-tokens", "--json");
    review(root, "start");
    recordAnswer(root);
  }
  assert.deepStrictEqual(reviewLimit(), [], "an approved last review opens nothing");

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 4 };\n");
  const stale = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.match(stale.json.missing.find((entry) => entry.obligation === "trust-review").reason, /review-limit/);
  assert.deepStrictEqual(reviewLimit().map((gate) => gate.status), ["open"]);
  assertGateStep(ospec(root, "next", "--change", "rotate-tokens", "--json").json.next_step, "review-limit");
  assert.strictEqual(review(root, "start").json.error.code, "review-limit");
  const manual = ospec(root, "record", "gate", "--change", "rotate-tokens", "--gate", "review-limit", "--open", "--reason", "more", "--json");
  assert.strictEqual(manual.json.error.code, "gate-managed-by-review");

  ospec(root, "record", "gate", "--change", "rotate-tokens", "--gate", "review-limit", "--resolve", "--answer", "One more review.", "--source", "user", "--json");
  const fourth = review(root, "start");
  assert.strictEqual(fourth.code, 0, fourth.stderr);
  assert.strictEqual(fourth.json.review.generation, 4);
  recordAnswer(root);
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 5 };\n");
  ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.deepStrictEqual(reviewLimit().map((gate) => gate.status), ["resolved", "open"], "each authorization buys one review");
  assert.strictEqual(review(root, "start").json.error.code, "review-limit");
});

test("a blocker gets one bounded correction validated against its frozen id", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const frozen = recordAnswer(root, [BLOCKER]);
  assert.strictEqual(frozen.json.review.status, "correction-required");
  const [finding] = frozen.json.review.findings;
  assert.strictEqual(finding.blocking, true);

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600, rejectExpired: true };\n");
  const corrected = review(root, "correct");
  assert.strictEqual(corrected.code, 0, corrected.stderr);
  const { validate } = corrected.json.review;
  assert.strictEqual(validate.validator, "review-correction");
  assert.deepStrictEqual(validate.finding_ids, [finding.id]);
  assert.deepStrictEqual(validate.paths, ["src/auth/tokens.js"]);
  assert.deepStrictEqual(review(root, "start").json.review.validate, validate, "review start returns the validation request again");

  const outcomes = [{ id: finding.id, status: "resolved" }];
  const regression = { detected: false, evidence: ["expired tokens rejected"] };
  const uncited = review(root, "validate", "--result", JSON.stringify({ outcomes, regression }));
  assert.strictEqual(uncited.json.error.code, "review-refused");
  assert.match(uncited.json.error.message, /request_digest/);
  const pastEnd = { request_digest: validate.request_digest, reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:2"] }], outcomes, regression };
  assert.match(review(root, "validate", "--result", JSON.stringify(pastEnd)).json.error.message, /src\/auth\/tokens\.js:2/);

  const verdict = { ...pastEnd, reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:1"] }] };
  const validated = review(root, "validate", "--result", JSON.stringify(verdict));
  assert.strictEqual(validated.json.review.status, "approved");
  assert.match(validated.json.warnings.join("\n"), /no SubagentStop receipt of review-correction/);
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");
});
