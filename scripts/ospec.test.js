"use strict";

// E1.2 ospec-cli-core: end-to-end contract of `ospec status | next | record`
// (openspec/specs/idd/spec.md, REQ-idd-011), run as a child process against a
// temporary project root.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const { buildReceipt, receiptPath } = require("./lib/review-receipt.js");

const CLI = path.join(__dirname, "ospec.js");

// A directory outside any git work tree.
function plainRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

// A project: a git work tree with no commits yet, since a change opens only
// inside one (E4.8).
function tempRoot(t) {
  const root = plainRoot(t);
  execFileSync("git", ["-C", root, "init", "-q", "-b", "main"]);
  return root;
}

function ospecWith(env, root, ...args) {
  const result = spawnSync(process.execPath, [CLI, ...args, "--root", root], { encoding: "utf8", env });
  let json = null;
  if (args.includes("--json")) json = JSON.parse(result.stdout);
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, json };
}

function ospec(root, ...args) {
  return ospecWith(process.env, root, ...args);
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

const FEATURE_COVER = [
  "--request",
  "The request fixes every behavior.",
  ...[
    "inputs=The request fixes",
    "uniqueness=request fixes every",
    "persistence=fixes every behavior",
    "copy=every behavior.",
    "url-state=The request fixes every",
    "accessibility=request fixes every behavior",
    "errors=quest fixes every",
  ].flatMap((quote) => ["--quote", quote]),
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
    action: "declare-plan",
    how: "ospec signals --change fix-pagination --path <file>... [--work-units <n>] [--decision] [--operation <op>]",
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
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
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
  const base = ["record", "intent", "--change", "discount-codes", "--kind", "bug", "--summary", "Discount codes.", "--acceptance", "VERANO10 takes 10%."];
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
  assert.strictEqual(resolved.json.next.next_step.action, "declare-plan");
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
  assert.match(text.stdout, /no change: the plan and every derived signal were already recorded/);

  // A wider plan that derives no new signal is still recorded, and says so.
  const widened = ospec(root, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  assert.strictEqual(widened.code, 0, widened.stderr);
  assert.match(widened.stdout, /recorded the plan; every derived signal was already recorded/);
});

test("an open ADR gate is asked before the plan and the obligations", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  const refused = ospec(root, "record", "gate", "--change", "fix-pagination", "--gate", "adr-amend-or-contradict", "--resolve", "--answer", "amend", "--source", "user", "--json");
  assert.strictEqual(refused.json.error.code, "gate-not-open");

  const opened = ospec(root, "record", "gate", "--change", "fix-pagination", "--gate", "adr-amend-or-contradict", "--open", "--reason", "ADR-0003 fixes page size", "--json");
  assert.strictEqual(opened.code, 0, opened.stderr);
  assert.deepStrictEqual(opened.json.next.next_step, { action: "resolve-gate", gate: "adr-amend-or-contradict" });

  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  const next = ospec(root, "next", "--change", "fix-pagination", "--json");
  assert.deepStrictEqual(next.json.next_step, { action: "resolve-gate", gate: "adr-amend-or-contradict" });
  assert.deepStrictEqual(next.json.pending_obligations.map((o) => o.id), ["repro-test", "checks-pass"]);

  const resolved = ospec(root, "record", "gate", "--change", "fix-pagination", "--gate", "adr-amend-or-contradict", "--resolve", "--answer", "amend ADR-0003", "--source", "user", "--json");
  assert.strictEqual(resolved.json.next.next_step.obligation, "repro-test");
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

  fs.rmSync(path.join(root, ".git"), { recursive: true, force: true });
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
  ospec(root, "signals", "--change", "fix-readme", "--path", "README.md");
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
  ospec(root, "signals", "--change", "fix-readme", "--path", "README.md");
  const before = fs.readFileSync(path.join(root, "idd", "config.yaml"), "utf8");
  const next = ospec(root, "next", "--change", "fix-readme", "--json");
  assert.strictEqual(next.json.next_step.action, "configure-checks");
  assert.strictEqual(next.json.next_step.candidate_command, null);
  assert.match(next.json.next_step.how, /ask.*command/i);
  assert.strictEqual(fs.readFileSync(path.join(root, "idd", "config.yaml"), "utf8"), before);
});

test("check recomputes the signals from the diff: touching a migration adds its obligation", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...FEATURE_COVER);
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
  fs.rmSync(path.join(plain, ".git"), { recursive: true, force: true });
  const noGit = ospec(plain, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(noGit.code, 1);
  assert.strictEqual(noGit.json.error.code, "not-a-git-repo");
  assert.strictEqual(ospec(plain, "check", "--json").code, 2, "check needs --change");
});

// E4.8 non-git-workspace: a change opens only inside a git work tree, and the
// CLI says so before any gate or work, with the step to take.

test("outside a git work tree record intent and next stop with the next step and create nothing", (t) => {
  const plain = plainRoot(t);
  const intent = ospec(plain, ...OPEN_BUG);
  assert.strictEqual(intent.code, 1);
  assert.strictEqual(intent.json.error.code, "not-a-git-repo");
  assert.match(intent.json.error.how, /work directly/);
  assert.match(intent.json.error.how, /git init -b main/);
  assert.ok(!fs.existsSync(path.join(plain, "idd")), "nothing is created under idd/");

  for (const args of [["next"], ["next", "--change", "fix-pagination"]]) {
    const next = ospec(plain, ...args, "--json");
    assert.strictEqual(next.code, 1);
    assert.strictEqual(next.json.error.code, "not-a-git-repo");
    assert.strictEqual(next.json.error.how, intent.json.error.how);
  }

  const text = ospec(plain, ...OPEN_BUG.filter((arg) => arg !== "--json"));
  assert.strictEqual(text.code, 1);
  assert.match(text.stderr, /\(not-a-git-repo\)\n.*git init -b main/);
});

test("a change left open outside git cannot continue, and status still lists it", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  fs.rmSync(path.join(root, ".git"), { recursive: true, force: true });

  const next = ospec(root, "next", "--change", "fix-pagination", "--json");
  assert.strictEqual(next.json.error.code, "not-a-git-repo");
  const status = ospec(root, "status", "--json");
  assert.strictEqual(status.code, 0, status.stderr);
  assert.deepStrictEqual(status.json.changes.map((c) => c.change), ["fix-pagination"]);
});

test("without git on PATH a change does not open: git-not-found", (t) => {
  const root = plainRoot(t);
  const env = { ...process.env, PATH: plainRoot(t) };
  for (const args of [OPEN_BUG, ["next", "--json"]]) {
    const result = ospecWith(env, root, ...args);
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.json.error.code, "git-not-found");
    assert.match(result.json.error.how, /install git/);
  }
  assert.ok(!fs.existsSync(path.join(root, "idd")));
});

