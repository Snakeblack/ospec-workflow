"use strict";

// E1.4 (b2): the trust review of an IDD change on the bounded review lineage
// (openspec/specs/idd/spec.md, REQ-idd-016).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { validateState } = require("./idd-contract.js");
const { IddRecordError, recordIntent, recordSignal } = require("./idd-record.js");
const {
  MAX_REVIEWS,
  advisoryCorrection,
  buildCandidate,
  correctTrustReview,
  currentReview,
  recordTrustFindings,
  reviewedTree,
  settleReviewFreshness,
  startTrustReview,
  trustReason,
  validateTrustCorrection,
} = require("./idd-review.js");

const { resultDigest } = require("./review-receipt.js");

const AT = "2026-10-05T08:00:00.000Z";

function openAuth() {
  let { state } = recordIntent(null, {
    change: "rotate-tokens",
    kind: "feature",
    summary: "Rotate tokens.",
    acceptance: "Old tokens expire.",
    coverage: require("./idd-facts.js").citedCoverage(),
  });
  ({ state } = recordSignal(state, { id: "security-boundary", reason: "touches src/auth/tokens.js", source: "diff" }));
  return state;
}

function candidate(tree = "c".repeat(40), blob = "2".repeat(40)) {
  return buildCandidate({
    baseTree: "b".repeat(40),
    candidateTree: tree,
    numstat: [{ path: "src/auth/tokens.js", added: 10, deleted: 2 }],
    baseBlobs: new Map([["src/auth/tokens.js", "1".repeat(40)]]),
    candidateBlobs: new Map([["src/auth/tokens.js", blob]]),
  });
}

const BLOCKER = { severity: "BLOCKER", summary: "Old tokens never expire.", acceptance_criteria: "Expired tokens are rejected.", location: "src/auth/tokens.js:2" };
const ADVICE = { severity: "SUGGESTION", summary: "Name the TTL constant.", acceptance_criteria: "A named TTL." };

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof IddRecordError && error.code === code);
}

function obligation(state) {
  return state.obligations.find((entry) => entry.id === "trust-review");
}

function valid(state) {
  const { ok, errors } = validateState(state);
  assert.ok(ok, errors.join("; "));
}

// The line count of each file in the frozen trees, as the CLI reads them.
const LINES = new Map([["src/auth/tokens.js", 12], ["src/auth/session.js", 4]]);
const lineCount = (file) => LINES.get(file) ?? null;

// The reviewer's answer to the review in progress: the request digest and one
// cited entry per reviewed path.
function answer(state, findings, overrides = {}) {
  const { request } = startTrustReview(state, { candidate: candidate(), reviewedChanged: false });
  const reviewed = request.paths.map((file) => ({ path: file, cites: [`${file}:1-${LINES.get(file)}`] }));
  return { request_digest: request.request_digest, reviewed, findings, ...overrides };
}

function record(state, findings) {
  return recordTrustFindings(state, { result: answer(state, findings), recordedAt: AT, lineCount });
}

// The validator's answer to the correction: the validation request digest and
// one cited entry per corrected path.
function verdict(validate, status, overrides = {}) {
  const reviewed = validate.paths.map((file) => ({ path: file, cites: [`${file}:1`] }));
  const outcomes = validate.finding_ids.map((id) => ({ id, status }));
  return { request_digest: validate.request_digest, reviewed, outcomes, regression: { detected: false, evidence: ["tests cover expiry"] }, ...overrides };
}

function correct(state, changes = [{ path: "src/auth/tokens.js", added: 2, deleted: 1 }]) {
  return correctTrustReview(state, { changes, candidateTree: "d".repeat(40), diffHash: `sha256:${"9".repeat(64)}` });
}

// The receipt the SubagentStop hook writes for a reviewer result (REQ-hooks-027).
function receiptOf(agent, result) {
  return (digest) => (digest === result.request_digest
    ? { schema: "ospec-review-receipt/v1", request_digest: digest, agent, result_digest: resultDigest(result), recorded_at: AT }
    : null);
}

test("a candidate digests the reviewed paths, their blobs and the changed lines", () => {
  const built = candidate();
  assert.deepStrictEqual(built.paths, ["src/auth/tokens.js"]);
  assert.strictEqual(built.original_changed_lines, 12);
  assert.strictEqual(built.authored_lines, 10);
  assert.match(built.diff_hash, /^sha256:[0-9a-f]{64}$/);
  assert.notStrictEqual(candidate(undefined, "3".repeat(40)).diff_hash, built.diff_hash);
  assert.throws(() => buildCandidate({ baseTree: "b", candidateTree: "c", numstat: [], baseBlobs: new Map(), candidateBlobs: new Map() }), /nothing to review/);
});

test("starting a review freezes the candidate and runs only the trust lens", () => {
  const { state, request } = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true });
  const lineage = currentReview(state);
  assert.strictEqual(lineage.schema_version, 2);
  assert.deepStrictEqual(lineage.genesis.selected_domains, ["trust"]);
  assert.strictEqual(lineage.lenses.trust.status, "running");
  const { request_digest: digest, result_contract: contract, ...rest } = request;
  assert.deepStrictEqual(rest, { lineage_id: lineage.lineage_id, generation: 1, lens: "trust", reviewer: "review-trust", paths: ["src/auth/tokens.js"] });
  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(contract, /request_digest/);
  assert.match(contract, /reviewed/);
  valid(state);

  const again = startTrustReview(state, { candidate: candidate(), reviewedChanged: false });
  assert.strictEqual(again.changed, false, "a review in progress is resumed, not restarted");
  assert.strictEqual(again.state.reviews.length, 1);
});

