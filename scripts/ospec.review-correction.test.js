"use strict";

// End-to-end contract of the ospec CLI, run as a child process against a
// temporary project root: the bounded correction of a review (E1.63) and the
// review receipts. The helpers the parts share are in
// scripts/lib/test-support/ospec-cli.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { buildReceipt, receiptPath } = require("./lib/review-receipt.js");
const {
  tempRoot,
  ospec,
  assertGateStep,
  OPEN_BUG,
  FEATURE_COVER,
  openFeature,
  gitInit,
  writeFile,
  project,
  stateOf,
  OPEN_DOCS,
  openRotation,
  review,
  BLOCKER,
  answer,
  recordAnswer,
} = require("./lib/test-support/ospec-cli.js");

// E1.63 (#498): fixing a WARNING of an approved review needed a whole
// successor review. The approved review now spends its one bounded correction
// on its advisory findings, validated by review-correction.
const WARNING = { severity: "WARNING", summary: "The TTL is a magic number.", acceptance_criteria: "The TTL has a name." };

test("a warning of an approved review is fixed with its bounded correction, not a successor review", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const frozen = recordAnswer(root, [WARNING]);
  assert.strictEqual(frozen.json.review.status, "approved");
  const [finding] = frozen.json.review.findings;
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");

  writeFile(root, "src/auth/tokens.js", "const TTL = 3600; module.exports = { ttl: TTL };\n");
  const stale = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(stale.json.verdict, "missing");
  assert.match(stale.json.missing.find((entry) => entry.obligation === "trust-review").reason, /ospec review correct \(--finding <id> names some of them\)/);

  const unknown = review(root, "correct", "--finding", "F-0000000000000000");
  assert.strictEqual(unknown.json.error.code, "review-refused");
  assert.match(unknown.json.error.message, /is not an advisory finding of the approved review/);

  const corrected = review(root, "correct", "--finding", finding.id);
  assert.strictEqual(corrected.code, 0, corrected.stderr);
  assert.strictEqual(corrected.json.review.status, "approved");
  assert.deepStrictEqual(corrected.json.review.correction, { kind: "advisory", status: "validating", finding_ids: [finding.id] });
  const { validate } = corrected.json.review;
  assert.strictEqual(validate.validator, "review-correction");
  assert.deepStrictEqual(validate.findings, [{ id: finding.id, severity: "WARNING", summary: WARNING.summary, acceptance_criteria: WARNING.acceptance_criteria }]);
  assert.deepStrictEqual(validate.paths, ["src/auth/tokens.js"]);
  assert.deepStrictEqual(review(root, "start").json.review.validate, validate, "review start returns the validation request again");
  const text = ospec(root, "review", "start", "--change", "rotate-tokens").stdout;
  assert.match(text, new RegExp(`dispatch review-correction for ${finding.id} on: src/auth/tokens\\.js`));
  assert.match(text, new RegExp(`${finding.id} is resolved when: The TTL has a name\\.`));
  assert.match(text, new RegExp(`advisory correction of ${finding.id}: validating`));

  const verdict = {
    request_digest: validate.request_digest,
    reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:1"] }],
    outcomes: [{ id: finding.id, status: "resolved" }],
    regression: { detected: false, evidence: ["the exported ttl is still 3600"] },
  };
  assert.match(review(root, "validate", "--result", JSON.stringify({ ...verdict, reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:2"] }] })).json.error.message, /src\/auth\/tokens\.js:2/);
  const validated = review(root, "validate", "--result", JSON.stringify(verdict));
  assert.strictEqual(validated.code, 0, validated.stderr);
  assert.ok(validated.json.evidence);
  assert.strictEqual(validated.json.review.correction.status, "passed");
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");
  const state = stateOf(root, "rotate-tokens");
  assert.strictEqual(state.reviews.length, 1, "no successor review ran");
  assert.strictEqual(state.evidence.find((entry) => entry.id === validated.json.evidence).detail.correction, "advisory");

  // The approval covers the corrected tree, and the review has no correction left.
  writeFile(root, "src/auth/tokens.js", "const TTL = 7200; module.exports = { ttl: TTL };\n");
  const again = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.doesNotMatch(again.json.missing.find((entry) => entry.obligation === "trust-review").reason, /ospec review correct/);
  assert.match(review(root, "correct").json.error.message, /already used its one bounded correction: run ospec review start/);
  assert.strictEqual(review(root, "start").json.review.generation, 2);
});

test("an advisory correction that does not pass, or does not fit, leaves the change to a successor review", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const [finding] = recordAnswer(root, [WARNING]).json.review.findings;

  // A file the review never froze does not fit the bounded correction.
  writeFile(root, "src/auth/tokens.js", "const TTL = 3600; module.exports = { ttl: TTL };\n");
  writeFile(root, "src/auth/ttl.js", "module.exports = 3600;\n");
  assert.match(review(root, "correct").json.error.message, /does not fit one bounded correction.*ospec review start/);
  fs.rmSync(path.join(root, "src/auth/ttl.js"));

  const { validate } = review(root, "correct").json.review;
  const failed = review(root, "validate", "--result", JSON.stringify({
    request_digest: validate.request_digest,
    reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:1"] }],
    outcomes: [{ id: finding.id, status: "resolved" }],
    regression: { detected: true, evidence: ["the module no longer exports ttl"] },
  }));
  assert.strictEqual(failed.code, 0, failed.stderr);
  assert.ok(!failed.json.evidence, "a failed correction records no evidence");
  assert.strictEqual(failed.json.review.correction.status, "failed");
  const checked = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(checked.json.verdict, "missing");
  assert.match(checked.json.missing.find((entry) => entry.obligation === "trust-review").reason, /^the reviewed paths changed after the review: change the code and run ospec review start/);
  assert.strictEqual(review(root, "start").json.review.generation, 2);
});

test("a correction outside one bounded correction escalates and review start opens the successor", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const frozen = recordAnswer(root, [BLOCKER]);
  const [finding] = frozen.json.review.findings;

  // The fix needs a file the review never froze.
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600, rejectExpired: true };\n");
  writeFile(root, "src/auth/expiry.js", "module.exports = (token) => token.exp > Date.now();\n");
  const refused = review(root, "correct");
  assert.strictEqual(refused.code, 1);
  assert.strictEqual(refused.json.error.code, "review-refused");
  assert.match(refused.json.error.message, /does not fit one bounded correction.*ospec review start/);

  const successor = review(root, "start");
  assert.strictEqual(successor.code, 0, successor.stderr);
  assert.strictEqual(successor.json.review.generation, 2);
  assert.deepStrictEqual(successor.json.review.request.predecessor_findings.map((entry) => entry.id), [finding.id]);
  const [first, second] = stateOf(root, "rotate-tokens").reviews;
  assert.strictEqual(first.status, "escalated");
  assert.strictEqual(second.predecessor_lineage_id, first.lineage_id);
  assert.ok(second.genesis.paths.includes("src/auth/expiry.js"), "the successor reviews the new path");
});

