"use strict";

// E1.111: the shared cases of internal/testdata/auto-permission/, which the Go
// hook runs too (internal/hooks/pretooluse_auto_test.go), so both compute the
// same key, apply the same permission policy in an automatic run and leave the
// same request.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFileSync, spawnSync } = require("node:child_process");

const { REQUESTS_FILE, callKey } = require("../lib/auto-permission.js");

// The entry point hooks/hooks.json installs, which runs the native binary when
// it ships and else the Node hook, and the Node hook itself.
const LAUNCHER = path.join(__dirname, "ospec-hooks-launch.js");
const ENTRIES = { launcher: [LAUNCHER, "pre-tool-use", "--output-redaction"], "node hook": [path.join(__dirname, "pre-tool-use.js")] };
const SHARED = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "internal", "testdata", "auto-permission", "cases.json"), "utf8"));

function caseEnv(entry, session, home) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("DISABLE_") || key.startsWith("OSPEC_") || key.startsWith("GIT_")) delete env[key];
  }
  const gitconfig = path.join(home, "gitconfig");
  fs.writeFileSync(gitconfig, "");
  Object.assign(env, {
    DISABLE_TOKEN_ADVISOR: "true",
    DISABLE_GIT_COLLABORATION_GUARD: "true",
    DISABLE_SPEC_DRIFT_GUARD: "true",
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
    OSPEC_AUTO_SESSION: session,
  });
  if (entry.allow) env.OSPEC_AUTO_ALLOW = entry.allow.map((call) => callKey(call.tool, call.input)).join(",");
  for (const [key, value] of Object.entries(entry.env || {})) {
    if (value === "") delete env[key];
    else env[key] = value;
  }
  return env;
}

// A repository on a branch other than the default one, with an untracked file.
function dirtyRepository(dir, env) {
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "README.md"), "base\n");
  git("add", "README.md");
  git("-c", "user.name=ospec", "-c", "user.email=ospec@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "base");
  git("switch", "-q", "-c", "feat/run");
  fs.writeFileSync(path.join(dir, "notes.txt"), "untracked\n");
}

test("auto permission: the key of an approval", () => {
  SHARED.keys.forEach((entry, index) => {
    assert.equal(callKey(entry.tool, entry.input), entry.sha256, JSON.stringify(entry.input));
    SHARED.keys.forEach((other, at) => {
      if (at > index) assert.equal(entry.sha256 === other.sha256, other.sameAs === index, `keys ${index} and ${at}`);
    });
  });
});

for (const [through, args] of Object.entries(ENTRIES)) for (const entry of SHARED.cases) {
  test(`auto permission (${through}): ${entry.name}`, { skip: entry.requestsFile !== undefined && process.platform === "win32" }, (t) => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "auto-permission-"));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const dir = path.join(base, "work");
    const session = path.join(base, "run");
    fs.mkdirSync(dir);
    fs.mkdirSync(session);
    const env = caseEnv(entry, session, base);
    if (entry.git === "dirty") dirtyRepository(dir, env);
    for (const [file, size] of Object.entries(entry.files || {})) fs.writeFileSync(path.join(dir, file), "a".repeat(size));
    const requests = path.join(session, REQUESTS_FILE);
    const outside = path.join(base, "outside.txt");
    fs.writeFileSync(outside, "keep\n");
    if (entry.requestsFile === "symlink") fs.symlinkSync(outside, requests);
    if (entry.requestsFile === "hardlink") fs.linkSync(outside, requests);
    if (entry.requestsFile === "fifo") execFileSync("mkfifo", [requests]);

    const result = spawnSync(process.execPath, args, { input: entry.stdin, cwd: dir, env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, `${result.stderr}${result.error || ""}`);

    // No decision is no output, or only an advisory for the host's own
    // permissions to go with.
    const { expect } = entry;
    const stdout = result.stdout.trim();
    const output = stdout ? JSON.parse(stdout) : {};
    const decision = output.hookSpecificOutput ? output.hookSpecificOutput.permissionDecision : "";
    assert.equal(decision, expect.decision, stdout);
    if (expect.reason !== undefined) assert.equal(output.hookSpecificOutput.permissionDecisionReason, expect.reason);
    if (expect.reasonPrefix !== undefined) assert.ok(output.hookSpecificOutput.permissionDecisionReason.startsWith(expect.reasonPrefix), stdout);
    if (expect.systemMessagePrefix !== undefined) assert.ok(String(output.systemMessage).startsWith(expect.systemMessagePrefix), stdout);
    else if (expect.decision === "") assert.equal(stdout, "");

    assert.equal(fs.readFileSync(outside, "utf8"), "keep\n", "a file outside the run keeps its content");
    if (entry.requestsFile !== undefined) {
      if (entry.requestsFile !== "hardlink") assert.equal(fs.lstatSync(requests).isFile(), false, "what the session left there stays as it was");
    } else if (expect.request === null) {
      assert.equal(fs.existsSync(requests), false, "no request is left");
    } else {
      const lines = fs.readFileSync(requests, "utf8").trim().split("\n");
      assert.deepEqual(lines.map((line) => JSON.parse(line)), [expect.request]);
    }
  });
}

test("auto permission: without the run's mark an ask stays an ask", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "auto-permission-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const env = caseEnv({}, "", base);
  delete env.OSPEC_AUTO_SESSION;
  const result = spawnSync(process.execPath, [LAUNCHER, "pre-tool-use"], { input: SHARED.cases[0].stdin, cwd: base, env, encoding: "utf8" });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "ask");
});