test("findings without a blocker approve the review and record frozen-review evidence", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const { state, evidence } = record(started, [ADVICE]);
  assert.strictEqual(currentReview(state).status, "approved");
  assert.strictEqual(evidence, "ev-1");
  assert.strictEqual(obligation(state).status, "satisfied");
  assert.deepStrictEqual(Object.keys(state.evidence[0].detail).sort(), ["attestation", "candidate_id", "candidate_tree", "findings_digest", "lineage_id"]);
  valid(state);
  assertCode(() => recordTrustFindings(state, { result: { findings: [] }, recordedAt: AT, lineCount }), "review-refused");
});

// OSP-029 (#351): any {"findings":[]} the main agent wrote approved the
// review. A result must now answer the request in progress and cite, in the
// frozen trees, every path it reviewed and the place of each blocking finding.
test("a result must answer the request and cite each reviewed path in the frozen trees", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const refused = (result, pattern) => assert.throws(
    () => recordTrustFindings(started, { result, recordedAt: AT, lineCount }),
    (error) => error instanceof IddRecordError && error.code === "review-refused" && pattern.test(error.message),
  );
  const cited = (...cites) => [{ path: "src/auth/tokens.js", cites }];

  refused({ findings: [] }, /request_digest/);
  refused(answer(started, [], { request_digest: `sha256:${"0".repeat(64)}` }), /request_digest/);
  refused(answer(started, [], { reviewed: undefined }), /reviewed/);
  refused(answer(started, [], { reviewed: [] }), /src\/auth\/tokens\.js/);
  refused(answer(started, [], { reviewed: cited() }), /cite/);
  refused(answer(started, [], { reviewed: cited("src/auth/tokens.js:999") }), /src\/auth\/tokens\.js:999/);
  refused(answer(started, [], { reviewed: cited("src/auth/tokens.js:12-13") }), /12-13/);
  refused(answer(started, [], { reviewed: cited("src/auth/session.js:1") }), /src\/auth\/session\.js:1/);
  refused(answer(started, [], { reviewed: cited("tokens.js") }), /tokens\.js/);
  refused(answer(started, [], { reviewed: [...cited("src/auth/tokens.js:1"), { path: "src/auth/session.js", cites: ["src/auth/session.js:1"] }] }), /outside the request/);
  refused(answer(started, [{ ...BLOCKER, location: undefined }]), /location/);
  refused(answer(started, [{ ...BLOCKER, location: "src/auth/tokens.js:13" }]), /src\/auth\/tokens\.js:13/);
  refused(answer(started, [{ ...ADVICE, location: "src/missing.js:1" }]), /src\/missing\.js:1/);
  assert.strictEqual(currentReview(started).status, "reviewing", "a refused result records nothing");

  const advice = { ...ADVICE, location: "src/auth/session.js:2" };
  const { state } = recordTrustFindings(started, { result: answer(started, [advice], { reviewed: cited("src/auth/tokens.js:3", "src/auth/tokens.js:5-9") }), recordedAt: AT, lineCount });
  assert.strictEqual(currentReview(state).status, "approved");
  assert.strictEqual(currentReview(state).findings[0].location, "src/auth/session.js:2");
  assert.strictEqual(state.evidence[0].detail.attestation, "relayed");
  valid(state);

  // The digest of the previous generation does not answer its successor.
  const stale = settleReviewFreshness(state, { reviewedChanged: true });
  const successor = startTrustReview(stale, { candidate: candidate("e".repeat(40), "e".repeat(40)), reviewedChanged: true }).state;
  const previous = answer(started, []);
  assert.throws(
    () => recordTrustFindings(successor, { result: previous, recordedAt: AT, lineCount }),
    (error) => error.code === "review-refused" && /request_digest/.test(error.message),
  );
});

test("a blocker allows one bounded correction validated against the frozen findings", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const frozen = record(started, [BLOCKER]);
  assert.strictEqual(frozen.evidence, null);
  assert.strictEqual(currentReview(frozen.state).status, "correction-required");
  assert.match(trustReason(frozen.state), /fix the frozen blocking findings F-[0-9a-f]+ and run ospec review correct/);

  assertCode(
    () => correctTrustReview(frozen.state, { changes: [{ path: "src/other.js", added: 1, deleted: 0 }], candidateTree: "d".repeat(40), diffHash: `sha256:${"9".repeat(64)}` }),
    "review-refused",
  );
  assertCode(() => correctTrustReview(frozen.state, { changes: [], candidateTree: "d".repeat(40), diffHash: "x" }), "review-refused");

  const corrected = correct(frozen.state);
  const lineage = currentReview(corrected.state);
  assert.strictEqual(lineage.status, "validating");
  assert.strictEqual(lineage.correction_budget.used_lines, 3);
  assert.deepStrictEqual(corrected.validate.finding_ids, lineage.findings.map((finding) => finding.id));

  const approved = validateTrustCorrection(corrected.state, { result: verdict(corrected.validate, "resolved"), recordedAt: AT, lineCount });
  assert.strictEqual(currentReview(approved.state).status, "approved");
  assert.strictEqual(obligation(approved.state).status, "satisfied");
  valid(approved.state);
});