// review-limit-oversized-correction: with the reviews used up and the last
// one waiting for its correction, a fix outside one bounded correction looped:
// check asked for review correct, correct for review start, and start refused
// with review-limit while no gate opened.
test("an oversized correction of the last allowed review opens review-limit on check", (t) => {
  const root = openRotation(t);
  recordAnswer(root, [BLOCKER]);
  for (let generation = 2; generation <= 3; generation += 1) {
    // Each fix needs a file the review never froze: review start escalates.
    writeFile(root, `src/auth/expiry${generation}.js`, "module.exports = (token) => token.exp > Date.now();\n");
    const frozen = recordAnswer(root, [BLOCKER]);
    assert.strictEqual(frozen.json.review.generation, generation);
    assert.strictEqual(frozen.json.review.status, "correction-required");
  }
  const [finding] = stateOf(root, "rotate-tokens").reviews.at(-1).findings;
  writeFile(root, "src/auth/expiry4.js", "module.exports = (token) => token.exp > Date.now();\n");
  assert.match(review(root, "correct").json.error.message, /does not fit one bounded correction/);
  assert.strictEqual(review(root, "start").json.error.code, "review-limit");

  const checked = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.match(checked.json.missing.find((entry) => entry.obligation === "trust-review").reason, /review-limit/);
  const settled = stateOf(root, "rotate-tokens");
  assert.strictEqual(settled.reviews.at(-1).status, "escalated");
  assert.match(settled.reviews.at(-1).terminal_reason, /bounded correction/);
  assert.deepStrictEqual(settled.gates.filter((gate) => gate.id === "review-limit").map((gate) => gate.status), ["open"]);
  assertGateStep(ospec(root, "next", "--change", "rotate-tokens", "--json").json.next_step, "review-limit");

  ospec(root, "record", "gate", "--change", "rotate-tokens", "--gate", "review-limit", "--resolve", "--answer", "One more review.", "--source", "user", "--json");
  const fourth = review(root, "start");
  assert.strictEqual(fourth.code, 0, fourth.stderr);
  assert.strictEqual(fourth.json.review.generation, 4);
  assert.deepStrictEqual(fourth.json.review.request.predecessor_findings.map((entry) => entry.id), [finding.id]);
  assert.ok(fourth.json.review.request.paths.includes("src/auth/expiry4.js"), "the successor reviews the new path");
});

