"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { freezeCandidate } = require("../execution-identities/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { deriveVerifiedDiffScope, rejectScopeWidening } = require("./diff-scope.js");

const files = { "src/index.js": "module.exports = 1;\n" };
const diff = "diff --git a/src/index.js b/src/index.js\n--- a/src/index.js\n+++ b/src/index.js\n@@ -1 +1 @@\n-module.exports = 0;\n+module.exports = 1;\n";

test("REQ-adversarial-challenges-004: scope derives only from Candidate-bound diff bytes and rejects widening", () => {
  const tree = computeTreeDigest(files);
  const candidate = freezeCandidate({ repository_id: "k6c-scope", projection: "workspace", base_tree: tree, candidate_tree: tree, diffText: diff, paths: ["src/index.js"] });
  const scope = deriveVerifiedDiffScope(candidate, diff);
  assert.equal(scope.ok, true);
  assert.deepEqual(scope.scope.paths, ["src/index.js"]);
  assert.deepEqual(scope.scope.line_ranges, [{ path: "src/index.js", lines: [1] }]);
  assert.equal(deriveVerifiedDiffScope(candidate, `${diff}\n+foreign`).ok, false);
  assert.equal(rejectScopeWidening(scope.scope, { paths: ["src/index.js", "secrets.txt"] }).ok, false);
});
