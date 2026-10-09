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
  "--no-open-facts",
  "--basis",
  "The request fixes every behavior.",
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

test("record intent needs the open-facts declaration, and open facts are asked first", (t) => {
  const root = tempRoot(t);
  const base = ["record", "intent", "--change", "discount-codes", "--kind", "feature", "--summary", "Discount codes.", "--acceptance", "VERANO10 takes 10%."];
  const undeclared = ospec(root, ...base, "--json");
  assert.strictEqual(undeclared.code, 1);
  assert.strictEqual(undeclared.json.error.code, "facts-undeclared");

  const opened = ospec(root, ...base, "--open-fact", "Is an unknown code an error?", "--open-fact", "Does case matter?", "--json");
  assert.strictEqual(opened.code, 0, opened.stderr);
  assert.deepStrictEqual(opened.json.next.next_step, { action: "resolve-gate", gate: "open-facts" });
  assert.deepStrictEqual(opened.json.next.pending_decision.questions, ["Is an unknown code an error?", "Does case matter?"]);

  const text = ospec(root, "next", "--change", "discount-codes");
  assert.match(text.stdout, /Is an unknown code an error?/);
  assert.match(text.stdout, /Does case matter?/);

  const resolved = ospec(root, "record", "gate", "--change", "discount-codes", "--gate", "open-facts", "--resolve", "--answer", "It throws; case does not matter.", "--source", "user", "--json");
  assert.strictEqual(resolved.code, 0, resolved.stderr);
  assert.strictEqual(resolved.json.next.next_step.obligation, "checks-pass");
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

  ospec(root, "record", "intent", "--change", "drop-fax", "--kind", "refactor", "--summary", "Drop fax.", "--acceptance", "No fax reads.", "--no-open-facts", "--basis", "The request fixes every behavior.");
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

const OPEN_DOCS = ["record", "intent", "--change", "fix-readme", "--kind", "docs", "--summary", "Fix a typo.", "--acceptance", "No typo.", "--no-open-facts", "--basis", "The request fixes every behavior."];

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

test("close refuses old check evidence after the configured check changes", (t) => {
  const { root } = project(t, { checks: 'checks:\n  smoke: node -e "process.exit(0)"\n' });
  ospec(root, ...OPEN_DOCS);

  const checked = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.strictEqual(checked.json.verdict, "ready");

  writeFile(root, "idd/config.yaml", 'checks:\n  smoke: node -e "process.exit(7)"\n');
  const close = ospec(root, "close", "--change", "fix-readme", "--json");

  assert.strictEqual(close.code, 1);
  assert.strictEqual(close.json.error.code, "evidence-stale");
  assert.strictEqual(stateOf(root, "fix-readme").status, "open");
});

test("check without declared checks reports what is missing", (t) => {
  const { root } = project(t, { checks: null });
  ospec(root, ...OPEN_DOCS);
  const result = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(result.json.verdict, "missing");
  assert.match(result.json.missing[0].reason, /no checks declared in idd\/config.yaml/);
  assert.deepStrictEqual(stateOf(root, "fix-readme").runs, []);
});

test("missing checks guide next and check to approved configuration, then allow close", (t) => {
  const { root } = project(t, { checks: null });
  writeFile(root, "package.json", JSON.stringify({ scripts: { test: "node verify.js" } }));
  ospec(root, ...OPEN_DOCS);
  const configFile = path.join(root, "idd", "config.yaml");
  const stateBefore = fs.readFileSync(path.join(root, "idd", "fix-readme", "state.yaml"), "utf8");
  const next = ospec(root, "next", "--change", "fix-readme", "--json");
  assert.strictEqual(next.code, 0, next.stderr);
  assert.strictEqual(next.json.next_step.action, "configure-checks");
  assert.strictEqual(next.json.next_step.candidate_command, "npm test");
  assert.strictEqual(next.json.next_step.requires_approval, true);
  assert.match(next.json.next_step.how, /checks:.*idd\/config.yaml/);
  assert.strictEqual(fs.readFileSync(path.join(root, "idd", "fix-readme", "state.yaml"), "utf8"), stateBefore);
  assert.ok(!fs.existsSync(configFile), "guidance never writes configuration");
  const text = ospec(root, "next", "--change", "fix-readme");
  assert.match(text.stdout, /idd\/config.yaml/);
  assert.match(text.stdout, /npm test/);
  assert.match(text.stdout, /approval/i);

  const checked = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(checked.code, 0);
  assert.strictEqual(checked.json.verdict, "missing");
  assert.strictEqual(checked.json.next.next_step.action, "configure-checks");
  assert.match(checked.json.missing[0].reason, /approval/i);
  assert.ok(!fs.existsSync(configFile));
  assert.deepStrictEqual(stateOf(root, "fix-readme").runs, []);
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").code, 1);

  // Represents the user-approved edit; neither next nor check performs it.
  writeFile(root, "idd/config.yaml", "checks:\n  test: npm test\n");
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "next", "--change", "fix-readme", "--json").json.next_step.action, "satisfy-obligation");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").code, 0);
});