test("a repository created with git init -b main and no commit takes a change to close", (t) => {
  const root = tempRoot(t);
  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\n");
  writeFile(root, "verify.js", "console.log('ok');\n");
  const intent = ospec(root, ...OPEN_DOCS, "--json");
  assert.strictEqual(intent.code, 0, intent.stderr);
  assert.strictEqual(stateOf(root, "fix-readme").base, null, "no commit to start from");
  assert.strictEqual(ospec(root, "next", "--change", "fix-readme", "--json").code, 0);

  const check = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(check.code, 0, check.stderr);
  assert.strictEqual(check.json.verdict, "ready", JSON.stringify(check.json.missing));
  const close = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(close.code, 0, close.stdout);
});

// E1.4 (b1): contract and migration evidence (REQ-idd-015).

test("check satisfies the contract obligation once the diff touches a contract document and a test", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");

  const codeOnly = ospec(root, "check", "--change", "page-size", "--json");
  assert.deepStrictEqual(codeOnly.json.added.signals, ["untested-product", "public-contract"]);
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
  ospec(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");
  writeFile(root, "specs/orders.md", "size up to 50\n");
  writeFile(root, "test/orders.js", "// size=50\n");
  assert.strictEqual(ospec(root, "check", "--change", "page-size", "--json").json.verdict, "ready");
});

test("a passing migration test with its plan satisfies the migration obligation until the tree changes", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...FEATURE_COVER);
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
  ospec(root, "record", "intent", "--change", "rotate-tokens", "--kind", "feature", "--summary", "Rotate tokens.", "--acceptance", "Old tokens expire.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600 };\n");
  writeFile(root, "src/auth/tokens.test.js", "test('ttl', () => {});\n");
  const checked = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.deepStrictEqual(checked.json.added.signals, ["security-boundary"]);
  assert.match(checked.json.missing.find((entry) => entry.obligation === "trust-review").reason, /no trust review yet/);
  return root;
}

const review = (root, action, ...extra) => ospec(root, "review", action, "--change", "rotate-tokens", ...extra, "--json");
const BLOCKER = { severity: "BLOCKER", summary: "Old tokens never expire.", acceptance_criteria: "Expired tokens are rejected.", location: "src/auth/tokens.js:1" };

// The reviewer's answer to the review in progress (OSP-029): its request
// digest and a cite of the first line of each reviewed path.
function answer(root, findings = [], overrides = {}) {
  const { request } = review(root, "start").json.review;
  const reviewed = request.paths.map((file) => ({ path: file, cites: [`${file}:1`] }));
  return JSON.stringify({ request_digest: request.request_digest, reviewed, findings, ...overrides });
}

const recordAnswer = (root, findings) => review(root, "record", "--result", answer(root, findings));

test("a trust review without blockers satisfies trust-review until the reviewed paths change", (t) => {
  const root = openRotation(t);
  const started = review(root, "start");
  assert.strictEqual(started.code, 0, started.stderr);
  const { request_digest: digest, result_contract: contract, ...request } = started.json.review.request;
  assert.deepStrictEqual(request, {
    lineage_id: started.json.review.lineage_id,
    generation: 1,
    lens: "trust",
    reviewer: "review-trust",
    paths: ["src/auth/tokens.js", "src/auth/tokens.test.js", "src/pages.txt"],
  });
  assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(contract, /reviewed/);

  const recorded = recordAnswer(root);
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
  assert.strictEqual(successor.json.review.request.reviewer, "review-trust");
});

test("an IDD successor needs no approval, and an unchanged or exhausted review is refused", (t) => {
  const root = openRotation(t);
  review(root, "start");
  recordAnswer(root);
  const same = review(root, "start");
  assert.strictEqual(same.code, 1);
  assert.strictEqual(same.json.error.code, "review-current");
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 1);

  for (let generation = 2; generation <= 3; generation += 1) {
    writeFile(root, "src/auth/tokens.js", `module.exports = { ttl: ${generation} };\n`);
    ospec(root, "check", "--change", "rotate-tokens", "--json");
    const started = review(root, "start");
    assert.strictEqual(started.code, 0, started.stderr);
    assert.strictEqual(started.json.review.generation, generation);
    recordAnswer(root);
  }
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 4 };\n");
  const stale = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(stale.code, 0, stale.stderr);
  const exhausted = review(root, "start");
  assert.strictEqual(exhausted.code, 1);
  assert.strictEqual(exhausted.json.error.code, "review-limit");
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 3);
  ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 3, "check does not open another review");
});

test("a tree back on the approved candidate satisfies trust-review again", (t) => {
  const root = openRotation(t);
  review(root, "start");
  recordAnswer(root);
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 60 };\n");
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "missing");

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600 };\n");
  const restored = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.strictEqual(restored.json.verdict, "ready");
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews.length, 1);
});

test("after the last review the person authorizes one more through the review-limit gate", (t) => {
  const root = openRotation(t);
  const reviewLimit = () => stateOf(root, "rotate-tokens").gates.filter((gate) => gate.id === "review-limit");
  for (let generation = 1; generation <= 3; generation += 1) {
    writeFile(root, "src/auth/tokens.js", `module.exports = { ttl: ${generation} };\n`);
    ospec(root, "check", "--change", "rotate-tokens", "--json");
    review(root, "start");
    recordAnswer(root);
  }
  assert.deepStrictEqual(reviewLimit(), [], "an approved last review opens nothing");

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 4 };\n");
  const stale = ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.match(stale.json.missing.find((entry) => entry.obligation === "trust-review").reason, /review-limit/);
  assert.deepStrictEqual(reviewLimit().map((gate) => gate.status), ["open"]);
  assert.deepStrictEqual(ospec(root, "next", "--change", "rotate-tokens", "--json").json.next_step, { action: "resolve-gate", gate: "review-limit" });
  assert.strictEqual(review(root, "start").json.error.code, "review-limit");
  const manual = ospec(root, "record", "gate", "--change", "rotate-tokens", "--gate", "review-limit", "--open", "--reason", "more", "--json");
  assert.strictEqual(manual.json.error.code, "gate-managed-by-review");

  ospec(root, "record", "gate", "--change", "rotate-tokens", "--gate", "review-limit", "--resolve", "--answer", "One more review.", "--source", "user", "--json");
  const fourth = review(root, "start");
  assert.strictEqual(fourth.code, 0, fourth.stderr);
  assert.strictEqual(fourth.json.review.generation, 4);
  recordAnswer(root);
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 5 };\n");
  ospec(root, "check", "--change", "rotate-tokens", "--json");
  assert.deepStrictEqual(reviewLimit().map((gate) => gate.status), ["resolved", "open"], "each authorization buys one review");
  assert.strictEqual(review(root, "start").json.error.code, "review-limit");
});

