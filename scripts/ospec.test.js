"use strict";

// E1.2 ospec-cli-core: end-to-end contract of `ospec status | next | record`
// (openspec/specs/idd/spec.md, REQ-idd-011), run as a child process against a
// temporary project root.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CLI = path.join(__dirname, "ospec.js");

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function ospec(root, ...args) {
  const result = spawnSync(process.execPath, [CLI, ...args, "--root", root], { encoding: "utf8" });
  let json = null;
  if (args.includes("--json")) json = JSON.parse(result.stdout);
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, json };
}

const OPEN_BUG = [
  "record",
  "intent",
  "--change",
  "fix-pagination",
  "--kind",
  "bug",
  "--summary",
  "Fix the last page.",
  "--acceptance",
  "Two full pages.",
  "--json",
];

test("record intent opens the change, reports the next step and is idempotent", (t) => {
  const root = tempRoot(t);
  const first = ospec(root, ...OPEN_BUG);
  assert.strictEqual(first.code, 0, first.stderr);
  assert.strictEqual(first.json.ok, true);
  assert.strictEqual(first.json.record, "intent");
  assert.strictEqual(first.json.change, "fix-pagination");
  assert.strictEqual(first.json.changed, true);
  assert.deepStrictEqual(first.json.next.next_step, {
    action: "satisfy-obligation",
    obligation: "checks-pass",
    evidence: "check-run",
    how: "ospec check --change fix-pagination",
  });

  const file = path.join(root, "idd", "fix-pagination", "state.yaml");
  const before = fs.readFileSync(file, "utf8");
  const again = ospec(root, ...OPEN_BUG);
  assert.strictEqual(again.code, 0);
  assert.strictEqual(again.json.changed, false);
  assert.strictEqual(fs.readFileSync(file, "utf8"), before);
});

test("signals, gates and refused withdrawals flow through record", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  const signal = ospec(root, "record", "signal", "--change", "fix-pagination", "--signal", "bug-fix", "--reason", "intent kind bug", "--json");
  assert.strictEqual(signal.code, 0, signal.stderr);
  assert.strictEqual(signal.json.next.next_step.obligation, "repro-test");

  const refused = ospec(root, "record", "withdraw", "--change", "fix-pagination", "--obligation", "repro-test", "--reason", "no", "--json");
  assert.strictEqual(refused.code, 1);
  assert.deepStrictEqual(refused.json.ok, false);
  assert.strictEqual(refused.json.error.code, "withdraw-refused");

  const gate = ospec(root, "record", "gate", "--change", "fix-pagination", "--gate", "irreversible-operation", "--open", "--reason", "purges cache", "--json");
  assert.strictEqual(gate.code, 0, gate.stderr);
  assert.strictEqual(gate.json.next.pending_decision.gate, "irreversible-operation");

  const resolved = ospec(
    root,
    "record",
    "gate",
    "--change",
    "fix-pagination",
    "--gate",
    "irreversible-operation",
    "--resolve",
    "--answer",
    "approve",
    "--source",
    "AskUserQuestion",
    "--json",
  );
  assert.strictEqual(resolved.code, 0, resolved.stderr);
  assert.strictEqual(resolved.json.next.pending_decision, null);
});

test("an ambiguous intent is recorded with its gate and next asks to resolve it", (t) => {
  const root = tempRoot(t);
  const opened = ospec(root, "record", "intent", "--change", "improve-login", "--ambiguous", "--request", "Improve the login.", "--json");
  assert.strictEqual(opened.code, 0, opened.stderr);
  const next = ospec(root, "next", "--json");
  assert.strictEqual(next.code, 0);
  assert.strictEqual(next.json.change, "improve-login");
  assert.deepStrictEqual(next.json.next_step, { action: "resolve-gate", gate: "ambiguous-intent" });

  const blocked = ospec(root, "record", "signal", "--change", "improve-login", "--signal", "bug-fix", "--reason", "r", "--json");
  assert.strictEqual(blocked.code, 1);
  assert.strictEqual(blocked.json.error.code, "ambiguous-intent-open");
});

