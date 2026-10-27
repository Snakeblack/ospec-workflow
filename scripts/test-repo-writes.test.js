"use strict";

// E1.30: the tests that create SDD changes do it in a temporary root, never in
// the repository's openspec/changes. contract-lint walks that directory while
// other test files run in parallel, so a change one of them was deleting
// failed it with ENOENT on Windows (PR #446).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CHANGES = path.join(ROOT, "openspec", "changes");
const WRITERS = ["scripts/configure/validate-phase.test.js", "scripts/route-dispatch-run.test.js", "scripts/lib/k1-scope-guard.test.js"];

// Loaded with --require into a test file: it records every directory the file
// creates under the repository's openspec/changes, and writes the list on exit.
const PRELOAD = `"use strict";
const fs = require("node:fs");
const path = require("node:path");
const changes = path.resolve(process.env.OSPEC_REPO_CHANGES) + path.sep;
const created = [];
const record = (dir) => {
  if (typeof dir === "string" && path.resolve(dir).startsWith(changes)) created.push(path.resolve(dir));
};
const { mkdirSync, mkdtempSync } = fs;
fs.mkdirSync = function (dir, ...rest) {
  record(dir);
  return mkdirSync.call(this, dir, ...rest);
};
fs.mkdtempSync = function (prefix, ...rest) {
  const dir = mkdtempSync.call(this, prefix, ...rest);
  record(dir);
  return dir;
};
process.on("exit", () => fs.writeFileSync(process.env.OSPEC_REPO_WRITES, JSON.stringify(created)));
`;

test("the tests that create SDD changes leave the repository's openspec/changes untouched", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-repo-writes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const preload = path.join(dir, "record-writes.js");
  fs.writeFileSync(preload, PRELOAD);
  for (const file of WRITERS) {
    const log = path.join(dir, `${path.basename(file)}.json`);
    const result = spawnSync(process.execPath, ["--require", preload, path.join(ROOT, file)], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, OSPEC_REPO_CHANGES: CHANGES, OSPEC_REPO_WRITES: log },
    });
    assert.strictEqual(result.status, 0, `${file} failed:\n${result.stdout}\n${result.stderr}`);
    const created = JSON.parse(fs.readFileSync(log, "utf8")).map((dir) => path.relative(ROOT, dir).split(path.sep).join("/"));
    assert.deepStrictEqual(created, [], `${file} created directories inside the repository`);
  }
});