test("a blocker gets one bounded correction validated against its frozen id", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const frozen = recordAnswer(root, [BLOCKER]);
  assert.strictEqual(frozen.json.review.status, "correction-required");
  const [finding] = frozen.json.review.findings;
  assert.strictEqual(finding.blocking, true);

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600, rejectExpired: true };\n");
  const corrected = review(root, "correct");
  assert.strictEqual(corrected.code, 0, corrected.stderr);
  const { validate } = corrected.json.review;
  assert.strictEqual(validate.validator, "review-correction");
  assert.deepStrictEqual(validate.finding_ids, [finding.id]);
  assert.deepStrictEqual(validate.paths, ["src/auth/tokens.js"]);
  assert.deepStrictEqual(review(root, "start").json.review.validate, validate, "review start returns the validation request again");

  const outcomes = [{ id: finding.id, status: "resolved" }];
  const regression = { detected: false, evidence: ["expired tokens rejected"] };
  const uncited = review(root, "validate", "--result", JSON.stringify({ outcomes, regression }));
  assert.strictEqual(uncited.json.error.code, "review-refused");
  assert.match(uncited.json.error.message, /request_digest/);
  const pastEnd = { request_digest: validate.request_digest, reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:2"] }], outcomes, regression };
  assert.match(review(root, "validate", "--result", JSON.stringify(pastEnd)).json.error.message, /src\/auth\/tokens\.js:2/);

  const verdict = { ...pastEnd, reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:1"] }] };
  const validated = review(root, "validate", "--result", JSON.stringify(verdict));
  assert.strictEqual(validated.json.review.status, "approved");
  assert.match(validated.json.warnings.join("\n"), /no SubagentStop receipt of review-correction/);
  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");
});

test("a correction outside one bounded correction escalates and review start opens the successor", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const frozen = recordAnswer(root, [BLOCKER]);
  const [finding] = frozen.json.review.findings;

  // The fix needs a file the review never froze.
  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600, rejectExpired: true };\n");
  writeFile(root, "src/auth/expiry.js", "module.exports = (token) => token.exp > Date.now();\n");
  const refused = review(root, "correct");
  assert.strictEqual(refused.code, 1);
  assert.strictEqual(refused.json.error.code, "review-refused");
  assert.match(refused.json.error.message, /does not fit one bounded correction.*ospec review start/);

  const successor = review(root, "start");
  assert.strictEqual(successor.code, 0, successor.stderr);
  assert.strictEqual(successor.json.review.generation, 2);
  assert.deepStrictEqual(successor.json.review.request.predecessor_findings.map((entry) => entry.id), [finding.id]);
  const [first, second] = stateOf(root, "rotate-tokens").reviews;
  assert.strictEqual(first.status, "escalated");
  assert.strictEqual(second.predecessor_lineage_id, first.lineage_id);
  assert.ok(second.genesis.paths.includes("src/auth/expiry.js"), "the successor reviews the new path");
});

// OSP-029 (#351): a {"findings":[]} the main agent wrote by hand approved the
// review and let the change close without any reviewer run.
test("review record refuses a result that does not cite the frozen candidate", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const refusedWith = (result, pattern) => {
    const refused = review(root, "record", "--result", result);
    assert.strictEqual(refused.code, 1, refused.stdout);
    assert.strictEqual(refused.json.error.code, "review-refused");
    assert.match(refused.json.error.message, pattern);
  };
  refusedWith(JSON.stringify({ findings: [] }), /request_digest/);
  assert.notStrictEqual(ospec(root, "next", "--change", "rotate-tokens", "--json").json.next_step.action, "close");
  refusedWith(answer(root, [], { reviewed: [{ path: "src/auth/tokens.js", cites: ["src/auth/tokens.js:2"] }] }), /src\/auth\/tokens\.js:2/);
  refusedWith(answer(root, [{ ...BLOCKER, location: undefined }]), /location/);
  assert.strictEqual(stateOf(root, "rotate-tokens").reviews[0].status, "reviewing");

  const recorded = recordAnswer(root);
  assert.strictEqual(recorded.code, 0, recorded.stderr);
  assert.strictEqual(recorded.json.review.status, "approved");
  const evidence = stateOf(root, "rotate-tokens").evidence.find((entry) => entry.id === recorded.json.evidence);
  assert.strictEqual(evidence.detail.attestation, "relayed");

  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");
  const closed = ospec(root, "close", "--change", "rotate-tokens", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
  assert.deepStrictEqual(closed.json.reviews, [{ evidence: evidence.id, lineage_id: evidence.detail.lineage_id, attestation: "relayed" }]);
  assert.match(ospec(root, "close", "--change", "rotate-tokens").stdout, new RegExp(`trust review ${evidence.id}: relayed`));
});