test("a failed validation ends the lineage: IDD allows one correction per review", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const frozen = record(started, [BLOCKER]).state;
  const corrected = correct(frozen, [{ path: "src/auth/tokens.js", added: 1, deleted: 0 }]);
  const failed = validateTrustCorrection(corrected.state, { result: verdict(corrected.validate, "unresolved"), recordedAt: AT, lineCount });
  assert.strictEqual(currentReview(failed.state).status, "escalated");
  assert.strictEqual(obligation(failed.state).status, "pending");
  assert.match(trustReason(failed.state), /change the code and run ospec review start for a successor review \(2 of 3\)/);
  valid(failed.state);
});

// OSP-029 follow-up: the validator's verdict approved the review with no
// proof that it read the correction. It now answers the validation request
// and cites each corrected path in the corrected tree, like a trust result.
test("a validation must answer the correction request and cite each corrected path", () => {
  const frozen = record(startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state, [BLOCKER]).state;
  const corrected = correct(frozen);
  const { validate } = corrected;
  assert.strictEqual(validate.validator, "review-correction");
  assert.deepStrictEqual(validate.paths, ["src/auth/tokens.js"]);
  assert.match(validate.request_digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(validate.result_contract, /request_digest/);
  assert.notStrictEqual(validate.request_digest, answer(frozen, []).request_digest, "validation has its own digest");
  assert.deepStrictEqual(startTrustReview(corrected.state, { candidate: candidate(), reviewedChanged: false }).validate, validate, "review start returns it again");
  assert.match(trustReason(corrected.state), /with the request ospec review start returns/);

  const refused = (result, pattern) => assert.throws(
    () => validateTrustCorrection(corrected.state, { result, recordedAt: AT, lineCount }),
    (error) => error instanceof IddRecordError && error.code === "review-refused" && pattern.test(error.message),
  );
  refused({ outcomes: verdict(validate, "resolved").outcomes, regression: { detected: false, evidence: ["ok"] } }, /request_digest/);
  refused(verdict(validate, "resolved", { request_digest: answer(frozen, []).request_digest }), /request_digest/);
  refused(verdict(validate, "resolved", { reviewed: undefined }), /reviewed/);
  refused(verdict(validate, "resolved", { reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:999"] }] }), /src\/auth\/tokens\.js:999/);
  assert.strictEqual(currentReview(corrected.state).status, "validating", "a refused verdict records nothing");
});

// OSP-029 step 2: the SubagentStop hook's receipt of the same result attests
// it; a result changed on its way under the same digest is refused; without
// a receipt the result is relayed and the CLI says so.
test("a SubagentStop receipt of the same result attests it, and a changed result is refused", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const result = answer(started, [ADVICE]);
  const relayed = recordTrustFindings(started, { result, recordedAt: AT, lineCount });
  assert.strictEqual(relayed.state.evidence[0].detail.attestation, "relayed");
  assert.match(relayed.warnings.join("\n"), /no SubagentStop receipt of review-trust/);

  const other = recordTrustFindings(started, { result, recordedAt: AT, lineCount, receiptFor: receiptOf("review-correction", result) });
  assert.strictEqual(other.state.evidence[0].detail.attestation, "relayed", "a receipt of another agent does not count");

  assert.throws(
    () => recordTrustFindings(started, { result: { ...result, findings: [] }, recordedAt: AT, lineCount, receiptFor: receiptOf("review-trust", result) }),
    (error) => error.code === "review-refused" && /differs from the one review-trust returned/.test(error.message),
  );

  const reformatted = JSON.parse(JSON.stringify({ findings: result.findings, reviewed: result.reviewed, request_digest: result.request_digest }, null, 2));
  const attested = recordTrustFindings(started, { result: reformatted, recordedAt: AT, lineCount, receiptFor: receiptOf("review-trust", result) });
  assert.deepStrictEqual(attested.warnings, []);
  assert.deepStrictEqual(attested.state.evidence[0].detail.receipt, { agent: "review-trust", recorded_at: AT, result_digest: resultDigest(result) });
  assert.strictEqual(attested.state.evidence[0].detail.attestation, "subagent-stop");
  valid(attested.state);

  const forged = structuredClone(attested.state);
  delete forged.evidence[0].detail.receipt;
  assert.strictEqual(validateState(forged).ok, false, "subagent-stop needs its receipt");

  const frozen = record(started, [BLOCKER]).state;
  const { validate, state: corrected } = correct(frozen);
  const answered = verdict(validate, "resolved");
  assert.throws(
    () => validateTrustCorrection(corrected, { result: { ...answered, regression: { detected: true, evidence: ["x"] } }, recordedAt: AT, lineCount, receiptFor: receiptOf("review-correction", answered) }),
    (error) => error.code === "review-refused" && /differs from the one review-correction returned/.test(error.message),
  );
  const approved = validateTrustCorrection(corrected, { result: answered, recordedAt: AT, lineCount, receiptFor: receiptOf("review-correction", answered) });
  assert.strictEqual(currentReview(approved.state).status, "approved");
  assert.strictEqual(approved.state.evidence[0].detail.attestation, "subagent-stop");
  assert.strictEqual(approved.state.evidence[0].detail.receipt.agent, "review-correction");
  valid(approved.state);
});

test("a successor needs a changed candidate and at most three reviews run per change", () => {
  let state = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  state = record(state, []).state;
  assertCode(() => startTrustReview(state, { candidate: candidate(), reviewedChanged: false }), "review-current");

  state = settleReviewFreshness(state, { reviewedChanged: true });
  assert.strictEqual(obligation(state).status, "pending");
  assertCode(() => startTrustReview(state, { candidate: candidate(), reviewedChanged: false }), "candidate-unchanged");

  for (let generation = 2; generation <= MAX_REVIEWS; generation += 1) {
    const next = startTrustReview(state, { candidate: candidate("e".repeat(39) + generation, String(generation).repeat(40)), reviewedChanged: true });
    assert.strictEqual(next.request.generation, generation);
    assert.strictEqual(currentReview(next.state).predecessor_lineage_id, currentReview(state).lineage_id);
    state = record(next.state, []).state;
    state = settleReviewFreshness(state, { reviewedChanged: true });
  }
  assertCode(() => startTrustReview(state, { candidate: candidate("f".repeat(40), "f".repeat(40)), reviewedChanged: true }), "review-limit");
  assert.match(trustReason(state), /3 of 3 trust reviews used/);
  valid(state);
});

test("a change the previous CLI left with its reviews used up gets the review-limit gate", () => {
  let state = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  for (let generation = 1; generation <= MAX_REVIEWS; generation += 1) {
    if (generation > 1) {
      state = settleReviewFreshness(state, { reviewedChanged: true });
      state = startTrustReview(state, { candidate: candidate("e".repeat(39) + generation, String(generation).repeat(40)), reviewedChanged: true }).state;
    }
    state = record(state, []).state;
  }
  // What the previous CLI wrote: trust-review pending, no review-limit gate.
  const legacy = structuredClone(state);
  Object.assign(obligation(legacy), { status: "pending", evidence: [] });
  valid(legacy);

  const settled = settleReviewFreshness(legacy, { reviewedChanged: true });
  assert.deepStrictEqual(settled.gates.map(({ id, status }) => ({ id, status })), [{ id: "review-limit", status: "open" }]);
  valid(settled);
  const { recordGate } = require("./idd-record.js");
  const answered = recordGate(settled, { id: "review-limit", action: "resolve", answer: "One more.", source: "user" }).state;
  const fourth = startTrustReview(answered, { candidate: candidate("f".repeat(40), "f".repeat(40)), reviewedChanged: true });
  assert.strictEqual(fourth.request.generation, MAX_REVIEWS + 1);
  valid(fourth.state);
});

test("a reconciliation-required lineage is not replaced by a successor", () => {
  let state = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  state = record(state, []).state;
  const lineage = currentReview(state);
  lineage.status = "reconciliation-required";
  const again = startTrustReview(state, { candidate: candidate("e".repeat(40), "e".repeat(40)), reviewedChanged: true });
  assert.strictEqual(again.changed, false);
  assert.strictEqual(again.state.reviews.length, 1);
  assert.strictEqual(currentReview(again.state).lineage_id, lineage.lineage_id);
  assert.strictEqual(currentReview(again.state).status, "reconciliation-required");
});

test("a fresh approved review stays satisfied", () => {
  let state = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  state = record(state, []).state;
  assert.strictEqual(obligation(settleReviewFreshness(state, { reviewedChanged: false })).status, "satisfied");
});

test("frozen-review evidence must name an approved review of its candidate", () => {
  let state = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  state = record(state, []).state;
  const forged = structuredClone(state);
  forged.evidence[0].detail.candidate_id = `sha256:${"0".repeat(64)}`;
  assert.strictEqual(validateState(forged).ok, false);
  const unreviewed = structuredClone(state);
  unreviewed.reviews = [];
  assert.strictEqual(validateState(unreviewed).ok, false);
});

// Archived states keep validating: evidence from before OSP-029 has no
// attestation, and relayed evidence names no receipt.
test("frozen-review evidence without attestation or relayed stays valid, and a receipt needs subagent-stop", () => {
  const state = record(startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state, []).state;
  valid(state);
  const legacy = structuredClone(state);
  delete legacy.evidence[0].detail.attestation;
  valid(legacy);
  const unknown = structuredClone(state);
  unknown.evidence[0].detail.attestation = "observed";
  assert.strictEqual(validateState(unknown).ok, false);
  const relayedWithReceipt = structuredClone(state);
  relayedWithReceipt.evidence[0].detail.receipt = { agent: "review-trust", recorded_at: AT, result_digest: `sha256:${"1".repeat(64)}` };
  assert.strictEqual(validateState(relayedWithReceipt).ok, false);
  const badReceipt = structuredClone(relayedWithReceipt);
  badReceipt.evidence[0].detail.attestation = "subagent-stop";
  valid(badReceipt);
  badReceipt.evidence[0].detail.receipt.agent = "sdd-apply";
  assert.strictEqual(validateState(badReceipt).ok, false);
});

test("REQ-idd-016 names the review commands, the reviewer and the limits", () => {
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "idd", "spec.md"), "utf8");
  const start = spec.indexOf("{#REQ-idd-016}");
  assert.ok(start !== -1, "REQ-idd-016 is missing");
  const end = spec.indexOf("### Requirement:", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  for (const name of ["ospec review start", "ospec review record", "ospec review correct", "ospec review validate", "review-trust", "review-correction", "reviews", "frozen-review", "trust", "request_digest", "reviewed", "location", "attestation: relayed", "attestation: subagent-stop", "result_contract", "review-refused", "advisory_corrections", "--finding <id>", "correction: advisory", "findings"]) {
    assert.ok(section.includes(`\`${name}\``), `REQ-idd-016 must name ${name}`);
  }
  assert.ok(section.includes(String(MAX_REVIEWS)), "REQ-idd-016 must state the review limit");
});

// review-oversized-correction: a fix that does not fit one bounded correction
// (over the line budget or outside the frozen paths) used to leave the change
// stuck in correction-required. `ospec review start` now ends that lineage as
// escalated and opens the successor, which carries the unresolved blocking
// findings so the reviewer checks them.
test("a correction that does not fit the bounded correction escalates to a successor review", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const frozen = record(started, [BLOCKER, ADVICE]).state;
  const predecessor = currentReview(frozen);
  const budget = predecessor.correction_budget.limit_lines;

  // A correction that fits keeps the review in progress: run ospec review correct.
  const fits = startTrustReview(frozen, {
    candidate: candidate("d".repeat(40), "3".repeat(40)),
    reviewedChanged: true,
    correctionChanges: [{ path: "src/auth/tokens.js", added: 1, deleted: 0 }],
  });
  assert.strictEqual(fits.changed, false);
  assert.strictEqual(fits.request.generation, 1);

  for (const correctionChanges of [
    [{ path: "src/auth/tokens.js", added: budget + 1, deleted: 0 }],
    [{ path: "src/auth/session.js", added: 1, deleted: 0 }],
  ]) {
    const next = startTrustReview(frozen, { candidate: candidate("d".repeat(40), "3".repeat(40)), reviewedChanged: true, correctionChanges });
    assert.strictEqual(next.changed, true);
    const ended = next.state.reviews[0];
    assert.strictEqual(ended.status, "escalated");
    assert.match(ended.terminal_reason, /bounded correction/);
    assert.strictEqual(next.request.generation, 2);
    assert.strictEqual(currentReview(next.state).predecessor_lineage_id, predecessor.lineage_id);
    assert.deepStrictEqual(next.request.predecessor_findings, [{
      id: predecessor.findings.find((finding) => finding.blocking).id,
      severity: "BLOCKER",
      summary: BLOCKER.summary,
      acceptance_criteria: BLOCKER.acceptance_criteria,
    }]);
    assert.strictEqual(obligation(next.state).status, "pending");
    valid(next.state);
  }
});

test("the escalated successor counts toward the three reviews of a change", () => {
  let state = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  for (let generation = 1; generation <= MAX_REVIEWS; generation += 1) {
    if (generation > 1) {
      state = startTrustReview(state, {
        candidate: candidate("e".repeat(39) + generation, String(generation).repeat(40)),
        reviewedChanged: true,
        correctionChanges: [{ path: "src/auth/other.js", added: 1, deleted: 0 }],
      }).state;
    }
    state = record(state, [BLOCKER]).state;
  }
  assertCode(() => startTrustReview(state, {
    candidate: candidate("f".repeat(40), "f".repeat(40)),
    reviewedChanged: true,
    correctionChanges: [{ path: "src/auth/other.js", added: 1, deleted: 0 }],
  }), "review-limit");
  assert.strictEqual(currentReview(state).status, "correction-required", "the refused start leaves the last review as it was");

  // review-limit-oversized-correction: no review is left to escalate into, so
  // the check ends the review and asks the person through review-limit.
  const oversized = [{ path: "src/auth/other.js", added: 1, deleted: 0 }];
  const fits = settleReviewFreshness(state, { reviewedChanged: true, correctionChanges: [{ path: "src/auth/tokens.js", added: 1, deleted: 0 }] });
  assert.strictEqual(currentReview(fits).status, "correction-required");
  assert.deepStrictEqual(fits.gates, []);
  const settled = settleReviewFreshness(state, { reviewedChanged: true, correctionChanges: oversized });
  assert.strictEqual(currentReview(settled).status, "escalated");
  assert.match(currentReview(settled).terminal_reason, /bounded correction/);
  assert.deepStrictEqual(settled.gates.map(({ id, status }) => ({ id, status })), [{ id: "review-limit", status: "open" }]);
  assert.match(trustReason(settled), /3 of 3 trust reviews used/);
  valid(settled);
  assert.deepStrictEqual(settleReviewFreshness(settled, { reviewedChanged: true }).gates, settled.gates, "the gate opens once");

  const { recordGate } = require("./idd-record.js");
  const answered = recordGate(settled, { id: "review-limit", action: "resolve", answer: "One more.", source: "user" }).state;
  const fourth = startTrustReview(answered, { candidate: candidate("f".repeat(40), "f".repeat(40)), reviewedChanged: true });
  assert.strictEqual(fourth.request.generation, MAX_REVIEWS + 1);
  assert.strictEqual(fourth.request.predecessor_findings.length, 1);
});

test("a check leaves an oversized correction with reviews left to ospec review start", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const frozen = record(started, [BLOCKER]).state;
  const settled = settleReviewFreshness(frozen, { reviewedChanged: true, correctionChanges: [{ path: "src/auth/other.js", added: 1, deleted: 0 }] });
  assert.strictEqual(currentReview(settled).status, "correction-required");
  assert.deepStrictEqual(settled.gates, []);
});