test("next and status are stable across runs and readable without --json", (t) => {
  const root = tempRoot(t);
  assert.deepStrictEqual(ospec(root, "next", "--json").json.next_step, { action: "open-change" });
  ospec(root, ...OPEN_BUG);

  const runs = [1, 2].map(() => ospec(root, "next", "--json").stdout);
  assert.strictEqual(runs[0], runs[1]);

  const status = ospec(root, "status", "--json");
  assert.strictEqual(status.code, 0);
  assert.deepStrictEqual(status.json.changes.map((c) => [c.change, c.obligations.pending]), [["fix-pagination", ["checks-pass"]]]);

  const text = ospec(root, "next");
  assert.strictEqual(text.code, 0);
  assert.match(text.stdout, /fix-pagination/);
  assert.match(text.stdout, /checks-pass/);
  assert.match(ospec(root, "status").stdout, /fix-pagination/);
});

test("evidence cannot be recorded from the CLI and usage errors exit 2", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  const evidence = ospec(root, "record", "evidence", "--change", "fix-pagination", "--obligation", "checks-pass", "--json");
  assert.strictEqual(evidence.code, 2);
  assert.strictEqual(evidence.json.error.code, "usage");
  assert.match(evidence.json.error.message, /record type/);

  assert.strictEqual(ospec(root, "frobnicate", "--json").code, 2);
  assert.strictEqual(ospec(root, "record", "signal", "--signal", "bug-fix", "--json").code, 2);
  const help = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.strictEqual(help.status, 0);
  assert.match(help.stdout, /ospec next/);
});

// E1.3 impact-signals: `ospec signals` derives and records signals and gates
// from the declaration and the diff (REQ-idd-012).

const { execFileSync } = require("node:child_process");

function gitInit(root) {
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  git("config", "commit.gpgsign", "false");
  return git;
}

function writeFile(root, rel, content) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

test("signals derives declaration signals with their reasons and is idempotent", (t) => {
  const root = tempRoot(t);
  writeFile(root, "idd/config.yaml", "strict_tdd: true\n");
  ospec(root, ...OPEN_BUG);
  const args = ["signals", "--change", "fix-pagination", "--path", "src/api/pages.js", "--work-units", "2", "--json"];
  const first = ospec(root, ...args);
  assert.strictEqual(first.code, 0, first.stderr);
  assert.deepStrictEqual(first.json.added, {
    signals: ["strict-tdd", "bug-fix", "multi-unit-or-decision", "public-contract"],
    gates: [],
  });
  assert.strictEqual(
    first.json.signals.find((s) => s.id === "public-contract").reason,
    "public contract: touches src/api/pages.js (matches **/api/**)",
  );
  assert.strictEqual(first.json.floor, "planned");
  assert.strictEqual(first.json.next.next_step.obligation, "repro-test");
  assert.ok(fs.existsSync(path.join(root, "idd", "fix-pagination", "change.md")), "living-doc creates change.md");

  const file = path.join(root, "idd", "fix-pagination", "state.yaml");
  const before = fs.readFileSync(file, "utf8");
  const again = ospec(root, ...args);
  assert.strictEqual(again.code, 0);
  assert.strictEqual(again.json.changed, false);
  assert.strictEqual(fs.readFileSync(file, "utf8"), before);

  const text = ospec(root, ...args.filter((arg) => arg !== "--json"));
  assert.strictEqual(text.code, 0);
  assert.match(text.stdout, /public-contract \(declaration\): public contract: touches src\/api\/pages\.js/);
});