test("empty checks keep configuration and require a user command when no candidate is known", (t) => {
  const { root } = project(t, { checks: "strict_tdd: false\nchecks:\n" });
  ospec(root, ...OPEN_DOCS);
  const before = fs.readFileSync(path.join(root, "idd", "config.yaml"), "utf8");
  const next = ospec(root, "next", "--change", "fix-readme", "--json");
  assert.strictEqual(next.json.next_step.action, "configure-checks");
  assert.strictEqual(next.json.next_step.candidate_command, null);
  assert.match(next.json.next_step.how, /ask.*command/i);
  assert.strictEqual(fs.readFileSync(path.join(root, "idd", "config.yaml"), "utf8"), before);
});

test("check recomputes the signals from the diff: touching a migration adds its obligation", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", "--no-open-facts", "--basis", "The request fixes every behavior.");
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

// E1.4 (b1): contract and migration evidence (REQ-idd-015).

test("check satisfies the contract obligation once the diff touches a contract document and a test", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", "--no-open-facts", "--basis", "The request fixes every behavior.");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");

  const codeOnly = ospec(root, "check", "--change", "page-size", "--json");
  assert.deepStrictEqual(codeOnly.json.added.signals, ["public-contract"]);
  const reason = (result) => result.json.missing.find((entry) => entry.obligation === "contract-spec-and-test")?.reason;
  assert.match(reason(codeOnly), /touches no contract document/);

  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\n");
  assert.match(reason(ospec(root, "check", "--change", "page-size", "--json")), /touches no test of the contract/);

  writeFile(root, "src/api/orders.test.js", "// size=50\n");
  const settled = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(settled.json.verdict, "ready", JSON.stringify(settled.json.missing));
  const evidence = stateOf(root, "page-size").evidence.find((entry) => entry.kind === "contract-spec-and-test");
  assert.deepStrictEqual(evidence.detail.documents, ["api/openapi.yaml"]);
  assert.deepStrictEqual(evidence.detail.tests, ["src/api/orders.test.js"]);
});