// E1.37 (#415): the result_contract names the format limits the CLI enforces,
// so a reviewer does not learn them from a refusal it cannot always undo.
test("each result_contract states the format limits the CLI enforces", () => {
  const { state, request } = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true });
  for (const limit of [/cites a non-empty list/, /start <= end <= its line count/, /at most 1000 characters/, /BLOCKER\|CRITICAL\|WARNING\|SUGGESTION/]) {
    assert.match(request.result_contract, limit);
  }
  const { validate } = correct(record(state, [BLOCKER]).state);
  for (const limit of [/cites a non-empty list/, /evidence: a non-empty list of strings of at most 500 characters/, /\{owner: trust\|runtime\|evolution\|efficiency, summary\}/, /summary of at most 500 characters/]) {
    assert.match(validate.result_contract, limit);
  }
});

// E1.63 (#498): fixing a WARNING or SUGGESTION of an approved review used to
// need a whole successor review, which counts toward the three of a change.
// An approved review that froze advisory findings and used no correction now
// takes its one bounded correction for them, validated by review-correction,
// and the lineage stays approved and untouched.
const WARNING = { severity: "WARNING", summary: "The TTL is read on every call.", acceptance_criteria: "The TTL is read once." };
const FIX = [{ path: "src/auth/tokens.js", added: 2, deleted: 1 }];
const CORRECTED = "d".repeat(40);