test("signals --diff adds diff signals and opens the irreversible gate", (t) => {
  const root = tempRoot(t);
  const git = gitInit(root);
  writeFile(root, "src/customers/profile.js", "module.exports = {};\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "base");

  ospec(root, "record", "intent", "--change", "drop-fax", "--kind", "refactor", "--summary", "Drop fax.", "--acceptance", "No fax reads.");
  writeFile(root, "db/migrations/003_drop_fax.sql", "ALTER TABLE customers DROP COLUMN fax_number;\n");

  const result = ospec(root, "signals", "--change", "drop-fax", "--diff", "--json");
  assert.strictEqual(result.code, 0, result.stderr);
  assert.deepStrictEqual(result.json.added, { signals: ["persistent-data"], gates: ["irreversible-operation"] });
  assert.strictEqual(result.json.signals.find((s) => s.id === "persistent-data").source, "diff");
  assert.strictEqual(result.json.next.pending_decision.gate, "irreversible-operation");
  assert.match(result.json.next.pending_decision.reason, /DROP COLUMN in db\/migrations\/003_drop_fax\.sql/);
});

test("signals refuses an ambiguous intent, an unknown change and bad input", (t) => {
  const root = tempRoot(t);
  ospec(root, "record", "intent", "--change", "improve-login", "--ambiguous", "--request", "Improve the login.");
  const ambiguous = ospec(root, "signals", "--change", "improve-login", "--path", "src/auth/a.js", "--json");
  assert.strictEqual(ambiguous.code, 1);
  assert.strictEqual(ambiguous.json.error.code, "ambiguous-intent-open");

  assert.strictEqual(ospec(root, "signals", "--change", "nope", "--json").json.error.code, "unknown-change");
  assert.strictEqual(ospec(root, "signals", "--json").code, 2);
  ospec(root, ...OPEN_BUG);
  assert.strictEqual(ospec(root, "signals", "--change", "fix-pagination", "--work-units", "two", "--json").code, 2);

  const noGit = ospec(root, "signals", "--change", "fix-pagination", "--diff", "--json");
  assert.strictEqual(noGit.code, 1);
  assert.strictEqual(noGit.json.error.code, "not-a-git-repo");

  writeFile(root, "idd/config.yaml", "impact:\n  stack: cobol\n");
  const badConfig = ospec(root, "signals", "--change", "fix-pagination", "--json");
  assert.strictEqual(badConfig.code, 1);
  assert.strictEqual(badConfig.json.error.code, "impact-config-invalid");

  writeFile(root, "idd/config.yaml", "schema: spec-driven\n");
  const unknownKey = ospec(root, "signals", "--change", "fix-pagination", "--json");
  assert.strictEqual(unknownKey.code, 1);
  assert.strictEqual(unknownKey.json.error.code, "config-invalid");
});

// E1.4 (a) ospec check and ospec run: the CLI runs the declared checks and
// the test commands itself and records what it observed (REQ-idd-014).

const VERIFY = [
  "const fs = require('fs');",
  "const pages = Number(fs.readFileSync('src/pages.txt', 'utf8'));",
  "if (pages !== 2) { console.error('expected 2 pages, got ' + pages); process.exit(1); }",
  "console.log('ok');",
].join("\n");

function project(t, { checks = "checks:\n  test: node verify.js\n" } = {}) {
  const root = tempRoot(t);
  const git = gitInit(root);
  writeFile(root, "verify.js", `${VERIFY}\n`);
  writeFile(root, "src/pages.txt", "1");
  if (checks !== null) writeFile(root, "idd/config.yaml", checks);
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "base");
  return { root, git };
}

function stateOf(root, change) {
  return JSON.parse(fs.readFileSync(path.join(root, "idd", change, "state.yaml"), "utf8"));
}

const OPEN_DOCS = ["record", "intent", "--change", "fix-readme", "--kind", "docs", "--summary", "Fix a typo.", "--acceptance", "No typo."];

test("record intent stores the change base commit", (t) => {
  const { root, git } = project(t);
  ospec(root, ...OPEN_BUG);
  assert.strictEqual(stateOf(root, "fix-pagination").base, git("rev-parse", "HEAD").trim());
});

test("check runs the declared checks and satisfies checks-pass only on the tree they passed on", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);

  const failing = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(failing.code, 0, failing.stderr);
  assert.strictEqual(failing.json.verdict, "missing");
  assert.deepStrictEqual(failing.json.missing, [
    { obligation: "checks-pass", evidence: "check-run", reason: "check test failed with exit code 1" },
  ]);
  assert.deepStrictEqual(failing.json.checks.map(({ name, exit_code }) => ({ name, exit_code })), [{ name: "test", exit_code: 1 }]);
  assert.match(failing.json.checks[0].output_tail.join("\n"), /expected 2 pages, got 1/);
  assert.strictEqual(stateOf(root, "fix-readme").obligations[0].status, "pending", "a failing run satisfies nothing");

  writeFile(root, "src/pages.txt", "2");
  const passing = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(passing.json.verdict, "ready");
  assert.deepStrictEqual(passing.json.missing, []);
  assert.strictEqual(passing.json.next.next_step.action, "close");
  const state = stateOf(root, "fix-readme");
  assert.deepStrictEqual(state.runs.map((run) => [run.id, run.purpose, run.name, run.exit_code]), [
    ["run-1", "checks", "test", 1],
    ["run-2", "checks", "test", 0],
  ]);
  assert.deepStrictEqual(state.obligations[0], { id: "checks-pass", signal: "always", status: "satisfied", evidence: ["ev-1"] });
  assert.deepStrictEqual(state.evidence[0].detail, { tree: state.runs[1].tree, runs: ["run-2"] });

  writeFile(root, "notes.txt", "later edit\n");
  const stale = ospec(root, "next", "--change", "fix-readme", "--json");
  assert.strictEqual(stale.json.next_step.action, "close", "next reads the stored state only");
  const rechecked = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(rechecked.json.verdict, "ready", "a new tree needs a new passing run, which check records");
  assert.deepStrictEqual(stateOf(root, "fix-readme").obligations[0].evidence, ["ev-2"]);

  const text = ospec(root, "check", "--change", "fix-readme");
  assert.strictEqual(text.code, 0);
  assert.match(text.stdout, /^ready: fix-readme can close/m);
});