// OSP-029 step 2: the receipt the SubagentStop hook leaves for the reviewer's
// result attests it; the same digest with another result is refused.
test("a SubagentStop receipt of the reviewer's result is recorded as subagent-stop", (t) => {
  const root = openRotation(t);
  // As installed: .ospec/ is ignored, which git add refuses to exclude.
  writeFile(root, ".gitignore", ".ospec/\n");
  const result = JSON.parse(answer(root));
  const receipt = buildReceipt({ agent: "review-trust", result, recordedAt: "2026-10-21T08:00:00.000Z" });
  fs.mkdirSync(path.join(root, ".ospec", "review-receipts"), { recursive: true });
  fs.writeFileSync(receiptPath(root, result.request_digest), JSON.stringify(receipt));

  const changed = review(root, "record", "--result", JSON.stringify({ ...result, findings: [BLOCKER] }));
  assert.strictEqual(changed.json.error.code, "review-refused");
  assert.match(changed.json.error.message, /differs from the one review-trust returned/);

  const recorded = review(root, "record", "--result", JSON.stringify(result));
  assert.strictEqual(recorded.code, 0, recorded.stdout);
  assert.strictEqual(recorded.json.warnings, undefined);
  const evidence = stateOf(root, "rotate-tokens").evidence.find((entry) => entry.id === recorded.json.evidence);
  assert.strictEqual(evidence.detail.attestation, "subagent-stop");
  assert.strictEqual(evidence.detail.receipt.result_digest, receipt.result_digest);
  assert.ok(fs.existsSync(receiptPath(root, result.request_digest)), "the receipt is kept");

  assert.strictEqual(ospec(root, "check", "--change", "rotate-tokens", "--json").json.verdict, "ready");
  const closed = ospec(root, "close", "--change", "rotate-tokens", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
  assert.strictEqual(closed.json.reviews[0].attestation, "subagent-stop");
});

// The receipt lands in the working tree: in a project that does not ignore
// .ospec/ it must not count as a changed path, or the one bounded correction
// looks oversized and review start escalates the lineage.
test("a review receipt in a project that does not ignore .ospec/ is not part of the diff", (t) => {
  const root = openRotation(t);
  review(root, "start");
  const frozen = recordAnswer(root, [BLOCKER]);
  const [finding] = frozen.json.review.findings;
  const digest = `sha256:${"c".repeat(64)}`;
  fs.mkdirSync(path.join(root, ".ospec", "review-receipts"), { recursive: true });
  fs.writeFileSync(receiptPath(root, digest), JSON.stringify(buildReceipt({ agent: "review-trust", result: { request_digest: digest, findings: [] }, recordedAt: "2026-10-21T08:00:00.000Z" })));

  writeFile(root, "src/auth/tokens.js", "module.exports = { ttl: 3600, rejectExpired: true };\n");
  const corrected = review(root, "correct");
  assert.strictEqual(corrected.code, 0, corrected.stdout);
  assert.deepStrictEqual(corrected.json.review.validate.finding_ids, [finding.id]);
  assert.deepStrictEqual(corrected.json.review.validate.paths, ["src/auth/tokens.js"]);
  assert.ok(!ospec(root, "check", "--change", "rotate-tokens", "--json").stdout.includes(".ospec/review-receipts"), "check does not see the receipt");
});

test("a deleted reviewed path is cited in the base tree", (t) => {
  const root = openRotation(t);
  fs.rmSync(path.join(root, "src", "pages.txt"));
  ospec(root, "check", "--change", "rotate-tokens", "--json");
  const { request } = review(root, "start").json.review;
  assert.ok(request.paths.includes("src/pages.txt"));
  const recorded = recordAnswer(root);
  assert.strictEqual(recorded.code, 0, recorded.stdout);
  assert.strictEqual(recorded.json.review.status, "approved");
});

test("review refuses bad results, a change without the obligation and an unknown action", (t) => {
  const root = openRotation(t);
  review(root, "start");
  assert.strictEqual(review(root, "record").code, 2, "record needs --result");
  assert.strictEqual(review(root, "record", "--result", "{not json").code, 2);
  const invalid = review(root, "record", "--result", answer(root, [{ severity: "HUGE" }]));
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

// E3.5 knowledge records (REQ-idd-024): close derives them from the archive.
test("close returns the decisions of the archived change as knowledge records", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  assert.strictEqual(ospec(root, "signals", "--change", "fix-readme", "--path", "docs/security/token-rotation.md", "--decision").code, 0);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "docs/security/token-rotation.md", "Rotate tokens hourly.\n");
  const doc = path.join(root, "idd", "fix-readme", "change.md");
  const decided = fs
    .readFileSync(doc, "utf8")
    .replace("## Plan\n", "## Plan\n\n1. Document the rotation.\n")
    .replace("## Decisions\n", "## Decisions\n\n- **Hourly rotation:** tokens rotate every hour.\n");
  fs.writeFileSync(doc, decided);
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");

  const closed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
  const day = closed.json.closed_at.slice(0, 10);
  assert.deepStrictEqual(closed.json.records, [
    {
      kind: "dc",
      topic: "knowledge/dc/fix-readme/1",
      title: "Hourly rotation",
      summary: "**Hourly rotation:** tokens rotate every hour.",
      source: `idd/archive/${day}-fix-readme/change.md`,
      change: "fix-readme",
      date: day,
    },
  ]);
  assert.deepStrictEqual(ospec(root, "close", "--change", "fix-readme", "--json").json.records, closed.json.records, "closing again derives the same records");
  assert.match(ospec(root, "close", "--change", "fix-readme").stdout, /1 knowledge record\(s\) to keep in cross-session memory/);
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
  ospec(root, "record", "intent", "--change", "add-paging", "--kind", "feature", "--summary", "Page the list.", "--acceptance", "Two pages.", ...FEATURE_COVER);
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

// E1.11 idd-protocol-hygiene: next asks for the plan before any obligation,
// and a declared signal the diff does not confirm can be retracted with a
// reason (REQ-idd-006, REQ-idd-011, REQ-idd-012).

test("next asks to declare the plan after the intent gates and until signals records it", (t) => {
  const root = tempRoot(t);
  const opened = ospec(root, ...OPEN_BUG);
  assert.deepStrictEqual(opened.json.next.next_step, {
    action: "declare-plan",
    how: "ospec signals --change fix-pagination --path <file>... [--work-units <n>] [--decision] [--operation <op>]",
  });
  assert.match(ospec(root, "next", "--change", "fix-pagination").stdout, /next: declare the plan: ospec signals --change fix-pagination/);

  const declared = ospec(root, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js", "--path", "src/lib/paginate.test.js", "--json");
  assert.strictEqual(declared.code, 0, declared.stderr);
  assert.strictEqual(declared.json.next.next_step.obligation, "repro-test");
  assert.deepStrictEqual(stateOf(root, "fix-pagination").plan, {
    paths: ["src/lib/paginate.js", "src/lib/paginate.test.js"],
    work_units: 1,
    decision: false,
    operations: [],
  });

  const widened = ospec(root, "signals", "--change", "fix-pagination", "--path", "src/lib/page-size.js", "--work-units", "2", "--json");
  assert.strictEqual(widened.code, 0, widened.stderr);
  assert.deepStrictEqual(stateOf(root, "fix-pagination").plan, {
    paths: ["src/lib/page-size.js", "src/lib/paginate.js", "src/lib/paginate.test.js"],
    work_units: 2,
    decision: false,
    operations: [],
  });

  const base = ["record", "intent", "--change", "discount-codes", "--kind", "bug", "--summary", "Discount codes.", "--acceptance", "VERANO10 takes 10%."];
  const facts = ospec(root, ...base, "--open-fact", "Does case matter?", "--json");
  assert.deepStrictEqual(facts.json.next.next_step, { action: "resolve-gate", gate: "open-facts" });
  const resolved = ospec(root, "record", "gate", "--change", "discount-codes", "--gate", "open-facts", "--resolve", "--answer", "No.", "--source", "user", "--json");
  assert.strictEqual(resolved.json.next.next_step.action, "declare-plan");
});

test("record retract withdraws a declared signal the diff does not confirm and refuses one it confirms", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...FEATURE_COVER);
  ospec(root, "signals", "--change", "add-index", "--path", "src/api/search.js", "--path", "db/migrations/004_add_index.sql", "--path", "src/pages.txt");
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name);\n");
  writeFile(root, "src/pages.txt", "2");

  const retract = ["record", "retract", "--change", "add-index", "--signal", "public-contract", "--reason", "the search API stays as it is", "--json"];
  const retracted = ospec(root, ...retract);
  assert.strictEqual(retracted.code, 0, retracted.stderr);
  assert.strictEqual(retracted.json.changed, true);
  let state = stateOf(root, "add-index");
  assert.ok(!state.signals.some((signal) => signal.id === "public-contract"));
  assert.deepStrictEqual(state.obligations.find((o) => o.id === "contract-spec-and-test"), {
    id: "contract-spec-and-test",
    signal: "public-contract",
    status: "withdrawn",
    evidence: [],
    withdrawn_reason: "the search API stays as it is",
  });
  assert.deepStrictEqual(state.retracted, [
    {
      id: "public-contract",
      reason: "public contract: touches src/api/search.js (matches **/api/**)",
      source: "declaration",
      retract_reason: "the search API stays as it is",
    },
  ]);

  const file = path.join(root, "idd", "add-index", "state.yaml");
  const before = fs.readFileSync(file, "utf8");
  const again = ospec(root, ...retract);
  assert.strictEqual(again.code, 0, again.stderr);
  assert.strictEqual(again.json.changed, false);
  assert.strictEqual(fs.readFileSync(file, "utf8"), before);

  const confirmed = ospec(root, "record", "retract", "--change", "add-index", "--signal", "persistent-data", "--reason", "not a migration", "--json");
  assert.strictEqual(confirmed.code, 1);
  assert.strictEqual(confirmed.json.error.code, "signal-confirmed-by-diff");
  assert.match(confirmed.json.error.message, /db\/migrations\/004_add_index\.sql/);
  assert.strictEqual(stateOf(root, "add-index").obligations.find((o) => o.id === "migration-compat-and-test").status, "pending");

  const always = ospec(root, "record", "retract", "--change", "add-index", "--signal", "always", "--reason", "no checks", "--json");
  assert.strictEqual(always.json.error.code, "signal-not-retractable");
  const missing = ospec(root, "record", "retract", "--change", "add-index", "--signal", "security-boundary", "--reason", "never declared", "--json");
  assert.strictEqual(missing.json.error.code, "signal-not-recorded");
  const noReason = ospec(root, "record", "retract", "--change", "add-index", "--signal", "persistent-data", "--json");
  assert.strictEqual(noReason.json.error.code, "reason-required");
  assert.strictEqual(ospec(root, "record", "retract", "--change", "add-index", "--reason", "x", "--json").code, 2);

  // The diff now touches the API: check brings the signal back from the diff.
  writeFile(root, "src/api/search.js", "module.exports = {};\n");
  const checked = ospec(root, "check", "--change", "add-index", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.ok(checked.json.added.signals.includes("public-contract"));
  state = stateOf(root, "add-index");
  assert.strictEqual(state.signals.find((signal) => signal.id === "public-contract").source, "diff");
  assert.strictEqual(state.obligations.find((o) => o.id === "contract-spec-and-test").status, "pending");
  const back = ospec(root, "record", "retract", "--change", "add-index", "--signal", "public-contract", "--reason", "again", "--json");
  assert.strictEqual(back.json.error.code, "signal-confirmed-by-diff");
});

test("[REQ-decision-gap-003] foundation next does not write a missing map and record refuses", (t) => {
  const root = tempRoot(t);
  const next = ospec(root, "foundation", "next", "--profile", "prototype", "--json");
  assert.strictEqual(next.code, 0, next.stderr);
  assert.strictEqual(next.json.exists, false);
  assert.deepStrictEqual(next.json.round.map((slot) => slot.id), ["quality.drivers"]);
  assert.strictEqual(fs.existsSync(path.join(root, "docs", "architecture", "knowledge-map.yaml")), false);

  const refused = ospec(root, "foundation", "record", "--slot", "quality.drivers", "--state", "confirmed", "--source-kind", "user", "--source-ref", "author", "--json");
  assert.strictEqual(refused.code, 1);
  assert.strictEqual(refused.json.error.code, "map-missing");
  assert.strictEqual(fs.existsSync(path.join(root, "docs", "architecture", "knowledge-map.yaml")), false);

  fs.mkdirSync(path.join(root, "docs", "architecture"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "architecture", "knowledge-map.yaml"), `${JSON.stringify(next.json.template, null, 2)}\n`);
  const recorded = ospec(root, "foundation", "record", "--slot", "quality.drivers", "--state", "confirmed", "--source-kind", "user", "--source-ref", "author", "--json");
  assert.strictEqual(recorded.code, 0, recorded.stderr);
  assert.strictEqual(recorded.json.changed, true);
  assert.strictEqual(recorded.json.round.some((slot) => slot.id === "quality.drivers"), false);
});

test("record retract withdraws a declared work-unit signal, which the diff never confirms", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "split-pages", "--kind", "refactor", "--summary", "Split pages.", "--acceptance", "Two pages.", "--no-open-facts", "--basis", "The request fixes every behavior.");
  ospec(root, "signals", "--change", "split-pages", "--path", "src/pages.txt", "--work-units", "2");
  writeFile(root, "src/pages.txt", "2");
  const retracted = ospec(root, "record", "retract", "--change", "split-pages", "--signal", "multi-unit-or-decision", "--reason", "one unit after all", "--json");
  assert.strictEqual(retracted.code, 0, retracted.stderr);
  assert.strictEqual(stateOf(root, "split-pages").obligations.find((o) => o.id === "living-doc").status, "withdrawn");
  assert.strictEqual(retracted.json.next.next_step.obligation, "checks-pass");
  assert.match(ospec(root, "record", "retract", "--change", "split-pages", "--signal", "multi-unit-or-decision", "--reason", "one unit after all").stdout, /no change: retract already recorded/);
});