// An approved review of the given advisory findings whose reviewed paths changed.
function approvedThenChanged(findings = [ADVICE]) {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  return settleReviewFreshness(record(started, findings).state, { reviewedChanged: true, correctionChanges: FIX });
}

function correctAdvisory(state, overrides = {}) {
  return correctTrustReview(state, { changes: FIX, candidateTree: CORRECTED, diffHash: `sha256:${"9".repeat(64)}`, recordedAt: AT, ...overrides });
}

function validate(state, result, extra = {}) {
  return validateTrustCorrection(state, { result, recordedAt: AT, lineCount, ...extra });
}

test("an approved review corrects its advisory findings with one bounded correction, without a successor", () => {
  const changed = approvedThenChanged();
  assert.strictEqual(obligation(changed).status, "pending");
  assert.match(trustReason(changed), /ospec review correct \(--finding <id> names some of them\).*ospec review start for a successor review \(2 of 3\)/);
  const lineage = currentReview(changed);
  const [advice] = lineage.findings;

  const corrected = correctAdvisory(changed);
  const { request_digest: digest, result_contract: contract, ...rest } = corrected.validate;
  assert.deepStrictEqual(rest, {
    lineage_id: lineage.lineage_id,
    generation: 1,
    validator: "review-correction",
    finding_ids: [advice.id],
    findings: [{ id: advice.id, severity: "SUGGESTION", summary: ADVICE.summary, acceptance_criteria: ADVICE.acceptance_criteria }],
    paths: ["src/auth/tokens.js"],
  });
  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(contract, /outcomes with one \{id, status: resolved\|unresolved\}/);
  assert.strictEqual(obligation(corrected.state).status, "pending");
  assert.deepStrictEqual(currentReview(corrected.state), lineage, "the approved lineage is not touched");
  assert.strictEqual(advisoryCorrection(corrected.state, lineage).status, "validating");
  assert.strictEqual(reviewedTree(corrected.state), lineage.current_candidate.candidate_tree);
  assert.match(trustReason(corrected.state), new RegExp(`dispatch review-correction for ${advice.id} .*ospec review validate`));
  valid(corrected.state);

  // The request comes back while the correction waits, and no successor opens.
  const again = startTrustReview(corrected.state, { candidate: candidate("e".repeat(40), "e".repeat(40)), reviewedChanged: true });
  assert.strictEqual(again.changed, false);
  assert.deepStrictEqual(again.validate, corrected.validate);

  const passed = validate(corrected.state, verdict(corrected.validate, "resolved"));
  assert.strictEqual(passed.evidence, "ev-2");
  assert.strictEqual(obligation(passed.state).status, "satisfied");
  assert.deepStrictEqual(obligation(passed.state).evidence, ["ev-2"]);
  assert.strictEqual(passed.state.reviews.length, 1, "no successor review");
  assert.strictEqual(currentReview(passed.state).status, "approved");
  const { detail } = passed.state.evidence[1];
  assert.deepStrictEqual(
    { tree: detail.candidate_tree, correction: detail.correction, attestation: detail.attestation, candidate: detail.candidate_id },
    { tree: CORRECTED, correction: "advisory", attestation: "relayed", candidate: lineage.current_candidate_id },
  );
  const stored = advisoryCorrection(passed.state, lineage);
  assert.strictEqual(stored.status, "passed");
  assert.deepStrictEqual(stored.validation.outcomes, [{ id: advice.id, status: "resolved" }]);
  assert.strictEqual(reviewedTree(passed.state), CORRECTED);
  valid(passed.state);

  // One correction per review: neither a retry nor a check restores it.
  assertCode(() => correctAdvisory(passed.state, { candidateTree: "e".repeat(40) }), "review-refused");
  assert.throws(() => correctAdvisory(passed.state), /already used its one bounded correction: run ospec review start/);
  assertCode(() => validate(passed.state, verdict(corrected.validate, "resolved")), "review-refused");
  assert.strictEqual(obligation(settleReviewFreshness(passed.state, { reviewedChanged: false })).status, "satisfied");

  // The approval covers the corrected tree: leaving it and coming back restores its evidence.
  const stale = settleReviewFreshness(passed.state, { reviewedChanged: true, correctionChanges: FIX });
  assert.strictEqual(obligation(stale).status, "pending");
  assert.doesNotMatch(trustReason(stale), /ospec review correct/);
  const back = settleReviewFreshness(stale, { reviewedChanged: false });
  assert.deepStrictEqual(obligation(back).evidence, ["ev-2"]);
  valid(back);
});

