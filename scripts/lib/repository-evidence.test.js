"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { evidenceProblem, parseEvidenceRef } = require("./repository-evidence.js");

function repo(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-evidence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

test("[REQ-component-map-002] path:line parses a relative path and a 1-based line", () => {
  assert.deepEqual(parseEvidenceRef("src/a.js:12"), { file: "src/a.js", line: 12 });
  for (const ref of ["src/a.js", "src/a.js:0", "src/a.js:-1", ":3", "a.js:3:4", " a.js:1", 7]) {
    assert.equal(parseEvidenceRef(ref), null, String(ref));
  }
});

test("[REQ-component-map-002] the last line resolves and the line after it does not", (t) => {
  const root = repo(t, { "a.txt": "one\ntwo\n", "b.txt": "one\ntwo", "empty.txt": "" });
  assert.equal(evidenceProblem(root, "a.txt:2"), null);
  assert.match(evidenceProblem(root, "a.txt:3"), /past the end/);
  assert.equal(evidenceProblem(root, "b.txt:2"), null);
  assert.match(evidenceProblem(root, "empty.txt:1"), /past the end/);
});

test("[REQ-component-map-002] a reference outside the root, absolute or to a directory does not resolve", (t) => {
  const root = repo(t, { "dir/a.txt": "x\n" });
  assert.match(evidenceProblem(root, "../a.txt:1"), /outside the repository/);
  assert.match(evidenceProblem(root, "dir/../../a.txt:1"), /outside the repository/);
  assert.match(evidenceProblem(root, "/etc/hosts:1"), /relative POSIX path/);
  assert.match(evidenceProblem(root, "dir\\a.txt:1"), /relative POSIX path/);
  assert.match(evidenceProblem(root, "dir:1"), /not a file/);
  assert.match(evidenceProblem(root, "dir/b.txt:1"), /does not exist/);
});