// ---------------------------------------------------------------------------
// E3.1: declared architecture impact (REQ-idd-020)
// ---------------------------------------------------------------------------

function adrText(id, title, { context = "Los módulos se integran. Driver: `scenario:module-integration`.", decision = "Los módulos se llaman de forma síncrona." } = {}) {
  return [
    `# ${id}. ${title}`,
    "",
    "- Status: accepted",
    "- Date: 2026-10-11",
    "- Evidence: verify.js:1",
    "",
    "## Context and drivers",
    context,
    "",
    "## Options considered",
    "1. Llamadas directas: simple.",
    "2. Eventos: desacopla.",
    "",
    "## Decision",
    decision,
    "",
    "## Consequences",
    "Un fallo de un módulo llega al otro.",
    "",
    "## Fitness function",
    "Un test de integración entre módulos.",
    "",
    "## Review trigger",
    "Un segundo consumidor del mismo hecho.",
    "",
  ].join("\n");
}

function architectureProject(t) {
  const { root, git } = project(t);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "docs/architecture/decisions/0002-integracion-sincrona.md", adrText("0002", "Los módulos se integran de forma síncrona"));
  writeFile(root, "docs/architecture/knowledge-map.yaml", JSON.stringify({ schema: "ospec-knowledge-map/v1", profile: "saas", slots: [], quality_scenarios: [{ id: "module-integration" }] }));
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "architecture");
  return { root, git };
}

