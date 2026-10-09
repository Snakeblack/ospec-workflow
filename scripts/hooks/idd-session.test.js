"use strict";

// E1.12 session-hook-idd: Stop and PreCompact see the open IDD changes and
// write their next step, reusing the IDD store and next. The golden cases of
// internal/testdata/idd-session/ are shared with the Go hooks
// (internal/hooks/iddsession_golden_test.go), so both write the same bytes.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runPreCompact } = require("./pre-compact.js");
const { runStop } = require("./stop.js");

const CASES_DIR = path.join(__dirname, "..", "..", "internal", "testdata", "idd-session");

function copyWorkspace(t, caseName) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `idd-session-${caseName}-`));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  fs.cpSync(path.join(CASES_DIR, caseName, "workspace"), workspace, { recursive: true });
  return workspace;
}

function expectedFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? expectedFiles(absolute, base) : [path.relative(base, absolute).split(path.sep).join("/")];
  });
}

async function runCase(t, caseName) {
  const workspace = copyWorkspace(t, caseName);
  const input = JSON.parse(fs.readFileSync(path.join(CASES_DIR, caseName, "input.json"), "utf8"));
  const compacted = await runPreCompact({ input: { cwd: workspace } });
  const stopped = await runStop({ input: { cwd: workspace, ...input } });
  const expectedDir = path.join(CASES_DIR, caseName, "expected");
  for (const file of expectedFiles(expectedDir).sort()) {
    assert.equal(
      fs.readFileSync(path.join(workspace, ".ospec", ...file.split("/")), "utf8"),
      fs.readFileSync(path.join(expectedDir, ...file.split("/")), "utf8"),
      `${caseName}: .ospec/${file}`,
    );
  }
  return { workspace, compacted, stopped };
}

test("one open IDD change is the active change, with its next step from ospec next", async (t) => {
  const { compacted, stopped } = await runCase(t, "one-idd");
  assert.deepEqual(stopped, { status: "written", path: ".ospec/session/latest.md", activeChange: "fix-a" });
  assert.deepEqual(compacted, {
    status: "written",
    idd: [{ change: "fix-a", status: "written", path: ".ospec/session/fix-a/session-summary.md" }],
  });
});

test("several open changes are listed without choosing one, SDD first and IDD by id", async (t) => {
  const { workspace, compacted, stopped } = await runCase(t, "many");
  assert.deepEqual(stopped, {
    status: "written",
    path: ".ospec/session/latest.md",
    activeChange: null,
    openChanges: ["add-export", "a-config", "b-docs", "c-facts"],
  });
  assert.equal(compacted.change, "add-export", "the SDD summary keeps its behavior");
  assert.deepEqual(compacted.idd.map((entry) => entry.change), ["a-config", "b-docs", "c-facts"]);
  for (const hidden of ["z-closed", "old", "archive"]) {
    assert.ok(!fs.existsSync(path.join(workspace, ".ospec", "session", hidden)), `${hidden} is not an open change`);
  }
});

test("every kind of next step is written as ospec next gives it", async (t) => {
  const { stopped } = await runCase(t, "steps");
  assert.equal(stopped.openChanges.length, 9);
});

test("malformed open states are skipped and the valid change is written as if alone", async (t) => {
  const { workspace, stopped } = await runCase(t, "malformed");
  assert.equal(stopped.activeChange, "fix-a");
  assert.deepEqual(fs.readdirSync(path.join(workspace, ".ospec", "session")).sort(), ["fix-a", "latest.md"]);
});

test("a repeated PreCompact leaves unchanged IDD summaries fresh", async (t) => {
  const workspace = copyWorkspace(t, "one-idd");
  await runPreCompact({ input: { cwd: workspace } });
  const again = await runPreCompact({ input: { cwd: workspace } });
  assert.deepEqual(again, {
    status: "fresh",
    idd: [{ change: "fix-a", status: "fresh", path: ".ospec/session/fix-a/session-summary.md" }],
  });
});