test("check leaves a correction that fits, or one with reviews left, to ospec review", (t) => {
  const root = openRotation(t);
  recordAnswer(root, [BLOCKER]);
  // Reviews left: review start escalates and opens the successor, not check.
  writeFile(root, "src/auth/expiry.js", "module.exports = (token) => token.exp > Date.now();\n");
  ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.at(-1).status, "correction-required");
  for (let generation = 2; generation <= 3; generation += 1) {
    writeFile(root, `src/auth/expiry${generation}.js`, "module.exports = (token) => token.exp > Date.now();\n");
    recordAnswer(root, [BLOCKER]);
  }
  // The last review, with a fix inside its frozen paths: one bounded correction.
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600, rejectExpired: true };\n");
  const checked = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.match(checked.json.missing.find((entry) => entry.obligation === "trust-review").reason, /ospec review correct/);
  const settled = stateOf(root, "rotate-tokens");
  assert.strictEqual(settled.reviews.at(-1).status, "correction-required");
  assert.deepStrictEqual(settled.gates.filter((gate) => gate.id === "review-limit"), []);
  assert.strictEqual(review(root, "correct").code, 0);
});

// OSP-029 (#351): a {"findings":[]} the main agent wrote by hand approved the
// review and let the change close without any reviewer run.
test("review record refuses a result that does not cite the frozen candidate", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const refusedWith = (result, pattern) => {
    const refused = review(root, "record", "--result", result);
    assert.strictEqual(refused.code, 1, refused.stdout);
    assert.strictEqual(refused.json.error.code, "review-refused");
    assert.match(refused.json.error.message, pattern);
  };
  refusedWith(JSON.stringify({ findings: [] }), /request_digest/);
  assert.notStrictEqual(ospec(root, "next", "--change", "rotate-tokens", "--json").json.next_step.action, "close");
  refusedWith(answer(root, [], { reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:2"] }] }), /src\/auth\/tokens\.js:2/);
  refusedWith(answer(root, [{ ...BLOCKER, location: undefined }]), /location/);
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews[0].status, "reviewing");

  const recorded = recordAnswer(root);
  assert.strictEqual(recorded.code, 0, recorded.stderr);
  assert.strictEqual(recorded.json.review.status, "approved");
  const evidence = stateOf(root, "rotate-tokens").evidence.find((entry) => entry.id === recorded.json.evidence);
  assert.strictEqual(evidence.detail.attestation, "relayed");

  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");
  const closed = ospec(root, "close", "--change", "rotate-tokens", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
  assert.deepStrictEqual(closed.json.reviews, [{ evidence: evidence.id, lineage_id: evidence.detail.lineage_id, attestation: "relayed" }]);
  assert.match(ospec(root, "close", "--change", "rotate-tokens").stdout, new RegExp(`trust review ${evidence.id}: relayed`));
});

// OSP-029 step 2: the receipt the SubagentStop hook leaves for the reviewer's
// result attests it; the same digest with another result is refused.
test("a SubagentStop receipt of the reviewer's result is recorded as subagent-stop", (t) => {
  const root = openRotation(t);
  // As installed: .ospec/ is ignored, which git add refuses to exclude.
  writeFile(root, ".gitignore", ".ospec/\n");
  const result = JSON.parse(answer(root));
  const receipt = buildReceipt({ agent: "review-trust", result, recordedAt: "2026-10-21T08:00:00.000Z" });
  fs.mkdirSync(path.join(root, ".ospec", "review-receipts"), { recursive: true });
  fs.writeFileSync(receiptPath(root, result.request_digest), JSON.stringify(receipt));

  const changed = review(root, "record", "--result", JSON.stringify({ ...result, findings: [BLOCKER] }));
  assert.strictEqual(changed.json.error.code, "review-refused");
  assert.match(changed.json.error.message, /differs from the one review-trust returned/);

  const recorded = review(root, "record", "--result", JSON.stringify(result));
  assert.strictEqual(recorded.code, 0, recorded.stdout);
  assert.strictEqual(recorded.json.warnings, undefined);
  const evidence = stateOf(root, "rotate-tokens").evidence.find((entry) => entry.id === recorded.json.evidence);
  assert.strictEqual(evidence.detail.attestation, "subagent-stop");
  assert.strictEqual(evidence.detail.receipt.result_digest, receipt.result_digest);
  assert.ok(fs.existsSync(receiptPath(root, result.request_digest)), "the receipt is kept");

  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");
  const closed = ospec(root, "close", "--change", "rotate-tokens", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
  assert.strictEqual(closed.json.reviews[0].attestation, "subagent-stop");
});

// The receipt lands in the working tree: in a project that does not ignore
// .ospec/ it must not count as a changed path, or the one bounded correction
// looks oversized and review start escalates the lineage.
test("a review receipt in a project that does not ignore .ospec/ is not part of the diff", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const frozen = recordAnswer(root, [BLOCKER]);
  const [finding] = frozen.json.review.findings;
  const digest = `sha256:${"c".repeat(64)}`;
  fs.mkdirSync(path.join(root, ".ospec", "review-receipts"), { recursive: true });
  fs.writeFileSync(receiptPath(root, digest), JSON.stringify(buildReceipt({ agent: "review-trust", result: { request_digest: digest, findings: [] }, recordedAt: "2026-10-21T08:00:00.000Z" })));

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600, rejectExpired: true };\n");
  const corrected = review(root, "correct");
  assert.strictEqual(corrected.code, 0, corrected.stdout);
  assert.deepStrictEqual(corrected.json.review.validate.finding_ids, [finding.id]);
  assert.deepStrictEqual(corrected.json.review.validate.paths, ["src/auth/tokens.js"]);
  assert.ok(!ospec(root, "check", "--change", "rotate-tokens", "--json").stdout.includes(".ospec/review-receipts"), "check does not see the receipt");
});

test("a deleted reviewed path is cited in the base tree", (t) => {
  const root = openRotation(t);
  fs.rmSync(path.join(root, "src", "pages.txt"));
  ospec(root, "check", "--change", "rotate-tokens", "--json");
  const { request } = review(root, "start").json.review;
  assert.ok(request.paths.includes("src/pages.txt"));
  const recorded = recordAnswer(root);
  assert.strictEqual(recorded.code, 0, recorded.stdout);
  assert.strictEqual(recorded.json.review.status, "approved");
});

test("a change opened before the first commit reviews what it commits too (gate bypass)", (t) => {
  const root = tempRoot(t);
  const git = gitInit(root);
  ospec(root, ...OPEN_BUG, "--path", "src/auth/login.js");
  writeFile(root, "src/auth/login.js", "module.exports = 1;\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "login");
  writeFile(root, "src/other.js", "module.exports = 2;\n");

  const started = ospec(root, "review", "start", "--change", "fix-pagination", "--json");
  assert.strictEqual(started.code, 0, started.stdout);
  const { request } = started.json.review;
  assert.deepStrictEqual(request.paths, ["src/auth/login.js", "src/other.js"]);
  const result = JSON.stringify({ request_digest: request.request_digest, reviewed: request.paths.map((file) => ({ path: file, cites: [`${file}:1`] })), findings: [] });
  assert.strictEqual(ospec(root, "review", "record", "--change", "fix-pagination", "--result", result, "--json").json.review.status, "approved");

  // A security file committed after the review is a reviewed path that changed.
  writeFile(root, "src/auth/session.js", "module.exports = 3;\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "session");
  const checked = ospec(root, "check", "--change", "fix-pagination", "--json");
  assert.match(checked.json.missing.find((entry) => entry.obligation === "trust-review")?.reason ?? "", /reviewed paths changed after the review/);
});

// review computed its verdict without the command suggestion and said no
// command was known while next and check proposed one.
test("review proposes the project's check command while no check is declared, as check does", (t) => {
  const { root } = project(t, { checks: null });
  writeFile(root, "package.json", `${JSON.stringify({ scripts: { test: "node verify.js" } })}\n`);
  openFeature(root, "record", "intent", "--change", "rotate-tokens", "--kind", "feature", "--summary", "Rotate tokens.", "--acceptance", "Old tokens expire.", ...FEATURE_COVER);
  ospec(root, "signals", "--change", "rotate-tokens", "--path", "src/auth/tokens.js");
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600 };\n");
  const started = review(root, "start");
  assert.strictEqual(started.code, 0, started.stdout);
  const reason = (result) => result.json.missing.find((entry) => entry.obligation === "checks-pass").reason;
  assert.match(reason(started), /Proposed command: npm test\./);
  assert.strictEqual(reason(started), reason(ospec(root, "check", "--change", "rotate-tokens", "--json")));
});

test("review refuses bad results, a change without the obligation and an unknown action", (t) => {
  const root = openRotation(t);
  review(root, "start");
  assert.strictEqual(review(root, "record").code, 2, "record needs --result");
  assert.strictEqual(review(root, "record", "--result", "{not json").code, 2);
  const invalid = review(root, "record", "--result", answer(root, [{ severity: "HUGE" }]));
  assert.strictEqual(invalid.code, 1);
  assert.strictEqual(invalid.json.error.code, "review-refused");
  assert.strictEqual(review(root, "restart").code, 2);

  ospec(root, ...OPEN_DOCS);
  const docs = ospec(root, "review", "start", "--change", "fix-readme", "--json");
  assert.strictEqual(docs.json.error.code, "unknown-obligation");
});

test("a documentation-only change closes its checks without any review", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "docs/security/token-rotation.md", "Rotate tokens hourly.\n");
  const checked = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(checked.json.verdict, "ready");
  assert.deepStrictEqual(stateOf(root, "fix-readme").obligations.map((entry) => entry.id), ["checks-pass"]);
});