const OPEN_EVENTS = ["record", "intent", "--change", "order-events", "--kind", "feature", "--summary", "Billing consumes order-placed.", "--acceptance", "Orders no longer calls billing.", ...FEATURE_COVER, "--json"];

test("signals --adr and --quality declare existing references only", (t) => {
  const { root } = architectureProject(t);
  ospec(root, ...OPEN_EVENTS);
  const unknownAdr = ospec(root, "signals", "--change", "order-events", "--path", "src/orders.js", "--adr", "0099", "--json");
  assert.strictEqual(unknownAdr.code, 1);
  assert.deepStrictEqual(unknownAdr.json.error, { code: "unknown-reference", message: "ADR 0099 is not under docs/architecture/decisions/" });
  const unknownScenario = ospec(root, "signals", "--change", "order-events", "--quality", "fast-boot", "--json");
  assert.strictEqual(unknownScenario.json.error.code, "unknown-reference");
  const badId = ospec(root, "signals", "--change", "order-events", "--adr", "integration", "--json");
  assert.strictEqual(badId.code, 2);
  assert.strictEqual(stateOf(root, "order-events").impacts, undefined, "a refused declaration records nothing");

  const declared = ospec(root, "signals", "--change", "order-events", "--path", "src/orders.js", "--adr", "ADR-0002", "--quality", "module-integration", "--json");
  assert.strictEqual(declared.code, 0, declared.stderr);
  assert.deepStrictEqual(declared.json.added.signals, ["adr-or-quality-attribute"]);
  assert.deepStrictEqual(stateOf(root, "order-events").impacts, [
    { kind: "adr", id: "0002", impact: null },
    { kind: "scenario", id: "module-integration", impact: null },
  ]);
  assert.strictEqual(declared.json.next.next_step.obligation, "adr-impact-declaration");
});

test("an amendment stops at the gate and settles once its new ADR passes the lint and cites the old one", (t) => {
  const { root } = architectureProject(t);
  ospec(root, ...OPEN_EVENTS);
  ospec(root, "signals", "--change", "order-events", "--path", "src/orders.js", "--adr", "0002");

  const usage = ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", "--quality", "module-integration", "--impact", "none", "--reason", "r", "--json");
  assert.strictEqual(usage.code, 2);

  const amended = ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", "--impact", "amends", "--reason", "billing consumes order-placed asynchronously", "--json");
  assert.strictEqual(amended.code, 0, amended.stderr);
  assert.deepStrictEqual(amended.json.next.next_step, { action: "resolve-gate", gate: "adr-amend-or-contradict" });
  assert.strictEqual(amended.json.next.pending_decision.reason, "ADR 0002 amends: billing consumes order-placed asynchronously");

  ospec(root, "record", "gate", "--change", "order-events", "--gate", "adr-amend-or-contradict", "--resolve", "--answer", "amend 0002 with events", "--source", "user");
  const withoutRecord = ospec(root, "check", "--change", "order-events", "--json");
  const missing = withoutRecord.json.missing.find((entry) => entry.obligation === "adr-impact-declaration");
  assert.match(missing.reason, /write the new ADR under docs\/architecture\/decisions\/ and attach it/);

  const record = "docs/architecture/decisions/0003-eventos-entre-modulos.md";
  writeFile(root, record, adrText("0003", "Los módulos se integran por eventos", { decision: "Los módulos publican hechos y se suscriben a ellos; enmienda 0002." }));
  const attached = ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", "--record", record, "--json");
  assert.strictEqual(attached.code, 0, attached.stderr);

  const settled = ospec(root, "check", "--change", "order-events", "--json");
  assert.strictEqual(settled.code, 0, settled.stderr);
  assert.ok(!settled.json.missing.some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(settled.json.missing));
  const state = stateOf(root, "order-events");
  assert.strictEqual(state.obligations.find((entry) => entry.id === "adr-impact-declaration").status, "satisfied");
  assert.deepStrictEqual(state.evidence.find((entry) => entry.kind === "adr-impact-declaration").detail, { refs: ["adr:0002 amends"], records: [record] });

  // A new ADR that no longer passes the lint reopens the declaration.
  writeFile(root, record, "# 0003. Los módulos se integran por eventos\n\nEnmienda 0002.\n");
  const broken = ospec(root, "check", "--change", "order-events", "--json");
  assert.match(broken.json.missing.find((entry) => entry.obligation === "adr-impact-declaration").reason, /fails the decision-record lint/);
});

test("next suggests an ADR for a boundary without a declared one, without blocking", (t) => {
  const { root } = architectureProject(t);
  ospec(root, ...OPEN_EVENTS);
  const planned = ospec(root, "signals", "--change", "order-events", "--path", "src/api/orders.js");
  assert.strictEqual(planned.code, 0, planned.stderr);
  assert.match(planned.stdout, /suggestion adr-promotion: public contract: touches src\/api\/orders\.js/);
  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.deepStrictEqual(next.json.suggestions.map((entry) => entry.id), ["adr-promotion"]);
  assert.strictEqual(next.json.next_step.obligation, "contract-spec-and-test");
});

// ---------------------------------------------------------------------------
// E3.2: knowledge by reference from the component map (REQ-idd-021)
// ---------------------------------------------------------------------------

function knowledgeProject(t, { map } = {}) {
  const { root, git } = architectureProject(t);
  writeFile(root, "docs/architecture/decisions/0003-cobro.md", adrText("0003", "El cobro es síncrono"));
  writeFile(root, "docs/architecture/decisions/0004-antigua.md", adrText("0004", "Antigua").replace("- Status: accepted", "- Status: superseded by 0002"));
  const component = (id, extra) => ({ id, summary: `${id} component`, evidence: ["verify.js:1"], ...extra });
  const componentMap = map ?? {
    schema: "ospec-component-map/v2",
    components: [
      component("orders", { paths: ["src/orders/**"], knowledge: { adrs: ["0002", "0004"], scenarios: ["module-integration"], terms: ["Order"] } }),
      component("billing", { paths: ["src/billing/**"], knowledge: { adrs: ["0003"] } }),
      component("legacy", { paths: ["src/legacy/**"], knowledge: { adrs: ["0009"] } }),
    ],
    boundaries: [],
    dependencies: [],
    divergences: [],
  };
  writeFile(root, "docs/architecture/component-map.yaml", typeof componentMap === "string" ? componentMap : JSON.stringify(componentMap));
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "component map");
  return { root, git };
}