test("an unreadable IDD state is skipped and never stops the hooks", async (t) => {
  const workspace = copyWorkspace(t, "one-idd");
  fs.mkdirSync(path.join(workspace, "idd", "broken"));
  fs.writeFileSync(path.join(workspace, "idd", "broken", "state.yaml"), "{ not json");
  fs.mkdirSync(path.join(workspace, "idd", "no-state"));
  // A state.yaml that is a directory (EISDIR) cannot be read either.
  fs.mkdirSync(path.join(workspace, "idd", "dir-state", "state.yaml"), { recursive: true });
  const stopped = await runStop({ input: { cwd: workspace, timestamp: "t", session_id: "s" } });
  assert.equal(stopped.activeChange, "fix-a");
  const compacted = await runPreCompact({ input: { cwd: workspace } });
  assert.deepEqual(compacted.idd.map((entry) => entry.change), ["fix-a"]);
  for (const skipped of ["broken", "no-state", "dir-state"]) {
    assert.ok(!fs.existsSync(path.join(workspace, ".ospec", "session", skipped)), `${skipped} is skipped`);
  }
});

test("an unreadable idd/config.yaml declares no checks and the SDD trace is still written", async (t) => {
  const workspace = copyWorkspace(t, "many");
  fs.mkdirSync(path.join(workspace, "idd", "config.yaml"));
  fs.mkdirSync(path.join(workspace, "idd", "dir-state", "state.yaml"), { recursive: true });
  const compacted = await runPreCompact({ input: { cwd: workspace } });
  assert.equal(compacted.change, "add-export");
  assert.deepEqual(compacted.idd.map((entry) => entry.change), ["a-config", "b-docs", "c-facts"]);
  const stopped = await runStop({ input: { cwd: workspace, timestamp: "2026-10-09T12:00:00Z", session_id: "session-idd" } });
  assert.deepEqual(stopped.openChanges, ["add-export", "a-config", "b-docs", "c-facts"]);
  assert.equal(
    fs.readFileSync(path.join(workspace, ".ospec", "session", "latest.md"), "utf8"),
    fs.readFileSync(path.join(CASES_DIR, "many", "expected", "session", "latest.md"), "utf8"),
  );
});

test("without open changes the hooks keep their behavior and PreCompact writes nothing", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "idd-session-empty-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  fs.mkdirSync(path.join(workspace, "idd", "archive"), { recursive: true });
  assert.deepEqual(await runPreCompact({ input: { cwd: workspace } }), { status: "skipped", reason: "no-active-change" });
  assert.ok(!fs.existsSync(path.join(workspace, ".ospec")));
  const stopped = await runStop({ input: { cwd: workspace, timestamp: "t", session_id: "s" } });
  assert.equal(stopped.activeChange, null);
  assert.match(fs.readFileSync(path.join(workspace, ".ospec", "session", "latest.md"), "utf8"), /- Active change: `None`/);
});

test("the declared checks are counted as idd/config.yaml declares them, as the Go port does", () => {
  const { countDeclaredChecks } = require("./lib/idd-session.js");
  const { parseIddConfig } = require("../lib/idd-config.js");
  const cases = new Map([
    ["", 0],
    ["checks:\n", 0],
    ["checks:\n  test: npm test\n", 1],
    ['# c\nchecks:\n  test: a # b\n  lint: "b"\nmode: idd\n', 2],
    ["checks:\n  # test: npm test\n", 0],
    ["impact:\n  test: npm test\n", 0],
    ["checks:\r\n  test: npm test\r\n", 1],
  ]);
  for (const [text, count] of cases) {
    assert.equal(countDeclaredChecks(text), count, JSON.stringify(text));
    if (!text.startsWith("impact")) assert.equal(parseIddConfig(text).checks.length, count, `parity with the CLI: ${JSON.stringify(text)}`);
  }
  assert.equal(countDeclaredChecks("checks:\n  test:\nimpact:\n  x: y\n"), 0);
});
