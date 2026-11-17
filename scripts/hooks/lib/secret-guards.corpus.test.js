"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { scanContentForSecrets } = require("./secret-scan.js");
const redact = require("./secret-redact.js");
const shell = require("./shell-file-access.js");

// Shared with internal/hooks/secretguards_corpus_test.go: both sides expand the
// templates of the redaction corpus and must give the same answers.
const CORPUS = path.join(__dirname, "..", "..", "..", "internal", "testdata", "secret-guards", "cases.json");

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

const raw = fs.readFileSync(CORPUS, "utf8");
const corpus = JSON.parse(raw);

for (const entry of corpus.content) {
  test(`secret guards: ${entry.name}`, () => {
    const input = expand(entry.input);
    const scanner = entry.scanner || null;
    const redaction = entry.redaction || [];
    assert.equal(scanContentForSecrets(input).patternId, scanner, "scanner");
    assert.deepEqual(redact.redactSecrets(input).kinds, redaction, "redaction");
    // The pre-commit blocks what either guard sees, and what `commit` names
    // when neither does.
    assert.equal(redact.detectSecret(input), scanner || redaction[0] || entry.commit || null, "commit");
  });
}

for (const entry of corpus.shell) {
  test(`shell guard: ${entry.name}`, () => {
    assert.equal(shell.namesDeniedFile(entry.command), entry.deny, "deny");
    if (entry.reads) {
      assert.deepEqual(shell.shellReadFiles(entry.command), entry.reads, "reads");
    }
  });
}

test("secret guards: the corpus file holds nothing the pre-commit would block", () => {
  raw.split("\n").forEach((line, index) => {
    assert.equal(redact.detectSecret(line), null, `line ${index + 1}`);
  });
});