test("--finding names the advisory findings a correction fixes, and nothing else", () => {
  const changed = approvedThenChanged([ADVICE, WARNING]);
  const lineage = currentReview(changed);
  const warning = lineage.findings.find((finding) => finding.severity === "WARNING");

  const all = correctAdvisory(changed);
  assert.deepStrictEqual(all.validate.finding_ids, lineage.findings.map((finding) => finding.id).sort());

  const one = correctAdvisory(changed, { findingIds: [warning.id, warning.id] });
  assert.deepStrictEqual(one.validate.finding_ids, [warning.id]);
  assert.deepStrictEqual(one.validate.findings.map((finding) => finding.severity), ["WARNING"]);
  assert.notStrictEqual(one.validate.request_digest, all.validate.request_digest);
  // The verdict covers exactly the named findings.
  assertCode(() => validate(one.state, verdict(all.validate, "resolved", { request_digest: one.validate.request_digest })), "review-refused");
  assert.strictEqual(validate(one.state, verdict(one.validate, "resolved")).evidence, "ev-2");

  assert.throws(() => correctAdvisory(changed, { findingIds: ["F-0000000000000000"] }), /F-0000000000000000 is not an advisory finding of the approved review/);

  // A blocking correction covers every frozen blocking finding: --finding is refused there.
  const blocked = record(startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state, [BLOCKER, ADVICE]).state;
  const advice = currentReview(blocked).findings.find((finding) => !finding.blocking);
  assert.throws(() => correctAdvisory(blocked, { findingIds: [advice.id] }), /--finding names advisory findings of an approved review/);
});

