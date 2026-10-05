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
  let { state } = recordIntent(null, { change: "rotate-tokens", kind: "feature", summary: "Rotate tokens.", acceptance: "Old tokens expire." });
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

const BLOCKER = { severity: "BLOCKER", summary: "Old tokens never expire.", acceptance_criteria: "Expired tokens are rejected." };
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
  assert.deepStrictEqual(request, { lineage_id: lineage.lineage_id, generation: 1, lens: "trust", reviewer: "review-trust", paths: ["src/auth/tokens.js"] });
  valid(state);

  const again = startTrustReview(state, { candidate: candidate(), reviewedChanged: false });
  assert.strictEqual(again.changed, false, "a review in progress is resumed, not restarted");
  assert.strictEqual(again.state.reviews.length, 1);
});

test("findings without a blocker approve the review and record frozen-review evidence", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const { state, evidence } = recordTrustFindings(started, { result: { findings: [ADVICE] }, recordedAt: AT });
  assert.strictEqual(currentReview(state).status, "approved");
  assert.strictEqual(evidence, "ev-1");
  assert.strictEqual(obligation(state).status, "satisfied");
  assert.deepStrictEqual(Object.keys(state.evidence[0].detail).sort(), ["candidate_id", "candidate_tree", "findings_digest", "lineage_id"]);
  valid(state);
  assertCode(() => recordTrustFindings(state, { result: { findings: [] }, recordedAt: AT }), "review-refused");
});

test("a blocker allows one bounded correction validated against the frozen findings", () => {
  const started = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  const frozen = recordTrustFindings(started, { result: { findings: [BLOCKER] }, recordedAt: AT });
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
  const frozen = recordTrustFindings(started, { result: { findings: [BLOCKER] }, recordedAt: AT }).state;
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
  state = recordTrustFindings(state, { result: { findings: [] }, recordedAt: AT }).state;
  assertCode(() => startTrustReview(state, { candidate: candidate(), reviewedChanged: false }), "review-current");

  state = settleReviewFreshness(state, { reviewedChanged: true });
  assert.strictEqual(obligation(state).status, "pending");
  assertCode(() => startTrustReview(state, { candidate: candidate(), reviewedChanged: false }), "candidate-unchanged");

  for (let generation = 2; generation <= MAX_REVIEWS; generation += 1) {
    const next = startTrustReview(state, { candidate: candidate("e".repeat(39) + generation, String(generation).repeat(40)), reviewedChanged: true });
    assert.strictEqual(next.request.generation, generation);
    assert.strictEqual(currentReview(next.state).predecessor_lineage_id, currentReview(state).lineage_id);
    state = recordTrustFindings(next.state, { result: { findings: [] }, recordedAt: AT }).state;
    state = settleReviewFreshness(state, { reviewedChanged: true });
  }
  assertCode(() => startTrustReview(state, { candidate: candidate("f".repeat(40), "f".repeat(40)), reviewedChanged: true }), "review-limit");
  assert.match(trustReason(state), /3 of 3 trust reviews used/);
  valid(state);
});

test("a fresh approved review stays satisfied", () => {
  let state = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  state = recordTrustFindings(state, { result: { findings: [] }, recordedAt: AT }).state;
  assert.strictEqual(obligation(settleReviewFreshness(state, { reviewedChanged: false })).status, "satisfied");
});

test("frozen-review evidence must name an approved review of its candidate", () => {
  let state = startTrustReview(openAuth(), { candidate: candidate(), reviewedChanged: true }).state;
  state = recordTrustFindings(state, { result: { findings: [] }, recordedAt: AT }).state;
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
  for (const name of ["ospec review start", "ospec review record", "ospec review correct", "ospec review validate", "review-trust", "review-correction", "reviews", "frozen-review", "trust"]) {
    assert.ok(section.includes(`\`${name}\``), `REQ-idd-016 must name ${name}`);
  }
  assert.ok(section.includes(String(MAX_REVIEWS)), "REQ-idd-016 must state the review limit");
});