test("[REQ-idd-021] the touched component derives the ADR signal from its current references and next shows each one's currency", (t) => {
  const { root } = knowledgeProject(t);
  ospec(root, ...OPEN_EVENTS);
  const planned = ospec(root, "signals", "--change", "order-events", "--path", "src/orders/place.js", "--json");
  assert.strictEqual(planned.code, 0, planned.stderr);
  assert.deepStrictEqual(planned.json.signals.find((entry) => entry.id === "adr-or-quality-attribute"), {
    id: "adr-or-quality-attribute",
    reason: "component orders: ADR 0002 and quality scenario module-integration",
    source: "declaration",
  });
  assert.deepStrictEqual(stateOf(root, "order-events").impacts, [
    { kind: "adr", id: "0002", impact: null },
    { kind: "scenario", id: "module-integration", impact: null },
  ]);

  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.strictEqual(next.code, 0, next.stderr);
  assert.deepStrictEqual(
    next.json.references.map((ref) => `${ref.kind}:${ref.id}:${ref.status}`),
    ["adr:0002:current", "adr:0004:stale", "scenario:module-integration:current", "term:Order:absent"],
  );
  assert.deepStrictEqual(next.json.references[0].components, ["orders"]);
  assert.strictEqual(next.json.references[0].path, "docs/architecture/decisions/0002-integracion-sincrona.md");
  assert.deepStrictEqual(next.json.warnings, [
    "stale ADR 0004 (orders): ADR 0004 is superseded",
    "absent term Order (orders): docs/product/glossary.md does not exist",
  ]);
  assert.deepStrictEqual(next.json.knowledge_refs, []);
  assert.strictEqual(next.json.next_step.obligation, "adr-impact-declaration");

  const human = ospec(root, "next", "--change", "order-events");
  assert.match(human.stdout, /ref adr 0002 current \(orders\): docs\/architecture\/decisions\/0002-integracion-sincrona\.md/);
  assert.match(human.stdout, /warning: stale ADR 0004 \(orders\): ADR 0004 is superseded/);
});

test("[REQ-idd-021] check derives the references of the components the diff touches", (t) => {
  const { root } = knowledgeProject(t);
  ospec(root, ...OPEN_EVENTS);
  ospec(root, "signals", "--change", "order-events", "--path", "src/orders/place.js");
  writeFile(root, "src/billing/charge.js", "module.exports = {};\n");
  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.deepStrictEqual(stateOf(root, "order-events").impacts.map((entry) => `${entry.kind}:${entry.id}`), ["adr:0002", "scenario:module-integration", "adr:0003"]);
  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.deepStrictEqual(next.json.references.filter((ref) => ref.kind === "adr").map((ref) => ref.id), ["0002", "0003", "0004"]);
  assert.ok(!next.json.references.some((ref) => ref.id === "0009"), "an untouched component gives no reference");
});

test("[REQ-idd-021] a broken component map warns and gives no references, and no map gives no warning", (t) => {
  const { root } = knowledgeProject(t, { map: "components: []\n" });
  ospec(root, ...OPEN_EVENTS);
  const planned = ospec(root, "signals", "--change", "order-events", "--path", "src/orders/place.js", "--json");
  assert.strictEqual(planned.code, 0, planned.stderr);
  assert.ok(!planned.json.signals.some((entry) => entry.id === "adr-or-quality-attribute"));
  assert.match(planned.json.warnings[0], /component-map\.yaml is not JSON text/);
  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.strictEqual(next.code, 0, next.stderr);
  assert.deepStrictEqual(next.json.references, []);
  assert.match(next.json.warnings[0], /component-map\.yaml is not JSON text/);
  const checked = ospec(root, "check", "--change", "order-events");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.match(checked.stdout, /warning: docs\/architecture\/component-map\.yaml is not JSON text/);

  fs.rmSync(path.join(root, "docs/architecture/component-map.yaml"));
  const bare = ospec(root, "next", "--change", "order-events", "--json");
  assert.deepStrictEqual([bare.json.references, bare.json.warnings], [[], []]);
});

// ---------------------------------------------------------------------------
// E3.3: fitness functions in check (REQ-idd-022)
// ---------------------------------------------------------------------------

const BOUNDARY = [
  "const fs = require('fs');",
  "if (fs.readFileSync('src/core.js', 'utf8').includes('./adapter')) { console.error('core imports the adapter'); process.exit(1); }",
].join("\n");

function fitnessProject(t) {
  const { root, git } = architectureProject(t);
  writeFile(root, "boundary.js", `${BOUNDARY}\n`);
  writeFile(root, "src/core.js", "module.exports = 1;\n");
  writeFile(root, "src/pages.txt", "2");
  const boundaryAdr = adrText("0006", "El núcleo no conoce los adaptadores").replace(
    "Un test de integración entre módulos.",
    "El núcleo no importa ningún adaptador.\n- Check: `node boundary.js`",
  );
  writeFile(root, "docs/architecture/decisions/0006-nucleo-sin-adaptadores.md", boundaryAdr);
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "boundary ADR");
  ospec(root, ...OPEN_EVENTS);
  ospec(root, "signals", "--change", "order-events", "--path", "src/core.js", "--adr", "0006", "--adr", "0002");
  ospec(root, "record", "impact", "--change", "order-events", "--adr", "0006", "--impact", "conforms", "--reason", "core stays pure");
  ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", "--impact", "conforms", "--reason", "keeps sync calls");
  return { root, git, boundaryAdr };
}

test("[REQ-idd-022] a boundary violation declared in an ADR blocks the close and names the ADR", (t) => {
  const { root } = fitnessProject(t);
  writeFile(root, "src/core.js", "module.exports = require('./adapter');\n");

  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  const missing = checked.json.missing.find((entry) => entry.obligation === "adr-impact-declaration");
  assert.strictEqual(missing.reason, "ADR 0006: fitness check `node boundary.js` failed with exit code 1");
  assert.deepStrictEqual(
    checked.json.fitness.checks.map(({ kind, id, command, exit_code }) => ({ kind, id, command, exit_code })),
    [{ kind: "adr", id: "0006", command: "node boundary.js", exit_code: 1 }],
  );
  const run = stateOf(root, "order-events").runs.find((entry) => entry.purpose === "fitness");
  assert.deepStrictEqual([run.ref, run.command, run.exit_code], ["adr:0006", "node boundary.js", 1]);

  const text = ospec(root, "check", "--change", "order-events");
  assert.match(text.stdout, /missing adr-impact-declaration: ADR 0006: fitness check `node boundary.js` failed with exit code 1/);
  assert.match(text.stdout, /core imports the adapter/);

  const close = ospec(root, "close", "--change", "order-events", "--json");
  assert.strictEqual(close.code, 1);
  assert.match(JSON.stringify(close.json.error), /adr-impact-declaration/);

  writeFile(root, "src/core.js", "module.exports = 2;\n");
  const fixed = ospec(root, "check", "--change", "order-events", "--json");
  assert.ok(!fixed.json.missing.some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(fixed.json.missing));
  const state = stateOf(root, "order-events");
  const evidence = state.evidence.find((entry) => entry.id === state.obligations.find((entry) => entry.id === "adr-impact-declaration").evidence[0]);
  assert.strictEqual(evidence.detail.fitness.length, 1);
});

