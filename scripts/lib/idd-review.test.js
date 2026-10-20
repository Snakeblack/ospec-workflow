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
  buildCandidate,
  correctTrustReview,
  currentReview,
  recordTrustFindings,
  settleReviewFreshness,
  startTrustReview,
  trustReason,
  validateTrustCorrection,
} = require("./idd-review.js");

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

  const corrected = correctTrustReview(frozen.state, {
    changes: [{ path: "src/auth/tokens.js", added: 2, deleted: 1 }],
    candidateTree: "d".repeat(40),
    diffHash: `sha256:${"9".repeat(64)}`,
  });
  const lineage = currentReview(corrected.state);
  assert.strictEqual(lineage.status, "validating");
  assert.strictEqual(lineage.correction_budget.used_lines, 3);
  assert.deepStrictEqual(corrected.finding_ids, lineage.findings.map((finding) => finding.id));

  const outcomes = corrected.finding_ids.map((id) => ({ id, status: "resolved" }));
  const approved = validateTrustCorrection(corrected.state, {
    result: { outcomes, regression: { detected: false, evidence: ["tests cover expiry"] } },
    recordedAt: AT,
  });
  assert.strictEqual(currentReview(approved.state).status, "approved");
  assert.strictEqual(obligation(approved.state).status, "satisfied");
  valid(approved.state);
});

test("a failed validation ends the lineage: IDD allows one correction per review", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const frozen = record(started, [BLOCKER]).state;
  const corrected = correctTrustReview(frozen, {
    changes: [{ path: "src/auth/tokens.js", added: 1, deleted: 0 }],
    candidateTree: "d".repeat(40),
    diffHash: `sha256:${"9".repeat(64)}`,
  });
  const failed = validateTrustCorrection(corrected.state, {
    result: { outcomes: corrected.finding_ids.map((id) => ({ id, status: "unresolved" })), regression: { detected: false, evidence: ["still accepted"] } },
    recordedAt: AT,
  });
  assert.strictEqual(currentReview(failed.state).status, "escalated");
  assert.strictEqual(obligation(failed.state).status, "pending");
  assert.match(trustReason(failed.state), /change the code and run ospec review start for a successor review \(2 of 3\)/);
  valid(failed.state);
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

test("REQ-idd-016 names the review commands, the reviewer and the limits", () => {
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "idd", "spec.md"), "utf8");
  const start = spec.indexOf("{#REQ-idd-016}");
  assert.ok(start !== -1, "REQ-idd-016 is missing");
  const end = spec.indexOf("### Requirement:", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  for (const name of ["ospec review start", "ospec review record", "ospec review correct", "ospec review validate", "review-trust", "review-correction", "reviews", "frozen-review", "trust", "request_digest", "reviewed", "location", "attestation: relayed", "review-refused"]) {
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
});