test("check without declared checks reports what is missing", (t) => {
  const { root } = project(t, { checks: null });
  ospec(root, ...OPEN_DOCS);
  const result = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(result.json.verdict, "missing");
  assert.match(result.json.missing[0].reason, /no checks declared in idd\/config.yaml/);
  assert.deepStrictEqual(stateOf(root, "fix-readme").runs, []);
});

test("check recomputes the signals from the diff: touching a migration adds its obligation", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name);\n");

  const result = ospec(root, "check", "--change", "add-index", "--json");
  assert.strictEqual(result.code, 0, result.stderr);
  assert.deepStrictEqual(result.json.added, { signals: ["persistent-data"], gates: [] });
  assert.strictEqual(result.json.verdict, "missing");
  assert.deepStrictEqual(result.json.missing.map((entry) => entry.obligation), ["migration-compat-and-test"]);
  const signal = stateOf(root, "add-index").signals.find((entry) => entry.id === "persistent-data");
  assert.strictEqual(signal.source, "diff");
});

test("run records a red then green pair of the same command as the reproduction evidence", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination");
  const run = () =>
    ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node verify.js", "--json");

  const red = run();
  assert.strictEqual(red.code, 0, red.stderr);
  assert.strictEqual(red.json.run.exit_code, 1);
  assert.strictEqual(red.json.evidence, null);
  assert.match(red.json.missing.find((entry) => entry.obligation === "repro-test").reason, /run the same command again after the fix/);

  const stillRed = run();
  assert.strictEqual(stillRed.json.evidence, null, "the same tree proves nothing");

  writeFile(root, "src/pages.txt", "2");
  const green = run();
  assert.strictEqual(green.json.run.exit_code, 0);
  assert.strictEqual(green.json.evidence, "ev-1");
  const state = stateOf(root, "fix-pagination");
  assert.strictEqual(state.obligations.find((entry) => entry.id === "repro-test").status, "satisfied");
  assert.deepStrictEqual(state.evidence[0].detail, { red: "run-2", green: "run-3" });
  assert.strictEqual(green.json.next.next_step.obligation, "checks-pass");
});

test("run is refused for an obligation it cannot prove and needs a command", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  const notActive = ospec(root, "run", "--change", "fix-readme", "--obligation", "repro-test", "--command", "node verify.js", "--json");
  assert.strictEqual(notActive.code, 1);
  assert.strictEqual(notActive.json.error.code, "unknown-obligation");
  const notRunnable = ospec(root, "run", "--change", "fix-readme", "--obligation", "checks-pass", "--command", "node verify.js", "--json");
  assert.strictEqual(notRunnable.code, 2, "checks are run by ospec check");
  assert.strictEqual(ospec(root, "run", "--change", "fix-readme", "--obligation", "repro-test", "--json").code, 2);
});

test("check stops at an ambiguous intent without running anything, and needs git", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "improve-login", "--ambiguous", "--request", "Improve the login.");
  const ambiguous = ospec(root, "check", "--change", "improve-login", "--json");
  assert.strictEqual(ambiguous.code, 0, ambiguous.stderr);
  assert.strictEqual(ambiguous.json.verdict, "needs-decision");
  assert.strictEqual(ambiguous.json.decision.gate, "ambiguous-intent");
  assert.ok(!("runs" in stateOf(root, "improve-login")));

  const plain = tempRoot(t);
  ospec(plain, ...OPEN_DOCS);
  const noGit = ospec(plain, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(noGit.code, 1);
  assert.strictEqual(noGit.json.error.code, "not-a-git-repo");
  assert.strictEqual(ospec(plain, "check", "--json").code, 2, "check needs --change");
});