test("a failed advisory validation leaves trust-review pending and a successor review checks the change", () => {
  for (const result of [
    (request) => verdict(request, "unresolved"),
    (request) => verdict(request, "resolved", { regression: { detected: true, evidence: ["expired tokens pass again"] } }),
  ]) {
    const corrected = correctAdvisory(approvedThenChanged());
    const failed = validate(corrected.state, result(corrected.validate));
    assert.strictEqual(failed.evidence, null);
    assert.strictEqual(obligation(failed.state).status, "pending");
    assert.strictEqual(advisoryCorrection(failed.state, currentReview(failed.state)).status, "failed");
    assert.strictEqual(currentReview(failed.state).status, "approved");
    assert.strictEqual(failed.state.evidence.length, 1);
    valid(failed.state);
    assertCode(() => correctAdvisory(failed.state), "review-refused");
    assert.match(trustReason(failed.state), /^the reviewed paths changed after the review: change the code and run ospec review start/);

    const successor = startTrustReview(failed.state, { candidate: candidate("e".repeat(40), "e".repeat(40)), reviewedChanged: true });
    assert.strictEqual(successor.request.generation, 2);
    // Back on the reviewed candidate, the first approval still holds.
    assert.deepStrictEqual(obligation(settleReviewFreshness(failed.state, { reviewedChanged: false })).evidence, ["ev-1"]);
  }
});

test("an advisory correction keeps the frozen paths, the line budget and the one correction of its review", () => {
  const changed = approvedThenChanged();
  // The budget is half of the 12 reviewed lines.
  assert.throws(() => correctAdvisory(changed, { changes: [{ path: "src/auth/tokens.js", added: 5, deleted: 2 }] }), /does not fit one bounded correction.*ospec review start for a successor review/);
  assert.throws(() => correctAdvisory(changed, { changes: [...FIX, { path: "src/auth/session.js", added: 1, deleted: 0 }] }), /does not fit one bounded correction/);
  assert.throws(() => correctAdvisory(changed, { changes: [] }), /nothing changed since the reviewed candidate/);
  assert.strictEqual(correctAdvisory(changed, { changes: [{ path: "src/auth/tokens.js", added: 4, deleted: 2 }] }).validate.paths.length, 1);

  // A review without advisory findings has nothing to correct.
  const clean = settleReviewFreshness(record(startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state, []).state, { reviewedChanged: true });
  assert.throws(() => correctAdvisory(clean), /froze no advisory finding to correct: run ospec review start/);
  assert.doesNotMatch(trustReason(clean), /ospec review correct/);

  // A review approved through its blocking correction already used it.
  let state = record(startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state, [BLOCKER, ADVICE]).state;
  const blocking = correct(state);
  state = validate(blocking.state, verdict(blocking.validate, "resolved")).state;
  assert.strictEqual(currentReview(state).status, "approved");
  state = settleReviewFreshness(state, { reviewedChanged: true, correctionChanges: FIX });
  assert.throws(() => correctAdvisory(state, { changes: [{ path: "src/auth/tokens.js", added: 1, deleted: 0 }] }), /already used its one bounded correction/);
  assert.doesNotMatch(trustReason(state), /ospec review correct/);
});

