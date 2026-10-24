"use strict";

// OSP-029 step 2: the receipt the SubagentStop hook writes for a trust review
// result and the CLI reads (REQ-hooks-027, REQ-idd-016).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildReceipt, findReviewResult, readReceipt, receiptPath, resultDigest } = require("./review-receipt.js");

const DIGEST = `sha256:${"a".repeat(64)}`;
const RESULT = { request_digest: DIGEST, reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:1"] }], findings: [] };

test("a reviewer's final message yields its result, whole or in its last fenced block", () => {
  assert.deepStrictEqual(findReviewResult(JSON.stringify(RESULT), "review-trust"), RESULT);
  assert.deepStrictEqual(findReviewResult(RESULT, "review-trust"), RESULT);
  const fenced = `No findings.\n\n\`\`\`json\n${JSON.stringify(RESULT, null, 2)}\n\`\`\`\n`;
  assert.deepStrictEqual(findReviewResult(fenced, "review-trust"), RESULT);
  const verdict = { request_digest: DIGEST, reviewed: [], outcomes: [], regression: { detected: false, evidence: ["ok"] } };
  assert.deepStrictEqual(findReviewResult(`\`\`\`\n${JSON.stringify(verdict)}\n\`\`\``, "review-correction"), verdict);
});

test("only a reviewer's result with a request_digest and its list counts", () => {
  assert.strictEqual(findReviewResult(JSON.stringify(RESULT), "sdd-apply"), null, "not a reviewer");
  assert.strictEqual(findReviewResult(JSON.stringify(RESULT), "review-correction"), null, "a trust result has no outcomes");
  assert.strictEqual(findReviewResult(JSON.stringify({ ...RESULT, request_digest: "sha256:short" }), "review-trust"), null);
  // The request handed to the reviewer carries the digest too, but no findings.
  const request = { request_digest: DIGEST, reviewer: "review-trust", paths: ["src/auth/tokens.js"] };
  assert.strictEqual(findReviewResult(JSON.stringify(request), "review-trust"), null);
  assert.strictEqual(findReviewResult("No findings.", "review-trust"), null);
  assert.strictEqual(findReviewResult(undefined, "review-trust"), null);
});

test("the result digest ignores key order and formatting, not content", () => {
  const reordered = { findings: [], reviewed: RESULT.reviewed, request_digest: DIGEST };
  assert.strictEqual(resultDigest(JSON.parse(JSON.stringify(reordered, null, 2))), resultDigest(RESULT));
  assert.notStrictEqual(resultDigest({ ...RESULT, findings: [{ severity: "BLOCKER" }] }), resultDigest(RESULT));
});

test("a receipt is read back by its request digest and a malformed one is absent", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-receipt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.strictEqual(receiptPath(root, "../escape"), null);
  assert.strictEqual(readReceipt(root, DIGEST), null);

  const receipt = buildReceipt({ agent: "review-trust", result: RESULT, recordedAt: "2026-10-21T08:00:00.000Z" });
  const file = receiptPath(root, DIGEST);
  assert.strictEqual(file, path.join(root, ".ospec", "review-receipts", `${"a".repeat(64)}.json`));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(receipt));
  assert.deepStrictEqual(readReceipt(root, DIGEST), receipt);

  fs.writeFileSync(file, JSON.stringify({ ...receipt, agent: "sdd-apply" }));
  assert.strictEqual(readReceipt(root, DIGEST), null);
  fs.writeFileSync(file, "{");
  assert.strictEqual(readReceipt(root, DIGEST), null);
});

test("REQ-hooks-027 names the receipt, its source transcript and its limit", () => {
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "hooks", "spec.md"), "utf8");
  const start = spec.indexOf("{#REQ-hooks-027}");
  assert.ok(start !== -1, "REQ-hooks-027 is missing");
  const end = spec.indexOf("### Requirement:", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  for (const name of [".ospec/review-receipts/<hex>.json", "last_assistant_message", "agent_transcript_path", "transcript_path", "ospec-review-receipt/v1", "result_digest", "review-trust", "review-correction"]) {
    assert.ok(section.includes(`\`${name}\``), `REQ-hooks-027 must name ${name}`);
  }
  assert.match(section, /not that it is proof/);
});
