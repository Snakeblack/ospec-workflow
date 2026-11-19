"use strict";

// E1.51: the shared cases of internal/testdata/idd-nudge/, which the Go hooks
// run too (internal/hooks/iddnudge_test.go), so both implementations compute
// the same fingerprint, answer the same and write the same record.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const { nudgeFingerprint } = require("./idd-nudge.js");

const CASE_DIR = path.join(__dirname, "..", "..", "..", "internal", "testdata", "idd-nudge");
const CASE = JSON.parse(fs.readFileSync(path.join(CASE_DIR, "case.json"), "utf8"));
const HOOKS = path.join(__dirname, "..");

// A fixed author, committer and date, and no git configuration: the same
// HEAD and fingerprints on every machine.
function gitEnv(dir) {
  const empty = path.join(dir, "empty.gitconfig");
  fs.writeFileSync(empty, "");
  const stamp = "2026-01-01T00:00:00Z";
  return {
    GIT_CONFIG_GLOBAL: empty,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "ospec",
    GIT_AUTHOR_EMAIL: "ospec@example.invalid",
    GIT_AUTHOR_DATE: stamp,
    GIT_COMMITTER_NAME: "ospec",
    GIT_COMMITTER_EMAIL: "ospec@example.invalid",
    GIT_COMMITTER_DATE: stamp,
  };
}

function write(root, files) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
}

function project(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "idd-nudge-parity-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const env = { ...process.env, ...gitEnv(base) };
  delete env.DISABLE_IDD_NUDGE;
  delete env.OSPEC_TARGET;
  const root = path.join(base, "repo");
  fs.cpSync(path.join(CASE_DIR, "workspace"), root, { recursive: true });
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q", "-b", "main");
  git("add", "--", ...CASE.commit);
  git("-c", "commit.gpgsign=false", "commit", "-q", "-m", "init");
  return { root, env };
}

test("the fingerprint of the shared case is the one Go computes", (t) => {
  const { root, env } = project(t);
  write(root, CASE.fingerprint.write);
  const run = (cwd, args) => execFileSync("git", ["-C", cwd, "-c", "core.quotePath=false", ...args], { env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  assert.equal(nudgeFingerprint(root, CASE.fingerprint.ids, run), CASE.fingerprint.expected);
});

test("the hooks answer the shared steps and write the shared record", (t) => {
  const { root, env } = project(t);
  for (const [index, step] of CASE.steps.entries()) {
    if (step.write) {
      write(root, step.write);
      continue;
    }
    const stdout = execFileSync(process.execPath, [path.join(HOOKS, `${step.hook}.js`)], {
      input: JSON.stringify({ ...step.input, cwd: root }),
      env,
      encoding: "utf8",
    });
    assert.deepEqual(JSON.parse(stdout), step.expect, `step ${index}: ${step.hook} ${JSON.stringify(step.input)}`);
    if (step.turns !== undefined) assert.equal(fs.readFileSync(path.join(root, ".ospec", "turns"), "utf8"), `${step.turns}\n`, `step ${index}: turns`);
  }
  assert.equal(fs.readFileSync(path.join(root, ".ospec", "idd-nudge.json"), "utf8"), CASE.record);
});
