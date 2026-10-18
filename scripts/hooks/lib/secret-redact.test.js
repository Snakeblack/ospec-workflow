"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { redactSecrets, redactDeep, containsRedactionMarker } = require("./secret-redact.js");

// Shared with internal/hooks/secretredact_test.go: both sides expand the same
// templates and must produce the same bytes (Go/JS parity).
const CORPUS = path.join(__dirname, "..", "..", "..", "internal", "testdata", "secret-redaction", "cases.json");

const CYCLES = {
  fill: "aB3xY7kM9pQ2wE5rT8uI1oP4",
  alpha: "aBxYkMpQwErTuIoP",
  upper: "AB3XY7KM9PQ2WE5R",
};

function expand(text) {
  return text
    .replace(/\{\{(fill|alpha|upper):(\d+)\}\}/g, (_m, kind, n) => CYCLES[kind].repeat(Math.ceil(n / CYCLES[kind].length)).slice(0, Number(n)))
    .replace(/\{\{dash5\}\}/g, "-----")
    .replace(/\{\{sq\}\}/g, "'");
}

const { cases } = JSON.parse(fs.readFileSync(CORPUS, "utf8"));

for (const entry of cases) {
  test(`redactSecrets: ${entry.name}`, () => {
    const input = expand(entry.input);
    const expected = entry.output === undefined ? input : expand(entry.output);
    const options = { sensitiveFile: entry.sensitive_file === true };
    const result = redactSecrets(input, options);
    assert.equal(result.text, expected);
    assert.deepEqual(result.kinds, entry.kinds || []);
    // Idempotent: a redacted text never gains new markers.
    assert.equal(redactSecrets(result.text, options).text, result.text);
  });
}

test("redactSecrets: non-strings come back untouched", () => {
  for (const value of [undefined, null, 42, ""]) {
    assert.deepEqual(redactSecrets(value), { text: value, kinds: [] });
  }
});

test("redactDeep: rewrites every string and keeps the shape of the tool response", () => {
  const token = `ghp_${"aB3".repeat(12)}`;
  const response = {
    type: "text",
    file: { filePath: "/repo/.env", content: `A=1\nGH_TOKEN=${token}\n`, numLines: 3 },
    structuredPatch: [{ lines: [` GH_TOKEN=${token}`] }],
    interrupted: false,
  };
  const result = redactDeep(response);
  assert.deepEqual(result.kinds, ["github-token"]);
  assert.deepEqual(result.value, {
    type: "text",
    file: { filePath: "/repo/.env", content: "A=1\nGH_TOKEN=[REDACTED:github-token]\n", numLines: 3 },
    structuredPatch: [{ lines: [" GH_TOKEN=[REDACTED:github-token]"] }],
    interrupted: false,
  });
  assert.equal(response.file.content.includes(token), true, "the input is not mutated");
});

test("redactDeep: a response without secrets is returned as is", () => {
  const response = { stdout: "ok", stderr: "", interrupted: false };
  const result = redactDeep(response);
  assert.deepEqual(result.kinds, []);
  assert.equal(result.value, response);
});

test("containsRedactionMarker: finds the marker the redaction writes", () => {
  assert.equal(containsRedactionMarker("DB_PASSWORD=[REDACTED:assigned-secret]"), true);
  assert.equal(containsRedactionMarker("DB_PASSWORD=[REDACTED]"), false);
  assert.equal(containsRedactionMarker(""), false);
});