test("[REQ-idd-022] the change cannot weaken the check its base declares", (t) => {
  const { root, boundaryAdr } = fitnessProject(t);
  writeFile(root, "src/core.js", "module.exports = require('./adapter');\n");
  writeFile(root, "docs/architecture/decisions/0006-nucleo-sin-adaptadores.md", boundaryAdr.replace("\n- Check: `node boundary.js`", ""));
  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.match(checked.json.missing.find((entry) => entry.obligation === "adr-impact-declaration").reason, /^ADR 0006: fitness check `node boundary.js` failed/);
});

test("[REQ-idd-022] a prose fitness function is a checklist item that keeps its evidence and never blocks", (t) => {
  const { root } = fitnessProject(t);
  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.deepStrictEqual(next.json.fitness.manual, [
    { kind: "adr", id: "0002", path: "docs/architecture/decisions/0002-integracion-sincrona.md", fitness: "Un test de integración entre módulos.", evidence: null },
  ]);
  assert.deepStrictEqual(next.json.fitness.checks.map((check) => check.command), ["node boundary.js"]);
  assert.match(ospec(root, "next", "--change", "order-events").stdout, /manual fitness ADR 0002: Un test de integración entre módulos\. \(no evidence recorded/);

  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.ok(!checked.json.missing.some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(checked.json.missing));

  const refused = ospec(root, "record", "fitness", "--change", "order-events", "--adr", "0006", "--evidence", "ran it", "--json");
  assert.strictEqual(refused.json.error.code, "not-manual-fitness");
  assert.strictEqual(ospec(root, "record", "fitness", "--change", "order-events", "--adr", "0002", "--json").code, 2);

  const recorded = ospec(root, "record", "fitness", "--change", "order-events", "--adr", "0002", "--evidence", "verify.js:1 covers the integration", "--json");
  assert.strictEqual(recorded.code, 0, recorded.stderr);
  assert.deepStrictEqual(stateOf(root, "order-events").attestations.map(({ kind, id, evidence }) => ({ kind, id, evidence })), [
    { kind: "adr", id: "0002", evidence: "verify.js:1 covers the integration" },
  ]);
  assert.strictEqual(ospec(root, "next", "--change", "order-events", "--json").json.fitness.manual[0].evidence, "verify.js:1 covers the integration");
});

test("[REQ-idd-023] two projects with different teams get different defaults without a question", (t) => {
  const small = tempRoot(t);
  const multi = tempRoot(t);
  fs.mkdirSync(path.join(small, "idd"));
  fs.mkdirSync(path.join(multi, "idd"));
  fs.writeFileSync(path.join(small, "idd", "config.yaml"), "team:\n  size: solo\n  experience: senior\n");
  fs.writeFileSync(path.join(multi, "idd", "config.yaml"), "team:\n  size: multi-team\n  experience: junior\n");
  const one = ospec(small, "team", "--json").json;
  const other = ospec(multi, "team", "--json").json;
  assert.deepStrictEqual([one.mode, one.source, one.defaults.delivery_strategy, one.defaults.strict_tdd, one.defaults.mentorship], ["idd", "idd/config.yaml", "single-pr", false, "expert"]);
  assert.deepStrictEqual([other.defaults.delivery_strategy, other.defaults.strict_tdd, other.defaults.mentorship], ["auto-chain", true, "mentor"]);
  assert.notDeepStrictEqual(one.defaults.review, other.defaults.review);

  // next hands the profile to every IDD change, and strict_tdd follows it.
  for (const root of [small, multi]) {
    ospec(root, "record", "intent", "--change", "fix-pagination", "--kind", "feature", "--summary", "Fix the last page.", "--acceptance", "Two full pages.", ...FEATURE_COVER, "--json");
  }
  ospec(small, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  ospec(multi, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  const nextSmall = ospec(small, "next", "--change", "fix-pagination", "--json").json;
  const nextMulti = ospec(multi, "next", "--change", "fix-pagination", "--json").json;
  assert.deepStrictEqual(nextSmall.team, { size: "solo", experience: "senior", source: "idd/config.yaml", delivery_strategy: "single-pr", mentorship: "expert" });
  assert.strictEqual(nextMulti.team.delivery_strategy, "auto-chain");
  assert.ok(!nextSmall.pending_obligations.some((o) => o.id === "tdd-red-green"));
  assert.ok(nextMulti.pending_obligations.some((o) => o.id === "tdd-red-green"));
  assert.strictEqual(nextSmall.pending_decision, null);
  assert.match(ospec(small, "next", "--change", "fix-pagination").stdout, /team: solo; delivery single-pr; mentorship expert/);
});

test("[REQ-idd-023] team follows the active mode and refuses an invalid profile", (t) => {
  const root = tempRoot(t);
  const none = ospec(root, "team", "--json");
  assert.deepStrictEqual(none.json, { ok: true, command: "team", mode: "sdd", profile: null, source: null, defaults: null });
  assert.match(ospec(root, "team").stdout, /no profile declared; defaults unchanged/);
  fs.mkdirSync(path.join(root, "openspec"));
  fs.writeFileSync(path.join(root, "openspec", "config.yaml"), "schema: spec-driven\nscale: team\n");
  assert.deepStrictEqual(ospec(root, "team", "--json").json.profile, { size: "small", experience: null });
  fs.mkdirSync(path.join(root, "idd"));
  fs.writeFileSync(path.join(root, "idd", "config.yaml"), "checks:\n  test: npm test\n");
  assert.deepStrictEqual(ospec(root, "team", "--json").json.profile, null);
  // SDD reads its own declaration even while IDD is the active mode.
  const sdd = ospec(root, "team", "--mode", "sdd", "--json").json;
  assert.deepStrictEqual([sdd.mode, sdd.source, sdd.profile.size], ["sdd", "openspec/config.yaml scale", "small"]);
  assert.strictEqual(ospec(root, "team", "--mode", "both", "--json").code, 2);
  fs.writeFileSync(path.join(root, "idd", "config.yaml"), "team:\n  size: everyone\n");
  assert.strictEqual(ospec(root, "team", "--mode", "sdd", "--json").json.ok, true);
  const refused = ospec(root, "team", "--json");
  assert.strictEqual(refused.code, 1);
  assert.strictEqual(refused.json.error.code, "config-invalid");
  fs.writeFileSync(path.join(root, "idd", "config.yaml"), "mode: sdd\n");
  fs.writeFileSync(path.join(root, "openspec", "config.yaml"), "team:\n  size: everyone\n");
  assert.strictEqual(ospec(root, "team", "--json").json.error.code, "team-invalid");
});