test("an advisory validation answers its request, cites the corrected paths and takes the validator's receipt", () => {
  const corrected = correctAdvisory(approvedThenChanged());
  const request = corrected.validate;
  const good = verdict(request, "resolved");
  for (const result of [
    { ...good, request_digest: `sha256:${"0".repeat(64)}` },
    { ...good, reviewed: [] },
    { ...good, reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:99"] }] },
    { ...good, outcomes: [] },
    { ...good, outcomes: [...good.outcomes, { id: "F-0000000000000000", status: "resolved" }] },
    { ...good, outcomes: [{ ...good.outcomes[0], note: "extra" }] },
    { ...good, regression: { detected: false, evidence: [] } },
    { ...good, follow_ups: [{ owner: "risk", summary: "Old owner." }] },
  ]) {
    assertCode(() => validate(corrected.state, result), "review-refused");
  }
  const followed = { ...good, follow_ups: [{ owner: "trust", summary: " Rotate the signing key. " }] };
  const stored = advisoryCorrection(validate(corrected.state, followed).state, currentReview(corrected.state));
  assert.deepStrictEqual(stored.validation.follow_ups, [{ owner: "trust", summary: "Rotate the signing key." }]);

  // The receipt of review-correction attests it; another result under that digest is refused.
  const receipted = validate(corrected.state, good, { receiptFor: receiptOf("review-correction", good) });
  assert.strictEqual(receipted.state.evidence[1].detail.attestation, "subagent-stop");
  assert.strictEqual(receipted.state.evidence[1].detail.receipt.agent, "review-correction");
  assert.deepStrictEqual(receipted.warnings, []);
  valid(receipted.state);
  assertCode(() => validate(corrected.state, followed, { receiptFor: receiptOf("review-correction", good) }), "review-refused");
  assert.match(validate(corrected.state, good).warnings[0], /no SubagentStop receipt of review-correction/);
});

test("the review-limit gate waits while the last review can take its advisory correction", () => {
  let state = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  for (let generation = 1; generation <= MAX_REVIEWS; generation += 1) {
    if (generation > 1) {
      state = settleReviewFreshness(state, { reviewedChanged: true });
      state = startTrustReview(state, { candidate: candidate("e".repeat(39) + generation, String(generation).repeat(40)), reviewedChanged: true }).state;
    }
    state = record(state, generation === MAX_REVIEWS ? [ADVICE] : []).state;
  }
  const gates = (settled) => settled.gates.map(({ id, status }) => `${id}:${status}`);

  // The fix fits the correction: no gate, and the reason offers it before the limit.
  const fits = settleReviewFreshness(state, { reviewedChanged: true, correctionChanges: FIX });
  assert.deepStrictEqual(gates(fits), []);
  assert.match(trustReason(fits), /takes ospec review correct .*otherwise 3 of 3 trust reviews used/);
  // Waiting for its validation: still no gate.
  const waiting = settleReviewFreshness(correctAdvisory(fits).state, { reviewedChanged: true, correctionChanges: FIX });
  assert.deepStrictEqual(gates(waiting), []);
  // A passed correction keeps the change inside its three reviews.
  const passed = validate(waiting, verdict(correctAdvisory(fits).validate, "resolved")).state;
  assert.strictEqual(passed.reviews.length, MAX_REVIEWS);
  assert.strictEqual(obligation(settleReviewFreshness(passed, { reviewedChanged: false })).status, "satisfied");

  // A fix that does not fit, one the check cannot measure or a failed correction asks the person.
  const oversized = [...FIX, { path: "src/auth/session.js", added: 1, deleted: 0 }];
  assert.deepStrictEqual(gates(settleReviewFreshness(state, { reviewedChanged: true, correctionChanges: oversized })), ["review-limit:open"]);
  assert.deepStrictEqual(gates(settleReviewFreshness(state, { reviewedChanged: true })), ["review-limit:open"]);
  const failed = validate(waiting, verdict(correctAdvisory(fits).validate, "unresolved")).state;
  assert.deepStrictEqual(gates(settleReviewFreshness(failed, { reviewedChanged: true, correctionChanges: FIX })), ["review-limit:open"]);
});

test("an advisory correction in the state must belong to an approved review and back its evidence", () => {
  const corrected = correctAdvisory(approvedThenChanged());
  const passed = validate(corrected.state, verdict(corrected.validate, "resolved")).state;
  valid(passed);
  const invalid = (mutate) => {
    const forged = structuredClone(passed);
    mutate(forged);
    assert.strictEqual(validateState(forged).ok, false);
  };
  invalid((state) => { state.advisory_corrections = "none"; });
  invalid((state) => { state.advisory_corrections[0].lineage_id = `sha256:${"0".repeat(64)}`; });
  invalid((state) => { state.advisory_corrections.push(structuredClone(state.advisory_corrections[0])); });
  invalid((state) => { state.advisory_corrections[0].status = "approved"; });
  invalid((state) => { state.advisory_corrections[0].finding_ids = ["F-0000000000000000"]; });
  invalid((state) => { state.advisory_corrections[0].paths = ["src/auth/session.js"]; });
  invalid((state) => { state.advisory_corrections[0].changed_lines = 7; });
  invalid((state) => { delete state.advisory_corrections[0].validation; });
  invalid((state) => { state.advisory_corrections[0].validation.regression.detected = true; });
  invalid((state) => { state.advisory_corrections[0].validation.outcomes[0].status = "unresolved"; });
  // The approval of a corrected tree needs the passed correction on that tree.
  invalid((state) => { state.advisory_corrections[0].candidate_tree = "e".repeat(40); });
  invalid((state) => { state.advisory_corrections = []; });
  invalid((state) => { state.evidence[1].detail.correction = "blocking"; });
  // A validating correction carries no verdict yet.
  valid(corrected.state);
  const early = structuredClone(corrected.state);
  early.advisory_corrections[0].validation = { outcomes: [], regression: { detected: false, evidence: ["x"] }, follow_ups: [] };
  assert.strictEqual(validateState(early).ok, false);
});