test("the project declares where its contract documents live", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node verify.js\ncontracts:\n  documents:\n    - specs/**\n" });
  ospec(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", "--no-open-facts", "--basis", "The request fixes every behavior.");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");
  writeFile(root, "specs/orders.md", "size up to 50\n");
  writeFile(root, "test/orders.js", "// size=50\n");
  assert.strictEqual(ospec(root, "check", "--change", "page-size", "--json").json.verdict, "ready");
});

test("a passing migration test with its plan satisfies the migration obligation until the tree changes", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", "--no-open-facts", "--basis", "The request fixes every behavior.");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name);\n");
  ospec(root, "check", "--change", "add-index");

  const args = ["run", "--change", "add-index", "--obligation", "migration-compat-and-test", "--command", "node verify.js"];
  assert.strictEqual(ospec(root, ...args, "--json").code, 2, "a migration run needs its plan");
  const plan = "additive index; rollback drops it";
  const passed = ospec(root, ...args, "--plan", plan, "--json");
  assert.strictEqual(passed.code, 0, passed.stderr);
  assert.ok(passed.json.evidence);
  assert.strictEqual(stateOf(root, "add-index").runs.at(-1).purpose, "migration-test");
  assert.strictEqual(ospec(root, "check", "--change", "add-index", "--json").json.verdict, "ready");

  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name, id);\n");
  const moved = ospec(root, "check", "--change", "add-index", "--json");
  assert.deepStrictEqual(moved.json.missing.map((entry) => entry.obligation), ["migration-compat-and-test"]);
  assert.match(moved.json.missing[0].reason, /no passing migration test on the current tree/);
});

// E1.4 (b2): the trust review on the bounded review lineage (REQ-idd-016).

function openRotation(t) {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "rotate-tokens", "--kind", "feature", "--summary", "Rotate tokens.", "--acceptance", "Old tokens expire.", "--no-open-facts", "--basis", "The request fixes every behavior.");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600 };\n");
  const checked = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.deepStrictEqual(checked.json.added.signals, ["security-boundary"]);
  assert.match(checked.json.missing.find((entry) => entry.obligation === "trust-review").reason, /no trust review yet/);
  return root;
}

const review = (root, action, ...extra) => ospec(root, "review", action, "--change", "rotate-tokens", ...extra, "--json");
const BLOCKER = { severity: "BLOCKER", summary: "Old tokens never expire.", acceptance_criteria: "Expired tokens are rejected." };

test("a trust review without blockers satisfies trust-review until the reviewed paths change", (t) => {
  const root = openRotation(t);
  const started = review(root, "start");
  assert.strictEqual(started.code, 0, started.stderr);
  assert.deepStrictEqual(started.json.review.request, {
    lineage_id: started.json.review.lineage_id,
    generation: 1,
    lens: "trust",
    reviewer: "review-trust",
    paths: ["src/auth/tokens.js", "src/pages.txt"],
  });

  const recorded = review(root, "record", "--result", JSON.stringify({ findings: [] }));
  assert.strictEqual(recorded.code, 0, recorded.stderr);
  assert.strictEqual(recorded.json.review.status, "approved");
  assert.ok(recorded.json.evidence);
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");

  writeFile(root, "notes.md", "unrelated\n");
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready", "other paths keep the review");

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 60 };\n");
  const stale = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.match(stale.json.missing.find((entry) => entry.obligation === "trust-review").reason, /reviewed paths changed after the review/);
  const successor = review(root, "start");
  assert.strictEqual(successor.json.review.generation, 2);
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 2);
});

test("a blocker gets one bounded correction validated against its frozen id", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const frozen = review(root, "record", "--result", JSON.stringify({ findings: [BLOCKER] }));
  assert.strictEqual(frozen.json.review.status, "correction-required");
  const [finding] = frozen.json.review.findings;
  assert.strictEqual(finding.blocking, true);

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600, rejectExpired: true };\n");
  const corrected = review(root, "correct");
  assert.strictEqual(corrected.code, 0, corrected.stderr);
  assert.deepStrictEqual(corrected.json.review.validate, { validator: "review-correction", finding_ids: [finding.id] });

  const verdict = { outcomes: [{ id: finding.id, status: "resolved" }], regression: { detected: false, evidence: ["expired tokens rejected"] } };
  const validated = review(root, "validate", "--result", JSON.stringify(verdict));
  assert.strictEqual(validated.json.review.status, "approved");
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");
});

test("review refuses bad results, a change without the obligation and an unknown action", (t) => {
  const root = openRotation(t);
  review(root, "start");
  assert.strictEqual(review(root, "record").code, 2, "record needs --result");
  assert.strictEqual(review(root, "record", "--result", "{not json").code, 2);
  const invalid = review(root, "record", "--result", JSON.stringify({ findings: [{ severity: "HUGE" }] }));
  assert.strictEqual(invalid.code, 1);
  assert.strictEqual(invalid.json.error.code, "review-refused");
  assert.strictEqual(review(root, "restart").code, 2);

  ospec(root, ...OPEN_DOCS);
  const docs = ospec(root, "review", "start", "--change", "fix-readme", "--json");
  assert.strictEqual(docs.json.error.code, "unknown-obligation");
});

test("a documentation-only change closes its checks without any review", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "docs/security/token-rotation.md", "Rotate tokens hourly.\n");
  const checked = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(checked.json.verdict, "ready");
  assert.deepStrictEqual(stateOf(root, "fix-readme").obligations.map((entry) => entry.id), ["checks-pass"]);
});

// E1.4 (c) ospec close (REQ-idd-009, REQ-idd-017).

test("a documentation change closes without review and is archived by date", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "docs/security/token-rotation.md", "Rotate tokens hourly.\n");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");

  const closed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
  const day = closed.json.closed_at.slice(0, 10);
  assert.strictEqual(closed.json.archive.destination, `idd/archive/${day}-fix-readme`);
  assert.strictEqual(closed.json.archive.already_complete, false);
  assert.ok(!fs.existsSync(path.join(root, "idd", "fix-readme")));
  const archived = JSON.parse(fs.readFileSync(path.join(root, "idd", "archive", `${day}-fix-readme`, "state.yaml"), "utf8"));
  assert.strictEqual(archived.status, "closed");
  assert.deepStrictEqual(ospec(root, "status", "--json").json.changes, []);

  const again = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(again.code, 0, again.stderr);
  assert.strictEqual(again.json.archive.already_complete, true);
  assert.match(ospec(root, "close", "--change", "fix-readme").stdout, /already archived in idd\/archive\//);
});

test("close is refused with a pending obligation or a tree changed after the last check", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  const pending = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(pending.code, 1);
  assert.strictEqual(pending.json.error.code, "close-refused");
  assert.match(pending.json.error.message, /checks-pass/);

  writeFile(root, "src/pages.txt", "2");
  ospec(root, "check", "--change", "fix-readme");
  writeFile(root, "src/late.js", "late edit\n");
  const stale = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(stale.json.error.code, "evidence-stale");
  assert.ok(fs.existsSync(path.join(root, "idd", "fix-readme", "state.yaml")), "a refused close moves nothing");
  assert.strictEqual(stateOf(root, "fix-readme").status, "open");
});

test("a change with a living document closes once its plan and decisions are written", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "add-paging", "--kind", "feature", "--summary", "Page the list.", "--acceptance", "Two pages.", "--no-open-facts", "--basis", "The request fixes every behavior.");
  ospec(root, "signals", "--change", "add-paging", "--work-units", "2");
  writeFile(root, "src/pages.txt", "2");
  const doc = path.join(root, "idd", "add-paging", "change.md");

  const blank = ospec(root, "check", "--change", "add-paging", "--json");
  assert.strictEqual(blank.json.verdict, "missing");
  assert.match(blank.json.missing[0].reason, /the section Plan is empty/);
  assert.strictEqual(ospec(root, "close", "--change", "add-paging", "--json").json.error.code, "close-refused");

  const text = fs.readFileSync(doc, "utf8").replace("## Plan\n", "## Plan\n\n1. Count pages.\n").replace("## Decisions\n", "## Decisions\n\n- Round up.\n");
  fs.writeFileSync(doc, text);
  assert.strictEqual(ospec(root, "check", "--change", "add-paging", "--json").json.verdict, "ready");

  const closed = ospec(root, "close", "--change", "add-paging", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
  const archived = fs.readFileSync(path.join(root, closed.json.archive.destination, "change.md"), "utf8");
  assert.match(archived, /- ev-\d+: check-run for checks-pass/);
  assert.match(archived, /- ev-\d+: living-doc-current for living-doc/);
  assert.match(archived, /1\. Count pages\./, "the model-written sections are kept");
});

// E1.7 (a) ospec doctor (REQ-idd-019): read-only, exit 1 only on errors.
function doctor(t, root, ...args) {
  const home = tempRoot(t);
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData", "Roaming") };
  for (const name of Object.keys(env)) if (name.startsWith("DISABLE_") || name === "CODEX_HOME" || name === "XDG_CONFIG_HOME") delete env[name];
  const result = spawnSync(process.execPath, [CLI, "doctor", ...args, "--root", root], { encoding: "utf8", env });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, json: args.includes("--json") ? JSON.parse(result.stdout) : null };
}

test("doctor reports a healthy project with exit 0 and an invalid config with exit 1", (t) => {
  const root = tempRoot(t);
  const healthy = doctor(t, root, "--json");
  assert.strictEqual(healthy.code, 0, healthy.stderr);
  assert.strictEqual(healthy.json.command, "doctor");
  assert.strictEqual(healthy.json.summary.errors, 0);
  assert.ok(healthy.json.checks.some((check) => check.scope === "project" && check.id === "mode" && check.detail === "idd"));

  fs.mkdirSync(path.join(root, "idd"), { recursive: true });
  fs.writeFileSync(path.join(root, "idd", "config.yaml"), "mode: waterfall\n");
  const broken = doctor(t, root);
  assert.strictEqual(broken.code, 1);
  assert.match(broken.stdout, /error\s+project\/idd-config/);
  assert.match(broken.stdout, /action: /);
});

test("doctor --target checks one of the seven hosts and refuses an unknown one as usage", (t) => {
  const root = tempRoot(t);
  const missing = doctor(t, root, "--target", "claude", "--json");
  assert.strictEqual(missing.code, 1);
  assert.ok(missing.json.checks.some((check) => check.scope === "claude" && check.id === "plugin" && check.status === "error"));
  const codex = doctor(t, root, "--target", "codex", "--json");
  assert.strictEqual(codex.code, 1);
  assert.ok(codex.json.checks.some((check) => check.scope === "codex" && check.id === "install" && check.status === "error"));
  const unknown = doctor(t, root, "--target", "emacs");
  assert.strictEqual(unknown.code, 2);
  assert.match(unknown.stderr, /unknown target: emacs/);
});
