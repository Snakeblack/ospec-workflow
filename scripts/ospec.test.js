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

// A gate step: its action and gate; the literal command it carries (E1.45) is
// pinned in scripts/lib/idd-next.test.js.
function assertGateStep(step, gate) {
  assert.deepStrictEqual({ action: step.action, gate: step.gate }, { action: "resolve-gate", gate });
  assert.match(step.command, /^ospec record /);
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

// A feature asks at least one category (#390); the user's answer resolves
// open-facts in openFeature.
const FEATURE_COVER = [
  "--request",
  "The request fixes every behavior.",
  "--open-fact",
  "inputs:Is a page size above 100 refused?",
  ...[
    "uniqueness=request fixes every",
    "persistence=fixes every behavior",
    "copy=every behavior.",
    "url-state=The request fixes every",
    "accessibility=request fixes every behavior",
    "errors=quest fixes every",
  ].flatMap((quote) => ["--quote", quote]),
];

function openFeature(root, ...intent) {
  const opened = ospec(root, ...intent);
  const change = intent[intent.indexOf("--change") + 1];
  ospec(root, "record", "gate", "--change", change, "--gate", "open-facts", "--resolve", "--answer", "Yes, above 100 is refused.", "--source", "user");
  return opened;
}

test("the usage names the feature categories and the one-question rule (#400)", (t) => {
  const root = tempRoot(t);
  const help = ospec(root, "--help");
  assert.strictEqual(help.code, 0);
  assert.match(help.stdout, /categories: inputs, uniqueness, persistence, copy, url-state, accessibility, errors/);
  assert.match(help.stdout, /at least one is an --open-fact/);
  const bare = ospec(root, "record", "intent");
  assert.strictEqual(bare.code, 2);
  assert.match(bare.stderr, /at least one is an --open-fact/);
});

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
    how: "ospec signals --change fix-pagination [--path <file>]... [--work-units <n>] [--decision \"<text>\"]... [--operation <op>]",
    command: "ospec signals --change fix-pagination [--path <file>]...",
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

  const resolve = ["record", "gate", "--change", "fix-pagination", "--gate", "irreversible-operation", "--resolve", "--answer", "approve"];
  const unknownSource = ospec(root, ...resolve, "--source", "AskUserQuestion", "--json");
  assert.strictEqual(unknownSource.code, 1);
  assert.strictEqual(unknownSource.json.error.code, "invalid-source");

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
    "user",
    "--json",
  );
  assert.strictEqual(resolved.code, 0, resolved.stderr);
  assert.strictEqual(resolved.json.next.pending_decision, undefined);
});

test("record intent needs the open-facts declaration, and open facts are asked first", (t) => {
  const root = tempRoot(t);
  const base = ["record", "intent", "--change", "discount-codes", "--kind", "bug", "--summary", "Discount codes.", "--acceptance", "VERANO10 takes 10%."];
  const undeclared = ospec(root, ...base, "--json");
  assert.strictEqual(undeclared.code, 1);
  assert.strictEqual(undeclared.json.error.code, "facts-undeclared");

  const opened = ospec(root, ...base, "--open-fact", "Is an unknown code an error?", "--open-fact", "Does case matter?", "--json");
  assert.strictEqual(opened.code, 0, opened.stderr);
  assertGateStep(opened.json.next.next_step, "open-facts");
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
  assertGateStep(next.json.next_step, "ambiguous-intent");

  const blocked = ospec(root, "record", "signal", "--change", "improve-login", "--signal", "bug-fix", "--reason", "r", "--json");
  assert.strictEqual(blocked.code, 1);
  assert.strictEqual(blocked.json.error.code, "ambiguous-intent-open");
});

test("next and status are stable across runs and readable without --json", (t) => {
  const root = tempRoot(t);
  assert.strictEqual(ospec(root, "next", "--json").json.next_step.action, "open-change");
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

// E1.45 (B5): a usage error prints the lines of its subcommand, not the whole
// usage, and --json carries them as the error's how.
test("a usage error prints only the usage lines of its subcommand", (t) => {
  const root = tempRoot(t);
  const run = ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test");
  assert.strictEqual(run.code, 2);
  assert.strictEqual(
    run.stderr,
    "ospec: run needs --command <cmd> (usage)\n" +
      "  ospec run --change <id> --obligation <repro-test|tdd-red-green|migration-compat-and-test> --command <cmd>\n" +
      "            [--unit <name>] [--plan <compatibility or rollback plan>]\n" +
      "            a --command equal to the only declared check also counts as that check\n",
  );

  const unknown = ospec(root, "frobnicate");
  assert.strictEqual(unknown.code, 2);
  assert.strictEqual(
    unknown.stderr,
    "ospec: unknown command: frobnicate (usage)\ncommands: status, next, record, signals, check, run, review, close, doctor, team, snapshot, foundation\n",
  );

  const intent = ospec(root, "record", "intent", "--json");
  assert.strictEqual(intent.code, 2);
  assert.strictEqual(intent.json.error.code, "usage");
  assert.match(intent.json.error.how, /^ {2}ospec record intent --change <id> --kind <bug\|feature\|refactor\|docs>/);
  assert.match(intent.json.error.how, /at least one is an --open-fact/);
  assert.match(intent.json.error.how, /\[<plan>\]: \[--path <file>\]\.\.\. \[--work-units <n>\]/, "record intent declares the plan too (E4.15)");
  assert.doesNotMatch(intent.json.error.how, /ospec record gate|ospec status|Options:/);

  const type = ospec(root, "record", "evidence", "--json");
  assert.match(type.json.error.how, /ospec record gate/);
  assert.doesNotMatch(type.json.error.how, /ospec status/);

  const option = ospec(root, "next", "--bogus", "--json");
  assert.strictEqual(option.code, 2);
  assert.strictEqual(option.json.error.how, "  ospec next [--change <id>] [--json]");
});

// A word no subcommand takes, or a single-value flag given twice, is an
// argument the CLI would drop: `--path a b` kept only `a`. It refuses the
// call and writes nothing.
test("a stray word or a repeated single-value flag is a usage error that writes nothing", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  const state = path.join(root, "idd", "fix-pagination", "state.yaml");
  const before = fs.readFileSync(state, "utf8");

  const stray = ospec(root, "signals", "--change", "fix-pagination", "--path", "src/a.js", "src/b.js", "--json");
  assert.strictEqual(stray.code, 2);
  assert.strictEqual(stray.json.error.code, "usage");
  assert.match(stray.json.error.message, /src\/b\.js/);
  assert.match(stray.json.error.how, /^ {2}ospec signals --change <id> \[--path <file>\]\.\.\./);

  const repeated = ospec(root, "signals", "--change", "fix-pagination", "--work-units", "2", "--work-units", "3", "--json");
  assert.strictEqual(repeated.code, 2);
  assert.match(repeated.json.error.message, /--work-units/);

  const unquoted = ospec(root, "record", "assumption", "--change", "fix-pagination", "--text", "the", "last", "page");
  assert.strictEqual(unquoted.code, 2);
  assert.match(unquoted.stderr, /"last"/);
  assert.match(unquoted.stderr, /ospec record assumption --change <id> --text <text>/);

  assert.strictEqual(ospec(root, "status", "fix-pagination").code, 2);
  assert.strictEqual(ospec(root, "review", "start", "now", "--change", "fix-pagination").code, 2);
  assert.strictEqual(fs.readFileSync(state, "utf8"), before);

  // A subcommand keeps its word, a repeated boolean drops nothing, and a
  // repeatable flag takes one value per occurrence.
  assert.strictEqual(ospec(root, "next", "--change", "fix-pagination", "--json", "--json").code, 0);
  const paths = ospec(root, "signals", "--change", "fix-pagination", "--path", "src/a.js", "--path", "src/b.js", "--json");
  assert.strictEqual(paths.code, 0);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(state, "utf8")).plan.paths, ["src/a.js", "src/b.js"]);
});

// E1.45 (B5): a refusal that names no way out of its own takes the one its
// code has (scripts/lib/idd-refusals.js), in JSON and in text.
test("a refusal without its own how carries the one of its code", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  const json = ospec(root, "record", "gate", "--change", "fix-pagination", "--gate", "bogus", "--open", "--json");
  assert.strictEqual(json.code, 1);
  assert.strictEqual(json.json.error.code, "unknown-gate");
  assert.match(json.json.error.how, /ambiguous-intent, open-facts, adr-amend-or-contradict, irreversible-operation, review-limit, checks-changed/);

  const text = ospec(root, "record", "withdraw", "--change", "fix-pagination", "--obligation", "nope", "--reason", "r");
  assert.strictEqual(text.code, 1);
  assert.match(text.stderr, /^ospec: change fix-pagination has no obligation nope \(unknown-obligation\)\n.*ospec next --change fix-pagination --json/);
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
  // E4.16: one status line; the reasons stay in --json.
  assert.match(text.stdout, /^plan of fix-pagination: the plan and every derived signal were already recorded; floor [a-z]+\nnext \(repro-test\): ospec run /);

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
  assertGateStep(opened.json.next.next_step, "adr-amend-or-contradict");

  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  const next = ospec(root, "next", "--change", "fix-pagination", "--json");
  assertGateStep(next.json.next_step, "adr-amend-or-contradict");
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
  assert.strictEqual(passing.json.missing, undefined);
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

// B2 of the 2026-10-25 audit: a state.yaml edited by hand closed although the
// CLI refuses the same withdrawal; close revalidates it and check reopens it.
test("close refuses a hand-edited state that withdraws an obligation a signal still derives, and check reopens it", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  const edited = stateOf(root, "fix-readme");
  Object.assign(edited.obligations.find((entry) => entry.id === "checks-pass"), { status: "withdrawn", withdrawn_reason: "not needed" });
  writeFile(root, "idd/fix-readme/state.yaml", `${JSON.stringify(edited, null, 2)}\n`);

  const refused = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(refused.code, 1, refused.stdout);
  assert.strictEqual(refused.json.error.code, "close-refused");
  assert.match(refused.json.error.message, /checks-pass is withdrawn while signal always derives it/);
  assert.match(refused.json.error.how, /ospec check --change fix-readme/);
  assert.strictEqual(stateOf(root, "fix-readme").status, "open");

  const reopened = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.deepStrictEqual(reopened.json.missing.map((entry) => entry.obligation), ["checks-pass"]);
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").code, 0);
});

test("close derives the signals again and refuses a signal removed by hand with its obligation (B2)", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  const edited = stateOf(root, "fix-readme");
  edited.signals = edited.signals.filter((signal) => signal.id !== "always");
  edited.obligations = edited.obligations.filter((entry) => entry.id !== "checks-pass");
  writeFile(root, "idd/fix-readme/state.yaml", `${JSON.stringify(edited, null, 2)}\n`);

  const refused = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(refused.code, 1, refused.stdout);
  assert.strictEqual(refused.json.error.code, "close-refused");
  assert.match(refused.json.error.message, /the diff derives signal always, which the state lacks/);
  assert.match(refused.json.error.how, /ospec check --change fix-readme/);

  writeFile(root, "src/pages.txt", "2");
  const checked = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.deepStrictEqual(checked.json.added.signals, ["always"]);
  assert.strictEqual(checked.json.verdict, "ready");
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").code, 0);
});

test("close resumes a change ospec closed, and refuses one marked closed by hand or with a forged close time (B2)", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  const file = "idd/fix-readme/state.yaml";
  const forged = { ...stateOf(root, "fix-readme"), status: "closed", closed_at: "2026-10-26T10:00:00.000Z" };
  writeFile(root, file, `${JSON.stringify(forged, null, 2)}\n`);
  const refused = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(refused.code, 1, refused.stdout);
  assert.strictEqual(refused.json.error.code, "close-refused");
  assert.match(refused.json.error.message, /fix-readme is marked closed with checks-pass/);
  assert.ok(fs.existsSync(path.join(root, file)) && !fs.existsSync(path.join(root, "idd", "archive", "2026-10-26-fix-readme")));

  writeFile(root, file, `${JSON.stringify({ ...forged, closed_at: "../../../x" }, null, 2)}\n`);
  const escaped = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(escaped.code, 1, escaped.stdout);
  assert.strictEqual(escaped.json.error.code, "state-invalid");
  assert.match(escaped.json.error.message, /closed_at is the close time of a closed change, as an ISO 8601 UTC timestamp/);
  assert.ok(fs.existsSync(path.join(root, file)));

  writeFile(root, file, `${JSON.stringify({ ...forged, status: "open", closed_at: undefined }, null, 2)}\n`);
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  const settled = { ...stateOf(root, "fix-readme"), status: "closed", closed_at: "2026-10-26T10:00:00.000Z" };
  writeFile(root, file, `${JSON.stringify(settled, null, 2)}\n`);
  const resumed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(resumed.code, 0, resumed.stdout);
  assert.strictEqual(resumed.json.archive.destination, "idd/archive/2026-10-26-fix-readme");
});

// A preload rewrites state.yaml at the first git diff of close, after close
// read the state it validates and before it marks the change closed.
const TAMPER_PRELOAD = `
const cp = require("node:child_process");
const fs = require("node:fs");
const run = cp.execFileSync;
let done = false;
cp.execFileSync = function (file, args, ...rest) {
  const output = run.call(this, file, args, ...rest);
  if (!done && file === "git" && args.includes("diff")) {
    done = true;
    fs.writeFileSync(process.env.OSPEC_TEST_STATE, process.env.OSPEC_TEST_TAMPERED);
  }
  return output;
};
`;

test("close refuses a state.yaml rewritten while it validates, before the changelog (B2)", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node verify.js\ndelivery:\n  changelog: CHANGELOG.md\n" });
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  const file = path.join(root, "idd", "fix-readme", "state.yaml");
  const tampered = stateOf(root, "fix-readme");
  tampered.assumptions = ["written by hand"];
  const preload = path.join(root, "..", `${path.basename(root)}-tamper.js`);
  fs.writeFileSync(preload, TAMPER_PRELOAD);
  t.after(() => fs.rmSync(preload, { force: true }));

  const env = { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(preload)}`, OSPEC_TEST_STATE: file, OSPEC_TEST_TAMPERED: `${JSON.stringify(tampered, null, 2)}\n` };
  const refused = ospecWith(env, root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(refused.code, 1, refused.stdout);
  assert.strictEqual(refused.json.error.code, "state-changed");
  assert.strictEqual(stateOf(root, "fix-readme").status, "open");
  assert.ok(!fs.existsSync(path.join(root, "CHANGELOG.md")), "a refused close leaves the changelog as it was");
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").code, 0);
});

test("close never archives outside idd/archive from an archived state with a forged close time (B2)", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  const closed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").json.archive.already_complete, true);

  const archived = path.join(root, ...closed.json.archive.destination.split("/"), "state.yaml");
  const state = JSON.parse(fs.readFileSync(archived, "utf8"));
  fs.writeFileSync(archived, `${JSON.stringify({ ...state, closed_at: "../../../x" }, null, 2)}\n`);
  fs.mkdirSync(path.join(root, "idd", "fix-readme"));
  const escaped = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(escaped.code, 1, escaped.stdout);
  assert.strictEqual(escaped.json.error.code, "state-invalid");
  assert.ok(fs.existsSync(path.join(root, "idd", "fix-readme")), "nothing moved");
  assert.ok(!fs.existsSync(path.join(root, "..", "x-fix-readme")), "nothing left the repository");
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
  // The base declares no checks, so the approval is recorded in checks-changed (E1.44).
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.decision?.gate, "checks-changed");
  ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, npm test.", "--source", "user");
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
  assert.strictEqual(next.json.next_step.candidate_command, undefined);
  assert.match(next.json.next_step.how, /ask.*command/i);
  assert.strictEqual(fs.readFileSync(path.join(root, "idd", "config.yaml"), "utf8"), before);
});

test("check recomputes the signals from the diff: touching a migration adds its obligation", (t) => {
  const { root } = project(t);
  openFeature(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name);\n");

  const result = ospec(root, "check", "--change", "add-index", "--json");
  assert.strictEqual(result.code, 0, result.stderr);
  assert.deepStrictEqual(result.json.added, { signals: ["persistent-data"] });
  assert.strictEqual(result.json.verdict, "missing");
  assert.deepStrictEqual(result.json.missing.map((entry) => entry.obligation), ["migration-compat-and-test"]);
  const signal = stateOf(root, "add-index").signals.find((entry) => entry.id === "persistent-data");
  assert.strictEqual(signal.source, "diff");
});

test("run records a red then green pair of the same command as the reproduction evidence", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination");
  // Another command than the check `node verify.js`, which a run also counts as (E4.15).
  const run = () =>
    ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node ./verify.js", "--json");

  const red = run();
  assert.strictEqual(red.code, 0, red.stderr);
  assert.strictEqual(red.json.run.exit_code, 1);
  assert.strictEqual(red.json.evidence, undefined);
  assert.match(red.json.missing.find((entry) => entry.obligation === "repro-test").reason, /run the same command again after the fix/);

  const stillRed = run();
  assert.strictEqual(stillRed.json.evidence, undefined, "the same tree proves nothing");

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
  // Every file is in the diff of an empty base, so a docs change holds no
  // product code (E1.44): the check runs inline.
  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 0\n");
  writeFile(root, "README.md", "# Pages\n");
  const intent = ospec(root, ...OPEN_DOCS, "--json");
  assert.strictEqual(intent.code, 0, intent.stderr);
  assert.strictEqual(stateOf(root, "fix-readme").base, null, "no commit to start from");
  assert.strictEqual(ospec(root, "next", "--change", "fix-readme", "--json").code, 0);

  const first = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(first.json.decision?.gate, "checks-changed", "the first checks need the user's answer (E1.44)");
  ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, node -e 0.", "--source", "user");
  const check = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(check.code, 0, check.stderr);
  assert.strictEqual(check.json.verdict, "ready", JSON.stringify(check.json.missing));
  const close = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(close.code, 0, close.stdout);
});

// E1.4 (b1): contract and migration evidence (REQ-idd-015).

test("check satisfies the contract obligation once the diff touches a contract document and a test", (t) => {
  const { root } = project(t);
  openFeature(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");

  const codeOnly = ospec(root, "check", "--change", "page-size", "--json");
  assert.deepStrictEqual(codeOnly.json.added.signals, ["untested-product", "public-contract"]);
  const reason = (result) => result.json.missing.find((entry) => entry.obligation === "contract-spec-and-test")?.reason;
  assert.match(reason(codeOnly), /touches no contract document/);

  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\n");
  assert.match(reason(ospec(root, "check", "--change", "page-size", "--json")), /touches no test of the contract/);

  writeFile(root, "src/api/orders.test.js", "require('node:assert').strictEqual(50, 50);\n");
  const settled = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(settled.json.verdict, "ready", JSON.stringify(settled.json.missing));
  const evidence = stateOf(root, "page-size").evidence.find((entry) => entry.kind === "contract-spec-and-test");
  assert.deepStrictEqual(evidence.detail.documents, ["api/openapi.yaml"]);
  assert.deepStrictEqual(evidence.detail.tests, ["src/api/orders.test.js"]);
});

test("the project declares where its contract documents live", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node verify.js\ncontracts:\n  documents:\n    - specs/**\n" });
  openFeature(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");
  writeFile(root, "specs/orders.md", "size up to 50\n");
  writeFile(root, "test/orders.js", "require('node:assert').strictEqual(50, 50);\n");
  assert.strictEqual(ospec(root, "check", "--change", "page-size", "--json").json.verdict, "ready");
});

test("a passing migration test with its plan satisfies the migration obligation until the tree changes", (t) => {
  const { root } = project(t);
  openFeature(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name);\n");
  ospec(root, "check", "--change", "add-index");

  const args = ["run", "--change", "add-index", "--obligation", "migration-compat-and-test", "--command", "node verify.js"];
  assert.strictEqual(ospec(root, ...args, "--json").code, 2, "a migration run needs its plan");
  const plan = "additive index; rollback drops it";
  const passed = ospec(root, ...args, "--plan", plan, "--json");
  assert.strictEqual(passed.code, 0, passed.stderr);
  assert.ok(passed.json.evidence);
  assert.strictEqual(stateOf(root, "add-index").runs.find((run) => run.id === passed.json.run.id).purpose, "migration-test");
  assert.strictEqual(passed.json.check.name, "test", "the command of the only check counts as that check too (E4.15)");
  assert.strictEqual(ospec(root, "check", "--change", "add-index", "--json").json.verdict, "ready");

  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name, id);\n");
  const moved = ospec(root, "check", "--change", "add-index", "--json");
  assert.deepStrictEqual(moved.json.missing.map((entry) => entry.obligation), ["migration-compat-and-test"]);
  assert.match(moved.json.missing[0].reason, /no passing migration test on the current tree/);
});

// E1.4 (b2): the trust review on the bounded review lineage (REQ-idd-016).

function openRotation(t) {
  const { root } = project(t);
  openFeature(root, "record", "intent", "--change", "rotate-tokens", "--kind", "feature", "--summary", "Rotate tokens.", "--acceptance", "Old tokens expire.", ...FEATURE_COVER);
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
  assertGateStep(ospec(root, "next", "--change", "rotate-tokens", "--json").json.next_step, "review-limit");
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
  assert.strictEqual(ospec(root, "status", "--json").json.changes, undefined);

  const again = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(again.code, 0, again.stderr);
  assert.strictEqual(again.json.archive.already_complete, true);
  assert.match(ospec(root, "close", "--change", "fix-readme").stdout, /already archived in idd\/archive\//);
});

// E3.5 knowledge records (REQ-idd-024): close derives them from the archive.
test("close returns the decisions of the archived change as knowledge records", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  const decision = ["--decision", "**Hourly rotation:** tokens rotate every hour."];
  assert.strictEqual(ospec(root, "signals", "--change", "fix-readme", "--path", "docs/security/token-rotation.md", ...decision).code, 0);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "docs/security/token-rotation.md", "Rotate tokens hourly.\n");
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
  // E1.47 (B8): the text names each record's topic, since agents read text.
  const human = ospec(root, "close", "--change", "fix-readme").stdout;
  assert.match(human, /^1 knowledge record\(s\) to keep in cross-session memory under its topic; summary and provenance: ospec close --change fix-readme --json$/m);
  assert.match(human, /^- knowledge\/dc\/fix-readme\/1 \| Hourly rotation$/m);
  assert.doesNotMatch(human, /see --json/);
});

// E1.47 (B8): record intent hands the agent the memory query of the change;
// the CLI reads no memory (ADR 0006).
test("[REQ-idd-024] record intent returns the memory query of a resolved intent, in JSON and text", (t) => {
  const { root } = project(t);
  const opened = ospec(root, ...OPEN_BUG);
  assert.strictEqual(opened.code, 0, opened.stderr);
  assert.strictEqual(opened.json.memory_query, "last page");
  assert.strictEqual(ospec(root, ...OPEN_BUG).json.memory_query, "last page", "recording it again returns it again");
  assert.match(ospec(root, ...OPEN_BUG.filter((arg) => arg !== "--json")).stdout, /^memory query: last page$/m);
  assert.ok(!fs.readFileSync(path.join(root, "idd", "fix-pagination", "state.yaml"), "utf8").includes("memory"), "the query is not stored");

  const ambiguous = ospec(root, "record", "intent", "--change", "vague", "--ambiguous", "--request", "Make billing faster", "--json");
  assert.strictEqual(ambiguous.code, 0, ambiguous.stderr);
  assert.ok(!("memory_query" in ambiguous.json), "an ambiguous intent has no query");
  const resolved = ospec(root, "record", "intent", "--change", "vague", "--kind", "bug", "--summary", "Cache the invoices.", "--acceptance", "Invoices load once.", "--no-open-facts", "--basis", "The user settled it.", "--answer", "Cache the invoices", "--source", "user", "--json");
  assert.strictEqual(resolved.code, 0, resolved.stderr);
  assert.strictEqual(resolved.json.memory_query, "make billing faster", "the request comes before the summary");
});

// E3.9 changelog and release at close (REQ-idd-025).
const DECLARED_DELIVERY = "checks:\n  test: node verify.js\ndelivery:\n  changelog: CHANGELOG.md\n  release: per-change\n";

function closeDocsChange(root) {
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  return ospec(root, "close", "--change", "fix-readme", "--json");
}

test("[REQ-idd-025] close writes the entry under [Unreleased] once and proposes the release of a per-change project", (t) => {
  const { root } = project(t, { checks: DECLARED_DELIVERY });
  const changelog = path.join(root, "CHANGELOG.md");
  writeFile(root, "CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n## [1.4.2] - 2026-10-01\n\n### Added\n- Pages (pages)\n");
  const closed = closeDocsChange(root);
  assert.strictEqual(closed.code, 0, closed.stderr);
  assert.deepStrictEqual(closed.json.changelog, { path: "CHANGELOG.md", section: "Changed", entry: "- Fix a typo. (fix-readme)", written: true });
  const text = fs.readFileSync(changelog, "utf8");
  assert.strictEqual(text, "# Changelog\n\n## [Unreleased]\n\n### Changed\n- Fix a typo. (fix-readme)\n\n## [1.4.2] - 2026-10-01\n\n### Added\n- Pages (pages)\n");
  assert.deepStrictEqual(closed.json.release, { version: "1.4.3", bump: "patch", tag: "v1.4.3", notes: "### Changed\n- Fix a typo. (fix-readme)" });

  // Closing again reports the same entry and release without writing it twice.
  const again = ospec(root, "close", "--change", "fix-readme");
  assert.strictEqual(again.code, 0, again.stderr);
  assert.match(again.stdout, /\nchangelog: CHANGELOG.md already holds under \[Unreleased\] ### Changed: - Fix a typo\. \(fix-readme\)\n/);
  assert.match(again.stdout, /\nrelease: propose v1\.4\.3 \(patch\) with the notes of \[Unreleased\]; .* only with the user's OK/);
  assert.strictEqual(fs.readFileSync(changelog, "utf8"), text);
});

test("[REQ-idd-025] close creates a missing changelog, and without a previous version the user chooses it", (t) => {
  const { root } = project(t, { checks: DECLARED_DELIVERY.replace("CHANGELOG.md", "docs/CHANGELOG.md") });
  const closed = closeDocsChange(root);
  assert.strictEqual(closed.code, 0, closed.stderr);
  const text = fs.readFileSync(path.join(root, "docs", "CHANGELOG.md"), "utf8");
  assert.match(text, /^# Changelog\n[\s\S]*Keep a Changelog[\s\S]*\n\n## \[Unreleased\]\n\n### Changed\n- Fix a typo\. \(fix-readme\)\n$/);
  assert.deepStrictEqual(closed.json.release, { bump: "patch", notes: "### Changed\n- Fix a typo. (fix-readme)" });
});

test("[REQ-idd-025] an undeclared changelog, a refused close or an unreadable configuration write nothing", (t) => {
  const plain = project(t).root;
  const closed = closeDocsChange(plain);
  assert.strictEqual(closed.code, 0, closed.stderr);
  assert.ok(!("changelog" in closed.json) && !("release" in closed.json));
  assert.ok(!fs.existsSync(path.join(plain, "CHANGELOG.md")));

  const { root } = project(t, { checks: DECLARED_DELIVERY });
  ospec(root, ...OPEN_DOCS);
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").json.error.code, "close-refused");
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  writeFile(root, "idd/config.yaml", DECLARED_DELIVERY.replace("per-change", "weekly"));
  const unreadable = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(unreadable.json.error.code, "config-invalid");
  assert.strictEqual(stateOf(root, "fix-readme").status, "open");
  assert.ok(!fs.existsSync(path.join(root, "CHANGELOG.md")), "a refused close writes no changelog");
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
  openFeature(root, "record", "intent", "--change", "add-paging", "--kind", "feature", "--summary", "Page the list.", "--acceptance", "Two pages.", ...FEATURE_COVER);
  ospec(root, "signals", "--change", "add-paging", "--work-units", "2");
  writeFile(root, "src/pages.txt", "2");
  const doc = path.join(root, "idd", "add-paging", "change.md");
  // Without the CLI's markers, as changes opened before E4.16 have them, the
  // model writes both sections.
  fs.writeFileSync(doc, fs.readFileSync(doc, "utf8").replace(/<!-- ospec:(plan|decisions):start -->[^]*?<!-- ospec:\1:end -->\n/g, ""));

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
    how: "ospec signals --change fix-pagination [--path <file>]... [--work-units <n>] [--decision \"<text>\"]... [--operation <op>]",
    command: "ospec signals --change fix-pagination [--path <file>]...",
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
  assertGateStep(facts.json.next.next_step, "open-facts");
  const resolved = ospec(root, "record", "gate", "--change", "discount-codes", "--gate", "open-facts", "--resolve", "--answer", "No.", "--source", "user", "--json");
  assert.strictEqual(resolved.json.next.next_step.action, "declare-plan");
});

test("record retract withdraws a declared signal the diff does not confirm and refuses one it confirms", (t) => {
  const { root } = project(t);
  openFeature(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...FEATURE_COVER);
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

// #416: persistent-data that only the content of the diff derives is retracted
// with the user's answer, and stays retracted while the reason is the same.
test("record retract takes the user's answer for persistent data the diff content alone derives", (t) => {
  const { root, git } = project(t);
  writeFile(root, "src/report.js", 'const fs = require("node:fs");\nconst TITLE = "Report";\nfs.writeFileSync("out/report.txt", TITLE);\n');
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "report");
  ospec(root, "record", "intent", "--change", "rename-report", "--kind", "bug", "--summary", "Rename the report.", "--acceptance", "The title reads Sales.", "--no-open-facts", "--basis", "The request fixes every behavior.");
  ospec(root, "signals", "--change", "rename-report", "--path", "src/report.js");
  writeFile(root, "src/report.js", 'const fs = require("node:fs");\nconst TITLE = "Sales";\nfs.writeFileSync("out/report.txt", TITLE);\n');
  const reason = "persistent data: src/report.js uses writeFile";
  assert.strictEqual(ospec(root, "check", "--change", "rename-report", "--json").json.added.signals.includes("persistent-data"), true);

  const retract = ["record", "retract", "--change", "rename-report", "--signal", "persistent-data", "--reason", "the report is regenerated on every run"];
  const plain = ospec(root, ...retract, "--json");
  assert.strictEqual(plain.json.error.code, "signal-confirmed-by-diff");
  assert.match(plain.json.error.how, /--answer "<their words>" --source user/);
  assert.strictEqual(ospec(root, ...retract, "--answer", "No stored data.", "--json").json.error.code, "gate-answer-required");
  assert.strictEqual(ospec(root, ...retract, "--answer", "No stored data.", "--source", "agent", "--json").json.error.code, "invalid-source");

  const answered = ospec(root, ...retract, "--answer", "No stored data.", "--source", "user", "--json");
  assert.strictEqual(answered.code, 0, answered.stderr);
  let state = stateOf(root, "rename-report");
  assert.ok(!state.signals.some((signal) => signal.id === "persistent-data"));
  assert.strictEqual(state.obligations.find((o) => o.id === "migration-compat-and-test").status, "withdrawn");
  assert.deepStrictEqual(state.retracted, [
    {
      id: "persistent-data",
      reason,
      source: "diff",
      retract_reason: "the report is regenerated on every run",
      confirmed_by: reason,
      hits: ['src/report.js uses writeFile: fs.writeFileSync("out/report.txt", TITLE);'],
      answer: "No stored data.",
      answer_source: "user",
    },
  ]);
  assert.strictEqual(ospec(root, ...retract, "--answer", "No stored data.", "--source", "user", "--json").json.changed, false);

  const checked = ospec(root, "check", "--change", "rename-report", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.ok(!(checked.json.added?.signals || []).includes("persistent-data"), "the same reason stays retracted");
  assert.strictEqual(stateOf(root, "rename-report").obligations.find((o) => o.id === "migration-compat-and-test").status, "withdrawn");

  // A second write brings it back; a migration path then keeps any answer out.
  writeFile(root, "src/report.js", 'const fs = require("node:fs");\nconst TITLE = "Sales";\nfs.writeFileSync("out/report.txt", TITLE);\nfs.appendFileSync("data/log.txt", TITLE);\n');
  assert.ok(ospec(root, "check", "--change", "rename-report", "--json").json.added.signals.includes("persistent-data"));
  writeFile(root, "db/migrations/001_report.sql", "ALTER TABLE reports ADD COLUMN title TEXT;\n");
  ospec(root, "check", "--change", "rename-report", "--json");
  state = stateOf(root, "rename-report");
  assert.strictEqual(state.obligations.find((o) => o.id === "migration-compat-and-test").status, "pending");
  const byPath = ospec(root, "record", "retract", "--change", "rename-report", "--signal", "persistent-data", "--reason", "no migration", "--answer", "None.", "--source", "user", "--json");
  assert.strictEqual(byPath.json.error.code, "retract-answer-refused");
  assert.match(byPath.json.error.message, /db\/migrations|src\/report\.js/);
});

// #418: a signal from the diff that the current diff no longer derives is
// retracted with a reason, as a declared one; one the diff derives is refused.
test("record retract withdraws persistent data from the diff once the diff is back to the answered hits", (t) => {
  const { root, git } = project(t);
  writeFile(root, "src/report.js", 'const fs = require("node:fs");\nconst TITLE = "Report";\nfs.writeFileSync("out/report.txt", TITLE);\n');
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "report");
  ospec(root, "record", "intent", "--change", "rename-report", "--kind", "bug", "--summary", "Rename the report.", "--acceptance", "The title reads Sales.", "--no-open-facts", "--basis", "The request fixes every behavior.");
  ospec(root, "signals", "--change", "rename-report", "--path", "src/report.js");
  const answered = 'const fs = require("node:fs");\nconst TITLE = "Sales";\nfs.writeFileSync("out/report.txt", TITLE);\n';
  writeFile(root, "src/report.js", answered);
  ospec(root, "check", "--change", "rename-report", "--json");
  const first = ospec(root, "record", "retract", "--change", "rename-report", "--signal", "persistent-data", "--reason", "the report is regenerated on every run", "--answer", "No stored data.", "--source", "user", "--json");
  assert.strictEqual(first.code, 0, first.stderr);

  writeFile(root, "src/report.js", `${answered}fs.appendFileSync("data/log.txt", TITLE);\n`);
  assert.ok(ospec(root, "check", "--change", "rename-report", "--json").json.added.signals.includes("persistent-data"));
  const retract = ["record", "retract", "--change", "rename-report", "--signal", "persistent-data", "--reason", "the log write was dropped"];
  assert.strictEqual(ospec(root, ...retract, "--json").json.error.code, "signal-confirmed-by-diff");

  writeFile(root, "src/report.js", answered);
  const withAnswer = ospec(root, ...retract, "--answer", "No stored data.", "--source", "user", "--json");
  assert.strictEqual(withAnswer.json.error.code, "retract-answer-refused");
  assert.match(withAnswer.json.error.message, /retract it without an answer/);
  const plain = ospec(root, ...retract, "--json");
  assert.strictEqual(plain.code, 0, plain.stderr);
  const state = stateOf(root, "rename-report");
  assert.ok(!state.signals.some((signal) => signal.id === "persistent-data"));
  assert.deepStrictEqual(state.obligations.find((o) => o.id === "migration-compat-and-test"), {
    id: "migration-compat-and-test",
    signal: "persistent-data",
    status: "withdrawn",
    evidence: [],
    withdrawn_reason: "the log write was dropped",
  });
  assert.deepStrictEqual(state.retracted[1], {
    id: "persistent-data",
    reason: "persistent data: src/report.js adds writeFile",
    source: "diff",
    retract_reason: "the log write was dropped",
  });
  assert.strictEqual(ospec(root, ...retract, "--json").json.changed, false);
  const checked = ospec(root, "check", "--change", "rename-report", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.ok(!(checked.json.added?.signals || []).includes("persistent-data"), "the answered hits stay retracted");
});

test("record retract withdraws a public contract from the diff once the diff no longer touches it", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt");
  writeFile(root, "src/api/search.js", "module.exports = {};\n");
  assert.ok(ospec(root, "check", "--change", "fix-pagination", "--json").json.added.signals.includes("public-contract"));
  const retract = ["record", "retract", "--change", "fix-pagination", "--signal", "public-contract", "--reason", "the API change was undone", "--json"];
  const confirmed = ospec(root, ...retract);
  assert.strictEqual(confirmed.json.error.code, "signal-confirmed-by-diff");
  assert.match(confirmed.json.error.message, /src\/api\/search\.js/);

  fs.rmSync(path.join(root, "src", "api"), { recursive: true });
  const retracted = ospec(root, ...retract);
  assert.strictEqual(retracted.code, 0, retracted.stderr);
  const state = stateOf(root, "fix-pagination");
  assert.ok(!state.signals.some((signal) => signal.id === "public-contract"));
  assert.strictEqual(state.obligations.find((o) => o.id === "contract-spec-and-test").status, "withdrawn");
  assert.deepStrictEqual(state.retracted, [
    {
      id: "public-contract",
      reason: "public contract: touches src/api/search.js (matches **/api/**)",
      source: "diff",
      retract_reason: "the API change was undone",
    },
  ]);
});

test("record retract refuses the user's answer for a signal other than persistent data", (t) => {
  const { root } = project(t);
  openFeature(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...FEATURE_COVER);
  ospec(root, "signals", "--change", "add-index", "--path", "src/api/search.js");
  writeFile(root, "src/api/search.js", "module.exports = {};\n");
  const refused = ospec(root, "record", "retract", "--change", "add-index", "--signal", "public-contract", "--reason", "internal", "--answer", "Not public.", "--source", "user", "--json");
  assert.strictEqual(refused.json.error.code, "retract-answer-refused");
  assert.strictEqual(stateOf(root, "add-index").obligations.find((o) => o.id === "contract-spec-and-test").status, "pending");
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
  openFeature(root, ...OPEN_EVENTS);
  const unknownAdr = ospec(root, "signals", "--change", "order-events", "--path", "src/orders.js", "--adr", "0099", "--json");
  assert.strictEqual(unknownAdr.code, 1);
  assert.deepStrictEqual(unknownAdr.json.error, {
    code: "unknown-reference",
    message: "ADR 0099 is not under docs/architecture/decisions/",
    how: "declare an ADR under docs/architecture/decisions/ or a quality scenario of docs/architecture/knowledge-map.yaml",
  });
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
  openFeature(root, ...OPEN_EVENTS);
  ospec(root, "signals", "--change", "order-events", "--path", "src/orders.js", "--adr", "0002");

  const usage = ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", "--quality", "module-integration", "--impact", "none", "--reason", "r", "--json");
  assert.strictEqual(usage.code, 2);

  const amended = ospec(root, "record", "impact", "--change", "order-events", "--adr", "0002", "--impact", "amends", "--reason", "billing consumes order-placed asynchronously", "--json");
  assert.strictEqual(amended.code, 0, amended.stderr);
  assertGateStep(amended.json.next.next_step, "adr-amend-or-contradict");
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
  assert.ok(!(settled.json.missing || []).some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(settled.json.missing));
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
  openFeature(root, ...OPEN_EVENTS);
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
  openFeature(root, ...OPEN_EVENTS);
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
  assert.strictEqual(next.json.knowledge_refs, undefined);
  assert.strictEqual(next.json.next_step.obligation, "adr-impact-declaration");

  const human = ospec(root, "next", "--change", "order-events");
  assert.match(human.stdout, /ref adr 0002 current \(orders\): docs\/architecture\/decisions\/0002-integracion-sincrona\.md/);
  assert.match(human.stdout, /warning: stale ADR 0004 \(orders\): ADR 0004 is superseded/);
});

test("[REQ-idd-021] check derives the references of the components the diff touches", (t) => {
  const { root } = knowledgeProject(t);
  openFeature(root, ...OPEN_EVENTS);
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
  openFeature(root, ...OPEN_EVENTS);
  const planned = ospec(root, "signals", "--change", "order-events", "--path", "src/orders/place.js", "--json");
  assert.strictEqual(planned.code, 0, planned.stderr);
  assert.ok(!planned.json.signals.some((entry) => entry.id === "adr-or-quality-attribute"));
  assert.match(planned.json.warnings[0], /component-map\.yaml is not JSON text/);
  const next = ospec(root, "next", "--change", "order-events", "--json");
  assert.strictEqual(next.code, 0, next.stderr);
  assert.strictEqual(next.json.references, undefined);
  assert.match(next.json.warnings[0], /component-map\.yaml is not JSON text/);
  const checked = ospec(root, "check", "--change", "order-events");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.match(checked.stdout, /warning: docs\/architecture\/component-map\.yaml is not JSON text/);

  fs.rmSync(path.join(root, "docs/architecture/component-map.yaml"));
  const bare = ospec(root, "next", "--change", "order-events", "--json");
  assert.deepStrictEqual([bare.json.references, bare.json.warnings], [undefined, undefined]);
});

// E1.47 (B8): the ADRs and components the CLI derives from the paths a new
// change already names lead its memory query.
test("[REQ-idd-024] the memory query names the ADRs and components of the cited and changed paths first", (t) => {
  const { root, git } = knowledgeProject(t);
  writeFile(root, "src/orders/place.js", "module.exports = function place() {};\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "orders");
  writeFile(root, "src/billing/charge.js", "module.exports = {};\n");
  const cover = [
    "--request",
    "The request fixes every behavior.",
    "--open-fact",
    "inputs:Is a page size above 100 refused?",
    "--cite",
    "uniqueness=src/orders/place.js:1",
    ...["persistence=fixes every behavior", "copy=every behavior.", "url-state=The request fixes every", "accessibility=request fixes every behavior", "errors=quest fixes every"].flatMap((quote) => ["--quote", quote]),
  ];
  const opened = ospec(root, "record", "intent", "--change", "order-events", "--kind", "feature", "--summary", "Billing consumes order-placed.", "--acceptance", "Orders no longer calls billing.", ...cover, "--json");
  assert.strictEqual(opened.code, 0, opened.stdout);
  assert.strictEqual(opened.json.memory_query, "ADR-0002 ADR-0003 ADR-0004 billing orders request fixes behavior");
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
  openFeature(root, ...OPEN_EVENTS);
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
    { kind: "adr", id: "0002", path: "docs/architecture/decisions/0002-integracion-sincrona.md", fitness: "Un test de integración entre módulos." },
  ]);
  assert.deepStrictEqual(next.json.fitness.checks.map((check) => check.command), ["node boundary.js"]);
  assert.match(ospec(root, "next", "--change", "order-events").stdout, /manual fitness ADR 0002: Un test de integración entre módulos\. \(no evidence recorded/);

  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.ok(!(checked.json.missing || []).some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(checked.json.missing));

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
    openFeature(root, "record", "intent", "--change", "fix-pagination", "--kind", "feature", "--summary", "Fix the last page.", "--acceptance", "Two full pages.", ...FEATURE_COVER, "--json");
  }
  ospec(small, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  ospec(multi, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  const nextSmall = ospec(small, "next", "--change", "fix-pagination", "--json").json;
  const nextMulti = ospec(multi, "next", "--change", "fix-pagination", "--json").json;
  assert.deepStrictEqual(nextSmall.team, { size: "solo", experience: "senior", source: "idd/config.yaml", delivery_strategy: "single-pr", mentorship: "expert" });
  assert.strictEqual(nextMulti.team.delivery_strategy, "auto-chain");
  assert.ok(!nextSmall.pending_obligations.some((o) => o.id === "tdd-red-green"));
  assert.ok(nextMulti.pending_obligations.some((o) => o.id === "tdd-red-green"));
  assert.strictEqual(nextSmall.pending_decision, undefined);
  assert.match(ospec(small, "next", "--change", "fix-pagination").stdout, /team: solo; delivery single-pr; mentorship expert/);
});

test("[REQ-idd-023] team follows the active mode and refuses an invalid profile", (t) => {
  const root = tempRoot(t);
  const { branching, changelog, release, ...none } = ospec(root, "team", "--json").json;
  assert.deepStrictEqual(none, { ok: true, command: "team", mode: "sdd", profile: null, source: null, defaults: null });
  assert.deepStrictEqual([changelog.value, release.value], ["CHANGELOG.md", "per-change"]);
  assert.deepStrictEqual([branching.value, branching.source], ["serial", "recommended"]);
  assert.match(ospec(root, "team").stdout, /no profile declared; defaults unchanged\nbranching: serial \(recommended\): /);
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

test("[REQ-idd-023] next suggests the branching when the work starts, and an explicit one wins over the profile", (t) => {
  const root = tempRoot(t);
  const config = path.join(root, "idd", "config.yaml");
  fs.mkdirSync(path.join(root, "idd"));
  fs.writeFileSync(config, "checks:\n  test: node -e 0\n");
  // A project with code, so the foundation suggestion (E4.10) stays out.
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "a.js"), "");
  ospec(root, "record", "intent", "--change", "fix-it", "--kind", "bug", "--summary", "s", "--acceptance", "a", "--no-open-facts", "--basis", "The request fixes every behavior.");
  const start = ospec(root, "next", "--change", "fix-it", "--json").json;
  assert.strictEqual(start.next_step.action, "declare-plan");
  assert.deepStrictEqual([start.delivery.branching, start.delivery.source], ["serial", "recommended"]);
  assert.deepStrictEqual(start.suggestions.map((suggestion) => suggestion.id), ["branching-undeclared", "changelog-undeclared", "release-undeclared"]);
  const text = ospec(root, "next", "--change", "fix-it").stdout;
  assert.match(text, /suggestion branching-undeclared: delivery.branching is not declared; serial is recommended/);
  assert.match(text, /\nbranching rules: before a new branch, merge the open pull request/);

  // An unreadable configuration leaves delivery out and keeps the next step.
  fs.writeFileSync(config, "checks:\n  test: node -e 0\ndelivery:\n  branching: rebase\n");
  const unreadable = ospec(root, "next", "--change", "fix-it", "--json").json;
  assert.deepStrictEqual([unreadable.next_step.action, "delivery" in unreadable], ["declare-plan", false]);

  fs.writeFileSync(config, "team:\n  size: solo\ndelivery:\n  branching: parallel\nchecks:\n  test: node -e 0\n");
  const declared = ospec(root, "next", "--change", "fix-it", "--json").json;
  assert.deepStrictEqual([declared.delivery.branching, declared.delivery.source], ["parallel", "idd/config.yaml"]);
  assert.deepStrictEqual(declared.suggestions.map((suggestion) => suggestion.id), ["changelog-undeclared", "release-undeclared"]);
  assert.strictEqual(ospec(root, "team", "--json").json.branching.value, "parallel");
  ospec(root, "signals", "--change", "fix-it", "--path", "src/a.js");
  assert.ok(!("delivery" in ospec(root, "next", "--change", "fix-it", "--json").json), "building, the branching decides nothing");
});

test("[REQ-idd-011] next and record intent suggest foundation while the project has no code yet (E4.10)", (t) => {
  const root = tempRoot(t);
  const suggested = (result) => (result.suggestions || []).map((suggestion) => suggestion.id).includes("foundation");
  fs.writeFileSync(path.join(root, "README.md"), "# Todo\n");
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  // An ignored file is not the project's code.
  fs.writeFileSync(path.join(root, ".gitignore"), "vendor/\n");
  fs.mkdirSync(path.join(root, "vendor"));
  fs.writeFileSync(path.join(root, "vendor", "lib.js"), "");

  const start = ospec(root, "next", "--json");
  assert.deepStrictEqual([start.code, start.json.next_step.action, start.json.suggestions.map((suggestion) => suggestion.id)], [0, "open-change", ["foundation"]]);
  assert.match(
    ospec(root, "next").stdout,
    /\nsuggestion foundation: the project has no source code and no docs\/product or docs\/architecture; offer the user the foundation skill before the first change, as an option: it records the product docs, ADRs and idd\/config.yaml and writes no code; if the user declines, go on with the change\n/,
  );

  const intent = ["record", "intent", "--change", "todo-list", "--kind", "bug", "--summary", "s", "--acceptance", "a", "--no-open-facts", "--basis", "The request fixes every behavior."];
  const opened = ospec(root, ...intent, "--json");
  assert.deepStrictEqual([opened.code, opened.json.next.next_step.action, suggested(opened.json.next)], [0, "declare-plan", true]);
  assert.match(ospec(root, ...intent).stdout, /\nsuggestion foundation: /);
  assert.ok(suggested(ospec(root, "next", "--change", "todo-list", "--json").json));

  // Anything under docs/product or docs/architecture, or one source file, means
  // the project has started.
  fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "product", "brief.md"), "# Brief\n");
  assert.ok(!suggested(ospec(root, "next", "--change", "todo-list", "--json").json));
  fs.rmSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html>\n");
  const withCode = ospec(root, "next", "--change", "todo-list", "--json");
  assert.deepStrictEqual([withCode.code, withCode.json.next_step.action, suggested(withCode.json)], [0, "declare-plan", false]);

  // Once the plan is declared the change is being built: no more offers, even
  // in an empty project.
  fs.rmSync(path.join(root, "index.html"));
  ospec(root, "signals", "--change", "todo-list", "--path", "index.html");
  assert.ok(!suggested(ospec(root, "next", "--change", "todo-list", "--json").json));
});

// ---------------------------------------------------------------------------
// E1.44 ceremony-only-rises: the model can raise the ceremony, never lower it
// (B3, B6, B7 and B9 of the 2026-10-25 audit).
// ---------------------------------------------------------------------------

const PAGE_FEATURE = ["record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works."];

function boundaryReason(result) {
  return (result.json.missing || []).find((entry) => entry.obligation === "boundary-tests")?.reason;
}

test("[E1.44 B3] boundary-tests needs a test the diff adds, not the suite that already passed", (t) => {
  const { root, git } = project(t);
  writeFile(root, "verify.js", `${VERIFY}\nconsole.log('ℹ tests 3');\n`);
  writeFile(root, "test/old.test.js", "require('node:assert').ok(true);\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "counted suite");
  openFeature(root, ...PAGE_FEATURE, ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = { maxSize: 50 };\n");

  const untested = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(untested.code, 0, untested.stdout);
  assert.ok(untested.json.added.signals.includes("untested-product"));
  assert.match(boundaryReason(untested) ?? "satisfied", /adds no line to a test/);

  fs.rmSync(path.join(root, "test", "old.test.js"));
  assert.match(boundaryReason(ospec(root, "check", "--change", "page-size", "--json")) ?? "satisfied", /adds no line to a test/, "a deleted test is not a new one");

  writeFile(root, "test/paginate.test.js", "require('node:assert').strictEqual(50, 50);\n");
  const tested = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(boundaryReason(tested), undefined, JSON.stringify(tested.json.missing));
  const evidence = stateOf(root, "page-size").evidence.find((entry) => entry.kind === "tested-check");
  assert.deepStrictEqual(evidence.detail.tests, ["test/paginate.test.js"]);
});

test("[E1.44 B6] a feature cite never lands in a manifest, and a code cite needs a file of the plan or the diff", (t) => {
  const { root, git } = project(t);
  writeFile(root, "package.json", '{\n  "name": "pages",\n  "version": "1.0.0"\n}\n');
  writeFile(root, "src/store.js", "// a corrupt file reads as empty\nmodule.exports = {};\n");
  writeFile(root, "README.md", "# Pages\nAn error prints one line.\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "sources");
  const intent = (...cites) => [
    ...PAGE_FEATURE,
    "--request",
    "The request fixes every behavior.",
    "--open-fact",
    "inputs:Is a page size above 100 refused?",
    ...["uniqueness=request fixes every", "copy=every behavior.", "url-state=The request fixes every", "accessibility=request fixes every behavior"].flatMap((quote) => ["--quote", quote]),
    ...cites.flatMap((cite) => ["--cite", cite]),
    "--json",
  ];

  const manifest = ospec(root, ...intent("persistence=package.json:2", "errors=README.md:2"));
  assert.strictEqual(manifest.code, 1, manifest.stdout);
  assert.strictEqual(manifest.json.error.code, "cite-unresolved");
  assert.match(manifest.json.error.message, /package\.json is a manifest/);

  const opened = ospec(root, ...intent("persistence=src/store.js:1", "errors=README.md:2"));
  assert.strictEqual(opened.code, 0, opened.stdout);
  ospec(root, "record", "gate", "--change", "page-size", "--gate", "open-facts", "--resolve", "--answer", "Yes, above 100 is refused.", "--source", "user");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = 50;\n");
  writeFile(root, "src/paginate.test.js", "require('node:assert').strictEqual(50, 50);\n");

  const outside = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(outside.code, 1, outside.stdout);
  assert.strictEqual(outside.json.error.code, "cite-outside-plan");
  assert.match(outside.json.error.message, /persistence=src\/store\.js:1/);
  assert.match(outside.json.error.how, /ospec signals --change page-size --path src\/store\.js/);

  ospec(root, "signals", "--change", "page-size", "--path", "src/store.js");
  const planned = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(planned.code, 0, planned.stdout);
  assert.strictEqual(planned.json.verdict, "ready", JSON.stringify(planned.json.missing));

  // close revalidates it: a plan edited by hand does not take the file out.
  const file = path.join(root, "idd", "page-size", "state.yaml");
  const state = stateOf(root, "page-size");
  state.plan.paths = state.plan.paths.filter((entry) => entry !== "src/store.js");
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  assert.strictEqual(ospec(root, "close", "--change", "page-size", "--json").json.error?.code, "cite-outside-plan");
});

test("[E1.44 B7] checks that differ from the base open checks-changed, and each new set needs the user's answer", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "README.md", "# Pages\n");
  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 0\n");

  const changed = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(changed.code, 0, changed.stdout);
  assert.strictEqual(changed.json.verdict, "needs-decision", JSON.stringify(changed.json.missing));
  assert.strictEqual(changed.json.decision.gate, "checks-changed");
  assert.match(changed.json.decision.reason, /test: node -e 0/);
  assert.match(changed.json.decision.reason, /test: node verify\.js/);
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").code, 1, "an open gate holds the close");
  const manual = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--open", "--json");
  assert.strictEqual(manual.json.error.code, "gate-managed-by-check");

  ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, node -e 0 is enough for a README.", "--source", "user");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");

  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 1\n");
  const again = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(again.json.decision?.gate, "checks-changed", "a new set of checks needs a new answer");
  assert.deepStrictEqual(stateOf(root, "fix-readme").gates.filter((gate) => gate.id === "checks-changed").map((gate) => gate.status), ["resolved", "open"]);
});

test("[E1.44 B7] the first checks of a project also need the user's answer", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "README.md", "# Pages\n");
  writeFile(root, "idd/config.yaml", "checks:\n  test: node -e 0\n");
  const first = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(first.json.decision?.gate, "checks-changed", JSON.stringify(first.json));
  assert.match(first.json.decision.reason, /the base declares no checks/);
});

test("[E1.44 B9] a docs change that touches product code is refused until its kind rises", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = 50;\n");

  const refused = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(refused.code, 1, refused.stdout);
  assert.strictEqual(refused.json.error.code, "kind-mismatch");
  assert.match(refused.json.error.message, /src\/paginate\.js/);
  assert.match(refused.json.error.how, /ospec record intent --change fix-readme --kind <refactor\|bug\|feature>/);

  const rerecord = (kind, summary) => ["record", "intent", "--change", "fix-readme", "--kind", kind, "--summary", summary, "--acceptance", "Two pages, as before.", "--no-open-facts", "--basis", "The behavior stays.", "--json"];
  assert.strictEqual(ospec(root, ...rerecord("docs", "Another typo.")).json.error?.code, "intent-conflict");
  const raised = ospec(root, ...rerecord("refactor", "Move the page count to a module."));
  assert.strictEqual(raised.code, 0, raised.stdout);
  assert.strictEqual(stateOf(root, "fix-readme").intent.kind, "refactor");
  const checked = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(checked.code, 0, checked.stdout);
  assert.strictEqual(checked.json.verdict, "ready", JSON.stringify(checked.json.missing));
  assert.strictEqual(ospec(root, ...rerecord("docs", "Fix a typo.")).json.error?.code, "intent-conflict", "the kind never goes down");

  // close revalidates it: a kind lowered by hand does not close.
  const file = path.join(root, "idd", "fix-readme", "state.yaml");
  const state = stateOf(root, "fix-readme");
  state.intent.kind = "docs";
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").json.error?.code, "kind-mismatch");
});

test("[E1.44 B9] a refactor that removes a line of a contract is refused until it is a bug or a feature", (t) => {
  const { root, git } = project(t);
  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\npaths:\n  /orders: {}\n  /pages: {}\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "api");
  const intent = (kind) => ["record", "intent", "--change", "tidy-api", "--kind", kind, "--summary", "Tidy the API.", "--acceptance", "Same answers.", "--no-open-facts", "--basis", "The behavior stays.", "--json"];
  ospec(root, ...intent("refactor"));
  writeFile(root, "src/pages.txt", "2");

  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\npaths:\n  /pages: {}\n  /orders: {}\n");
  assert.strictEqual(ospec(root, "check", "--change", "tidy-api", "--json").code, 0, "a moved line is not a removed one");

  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\npaths:\n  /orders: {}\n");
  const refused = ospec(root, "check", "--change", "tidy-api", "--json");
  assert.strictEqual(refused.code, 1, refused.stdout);
  assert.strictEqual(refused.json.error.code, "kind-mismatch");
  assert.match(refused.json.error.message, /api\/openapi\.yaml/);
  assert.match(refused.json.error.how, /--kind <bug\|feature>/);

  const raised = ospec(root, ...intent("bug"));
  assert.strictEqual(raised.code, 0, raised.stdout);
  assert.strictEqual(ospec(root, "check", "--change", "tidy-api", "--json").code, 0);
});

test("[E1.44 B3] a test deleted or emptied before the first check does not stand for a new one", (t) => {
  const { root, git } = project(t);
  writeFile(root, "verify.js", `${VERIFY}\nconsole.log('ℹ tests 3');\n`);
  writeFile(root, "test/old.test.js", "require('node:assert').ok(true);\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "counted suite");
  openFeature(root, ...PAGE_FEATURE, ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = { maxSize: 50 };\n");
  fs.rmSync(path.join(root, "test", "old.test.js"));
  writeFile(root, "test/empty.test.js", "\n");

  const first = ospec(root, "check", "--change", "page-size", "--json");
  assert.strictEqual(first.code, 0, first.stdout);
  assert.ok(first.json.added.signals.includes("untested-product"), JSON.stringify(first.json.added));
  assert.match(boundaryReason(first) ?? "satisfied", /adds no line to a test/);
});

test("[E1.44 B3] close reads boundary-tests against the change's base, not a --base the check chose", (t) => {
  const { root, git } = project(t);
  writeFile(root, "verify.js", `${VERIFY}\nconsole.log('ℹ tests 3');\n`);
  writeFile(root, "test/old.test.js", "require('node:assert').ok(true);\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "counted suite");
  openFeature(root, ...PAGE_FEATURE, ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/paginate.js", "module.exports = { maxSize: 50 };\n");
  assert.match(boundaryReason(ospec(root, "check", "--change", "page-size", "--json")) ?? "satisfied", /adds no line to a test/);

  // An older base puts the suite's test in the diff.
  const older = ospec(root, "check", "--change", "page-size", "--base", "HEAD~1", "--json");
  assert.strictEqual(older.json.verdict, "ready", JSON.stringify(older.json.missing));
  const refused = ospec(root, "close", "--change", "page-size", "--json");
  assert.strictEqual(refused.json.error?.code, "close-refused", refused.stdout);
  assert.match(refused.json.error.message, /boundary-tests/);
  assert.match(boundaryReason(ospec(root, "check", "--change", "page-size", "--json")) ?? "satisfied", /adds no line to a test/);
});

test("[E1.44 B6] a cite through a symlink is judged by the file it reads", (t) => {
  const { root, git } = project(t);
  writeFile(root, "package.json", '{\n  "name": "pages",\n  "version": "1.0.0"\n}\n');
  fs.mkdirSync(path.join(root, "docs"));
  try {
    fs.symlinkSync(path.join("..", "package.json"), path.join(root, "docs", "notes.md"), "file");
  } catch (error) {
    t.skip(`symlink unavailable: ${error.message}`);
    return;
  }
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "sources");
  const intent = (cite) => [
    ...PAGE_FEATURE,
    "--request",
    "The request fixes every behavior.",
    "--open-fact",
    "inputs:Is a page size above 100 refused?",
    ...["uniqueness=request fixes every", "copy=every behavior.", "url-state=The request fixes every", "accessibility=request fixes every behavior", "errors=quest fixes every"].flatMap((quote) => ["--quote", quote]),
    "--cite",
    cite,
    "--json",
  ];
  for (const cite of ["persistence=docs/notes.md:2", "persistence=package.json/:2"]) {
    const refused = ospec(root, ...intent(cite));
    assert.strictEqual(refused.json.error?.code, "cite-unresolved", `${cite}: ${refused.stdout}`);
    assert.match(refused.json.error.message, /package\.json is a manifest/);
  }
});

// ---------------------------------------------------------------------------
// E1.53 config-only-rises: strict_tdd, impact and contracts of idd/config.yaml
// are contrasted with the change's base as checks is (E1.44 B7), and the
// residues of the E1.44 reviews.
// ---------------------------------------------------------------------------

test("[E1.53] a new impact.exclude needs the user's answer before close, and each new set another one", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "README.md", "# Pages\n");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\nimpact:\n  exclude:\n    - src/auth/**\n");

  const changed = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(changed.code, 0, changed.stdout);
  assert.strictEqual(changed.json.decision?.gate, "checks-changed", JSON.stringify(changed.json));
  assert.match(changed.json.decision.reason, /impact/);
  assert.match(changed.json.decision.reason, /src\/auth\/\*\*/);
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").code, 1, "an open gate holds the close");

  ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, src/auth is generated.", "--source", "user");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");

  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\nimpact:\n  exclude:\n    - src/**\n");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.decision?.gate, "checks-changed", "another exclude needs another answer");

  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\nimpact:\n  exclude:\n    - src/auth/**\n");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready", "back to the approved set");
  const closed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
});

test("[E1.53] strict_tdd, the team profile and contracts that differ from the base need the user's answer; a reordered list does not", (t) => {
  const checks = "checks:\n  test: node verify.js\n";
  const cases = [
    { base: "strict_tdd: true\n", now: "strict_tdd: false\n", reason: /strict_tdd/ },
    { base: "team:\n  size: small\n", now: "team:\n  size: solo\n", reason: /strict_tdd/ },
    { base: "", now: "contracts:\n  defaults: false\n", reason: /contracts/ },
    { base: "", now: "strict_tdd: true\n", reason: /strict_tdd/ },
    { base: "impact:\n  exclude:\n    - a/**\n    - b/**\n", now: "impact:\n  exclude:\n    - b/**\n    - a/**\n", reason: null },
    { base: "team:\n  size: solo\n", now: "team:\n  size: solo\n  experience: senior\n", reason: null },
  ];
  for (const { base, now, reason } of cases) {
    const label = `${JSON.stringify(base)} -> ${JSON.stringify(now)}`;
    const { root } = project(t, { checks: `${checks}${base}` });
    ospec(root, ...OPEN_DOCS);
    writeFile(root, "README.md", "# Pages\n");
    writeFile(root, "src/pages.txt", "2");
    writeFile(root, "idd/config.yaml", `${checks}${now}`);
    const checked = ospec(root, "check", "--change", "fix-readme", "--json");
    assert.strictEqual(checked.code, 0, `${label}: ${checked.stdout}`);
    if (reason) {
      assert.strictEqual(checked.json.decision?.gate, "checks-changed", `${label}: ${JSON.stringify(checked.json)}`);
      assert.match(checked.json.decision.reason, reason, label);
    } else {
      assert.strictEqual(checked.json.verdict, "ready", `${label}: ${JSON.stringify(checked.json)}`);
    }
  }
});

test("[E1.53] close reads contract-spec-and-test against the change's base, not a --base the check chose", (t) => {
  const { root, git } = project(t);
  writeFile(root, "api/openapi.yaml", "openapi: 3.1.0\n");
  writeFile(root, "src/api/orders.test.js", "require('node:assert').ok(true);\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "contract");
  openFeature(root, "record", "intent", "--change", "page-size", "--kind", "feature", "--summary", "Allow 50 per page.", "--acceptance", "size=50 works.", ...FEATURE_COVER);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "src/api/orders.js", "module.exports = { maxSize: 50 };\n");
  writeFile(root, "test/orders-size.test.js", "require('node:assert').strictEqual(50, 50);\n");
  const reason = (result) => result.json.missing.find((entry) => entry.obligation === "contract-spec-and-test")?.reason;
  assert.match(reason(ospec(root, "check", "--change", "page-size", "--json")) ?? "satisfied", /touches no contract document/);

  // An older base puts the committed contract document in the diff.
  const older = ospec(root, "check", "--change", "page-size", "--base", "HEAD~1", "--json");
  assert.strictEqual(older.json.verdict, "ready", JSON.stringify(older.json.missing));
  const refused = ospec(root, "close", "--change", "page-size", "--json");
  assert.strictEqual(refused.json.error?.code, "close-refused", refused.stdout);
  assert.match(refused.json.error.message, /contract-spec-and-test/);
  assert.match(refused.json.error.how, /ospec check --change page-size/);
});

// E5.10 ospec snapshot (REQ-idd-026): the progress snapshot, on demand only.
const SNAPSHOT_ROADMAP = "| Phase | Content |\n| --- | --- |\n| A1. Alpha | x |\n| B2. Beta | y |\n";

test("[REQ-idd-026] snapshot prints the bare snapshot on stdout, with or without --json, outside git too", (t) => {
  const root = plainRoot(t);
  writeFile(root, "docs/roadmap.md", SNAPSHOT_ROADMAP);
  fs.mkdirSync(path.join(root, "idd", "archive", "2026-01-02-a1-start"), { recursive: true });
  const expected = {
    schemaVersion: 1,
    phases: [
      { id: "a1", title: "Alpha", status: "done" },
      { id: "b2", title: "Beta", status: "pending" },
    ],
  };
  for (const args of [["snapshot"], ["snapshot", "--json"]]) {
    const result = ospec(root, ...args);
    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
  }
});

test("[REQ-idd-026] snapshot --out writes the file and reports it", (t) => {
  const root = plainRoot(t);
  writeFile(root, "plans/phases.md", SNAPSHOT_ROADMAP);
  const result = ospec(root, "snapshot", "--roadmap", "plans/phases.md", "--out", "out/snapshot.json");
  assert.strictEqual(result.code, 0, result.stderr);
  const text = fs.readFileSync(path.join(root, "out", "snapshot.json"), "utf8");
  assert.strictEqual(JSON.parse(text).phases.length, 2);
  assert.strictEqual(result.stdout, `snapshot: 2 phases from plans/phases.md written to out/snapshot.json (${Buffer.byteLength(text)} bytes)\n`);
  const json = ospec(root, "snapshot", "--roadmap", "plans/phases.md", "--out", "out/snapshot.json", "--json").json;
  assert.deepStrictEqual(json, { ok: true, command: "snapshot", roadmap: "plans/phases.md", out: "out/snapshot.json", phases: 2, bytes: Buffer.byteLength(text) });
});

test("[REQ-idd-026] snapshot refuses an unusable roadmap with exit 1 and writes nothing", (t) => {
  const root = plainRoot(t);
  const missing = ospec(root, "snapshot", "--out", "snapshot.json");
  assert.strictEqual(missing.code, 1);
  assert.strictEqual(missing.stderr, "ospec: roadmap not found: docs/roadmap.md (roadmap-missing)\npass --roadmap <path> to read another roadmap\n");
  writeFile(root, "docs/roadmap.md", "| Phase |\n| --- |\n| A1. Alpha |\n| A1. Again |\n");
  const repeated = ospec(root, "snapshot", "--out", "snapshot.json", "--json");
  assert.strictEqual(repeated.code, 1);
  assert.strictEqual(repeated.json.error.code, "roadmap-invalid");
  assert.match(repeated.json.error.message, /docs\/roadmap\.md:4/);
  assert.ok(!fs.existsSync(path.join(root, "snapshot.json")));
});

// E5.11 the v2: groups from the roadmap and client texts from the progress file.
const SNAPSHOT_V2_ROADMAP = [
  "## S1. Base",
  "| Change | Content |",
  "| --- | --- |",
  "| S1a. Platform | x |",
  "| S1b. Access | y |",
  "## Milestones",
  "| Milestone | Content |",
  "| --- | --- |",
  "| M1. Docs | z |",
  "",
].join("\n");

function snapshotV2Project(t, progress) {
  const root = plainRoot(t);
  writeFile(root, "docs/roadmap.md", SNAPSHOT_V2_ROADMAP);
  if (progress !== undefined) writeFile(root, "docs/progress.md", progress);
  fs.mkdirSync(path.join(root, "idd", "archive", "2026-01-02-s1a-platform"), { recursive: true });
  return root;
}

const SNAPSHOT_V2_PROGRESS = "## S1. The base\n\nWhat every client needs.\n\n### S1a. The platform\n\n- short: Platform\n\n#### Tasks\n\n- [x] domain: Own domain\n";

test("[REQ-idd-026] snapshot --schema-version 2 prints the v2 with groups and client texts", (t) => {
  const root = snapshotV2Project(t, SNAPSHOT_V2_PROGRESS);
  const expected = {
    schemaVersion: 2,
    groups: [
      { id: "s1", title: "The base", summary: "What every client needs." },
      { id: "milestones", title: "Milestones" },
    ],
    phases: [
      { id: "s1a", title: "The platform", status: "done", group: "s1", shortTitle: "Platform", tasks: [{ id: "domain", title: "Own domain", done: true }] },
      { id: "s1b", title: "Access", status: "pending", group: "s1" },
      { id: "m1", title: "Docs", status: "pending", group: "milestones" },
    ],
  };
  for (const args of [["snapshot", "--schema-version", "2"], ["snapshot", "--schema-version", "2", "--json"]]) {
    const result = ospec(root, ...args);
    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
  }
  // Without the option the v1 is unchanged.
  assert.deepStrictEqual(JSON.parse(ospec(root, "snapshot").stdout), {
    schemaVersion: 1,
    phases: [
      { id: "s1a", title: "Platform", status: "done" },
      { id: "s1b", title: "Access", status: "pending" },
      { id: "m1", title: "Docs", status: "pending" },
    ],
  });
});

test("[REQ-idd-026] snapshot v2 --out reports its version and the progress file it read", (t) => {
  const root = snapshotV2Project(t, SNAPSHOT_V2_PROGRESS);
  const result = ospec(root, "snapshot", "--schema-version", "2", "--out", "snapshot.json");
  assert.strictEqual(result.code, 0, result.stderr);
  const bytes = Buffer.byteLength(fs.readFileSync(path.join(root, "snapshot.json"), "utf8"));
  assert.strictEqual(result.stdout, `snapshot v2: 3 phases from docs/roadmap.md and docs/progress.md written to snapshot.json (${bytes} bytes)\n`);
  writeFile(root, "plans/client.md", "## S1.\n");
  const json = ospec(root, "snapshot", "--schema-version", "2", "--progress", "plans/client.md", "--out", "snapshot.json", "--json").json;
  assert.deepStrictEqual(json, {
    ok: true,
    command: "snapshot",
    schema_version: 2,
    roadmap: "docs/roadmap.md",
    out: "snapshot.json",
    phases: 3,
    bytes: Buffer.byteLength(fs.readFileSync(path.join(root, "snapshot.json"), "utf8")),
    progress: "plans/client.md",
  });
  const bare = snapshotV2Project(t);
  assert.strictEqual(ospec(bare, "snapshot", "--schema-version", "2", "--out", "s.json").stdout.startsWith("snapshot v2: 3 phases from docs/roadmap.md written to s.json"), true);
});

test("[REQ-idd-026] snapshot refuses a bad version, --progress without the v2 and a progress file out of its syntax, writing nothing", (t) => {
  const root = snapshotV2Project(t, SNAPSHOT_V2_PROGRESS.replace("- [x] domain", "- [ ] domain"));
  for (const args of [["--schema-version", "5"], ["--progress", "docs/progress.md"]]) {
    const result = ospec(root, "snapshot", ...args, "--out", "snapshot.json");
    assert.strictEqual(result.code, 2, result.stderr);
    assert.match(result.stderr, /\(usage\)/);
  }
  const unchecked = ospec(root, "snapshot", "--schema-version", "2", "--out", "snapshot.json", "--json");
  assert.strictEqual(unchecked.code, 1);
  assert.strictEqual(unchecked.json.error.code, "progress-invalid");
  assert.strictEqual(unchecked.json.error.message, "docs/progress.md:11: phase s1a is done, so task domain must be checked: '- [x]'");
  const missing = ospec(root, "snapshot", "--schema-version", "2", "--progress", "nope.md", "--out", "snapshot.json");
  assert.strictEqual(missing.code, 1);
  assert.match(missing.stderr, /^ospec: progress file not found: nope\.md \(progress-missing\)\n/);
  assert.ok(!fs.existsSync(path.join(root, "snapshot.json")));
});

// E5.12 the v3: the delivery stage of each done phase, from the changelog.
function snapshotV3Project(t, changelog) {
  const root = snapshotV2Project(t, SNAPSHOT_V2_PROGRESS);
  writeFile(root, "idd/config.yaml", "delivery:\n  changelog: CHANGELOG.md\n");
  if (changelog !== undefined) writeFile(root, "CHANGELOG.md", changelog);
  return root;
}

const SNAPSHOT_V3_CHANGELOG = "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-03\n\n### Added\n- The platform (s1a-platform)\n";

test("[REQ-idd-026] snapshot --schema-version 3 prints the v2 with the delivery stage of each done phase", (t) => {
  const root = snapshotV3Project(t, SNAPSHOT_V3_CHANGELOG);
  for (const args of [["snapshot", "--schema-version", "3"], ["snapshot", "--schema-version", "3", "--json"]]) {
    const result = ospec(root, ...args);
    assert.strictEqual(result.code, 0, result.stderr);
    const v2 = JSON.parse(ospec(root, "snapshot", "--schema-version", "2").stdout);
    v2.schemaVersion = 3;
    v2.phases[0].release = { stage: "production", version: "1.0.0", date: "2026-01-03" };
    assert.strictEqual(result.stdout, `${JSON.stringify(v2, null, 2)}\n`);
  }
  // Still unreleased, the phase is in testing; without a changelog it has no stage.
  writeFile(root, "CHANGELOG.md", "## [Unreleased]\n\n- The platform (s1a-platform)\n");
  assert.deepStrictEqual(JSON.parse(ospec(root, "snapshot", "--schema-version", "3").stdout).phases[0].release, { stage: "testing" });
  fs.rmSync(path.join(root, "CHANGELOG.md"));
  assert.strictEqual(JSON.parse(ospec(root, "snapshot", "--schema-version", "3").stdout).phases[0].release, undefined);
});

test("[REQ-idd-026] snapshot v3 --out reports the changelog it read", (t) => {
  const root = snapshotV3Project(t, SNAPSHOT_V3_CHANGELOG);
  const result = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json");
  assert.strictEqual(result.code, 0, result.stderr);
  const bytes = Buffer.byteLength(fs.readFileSync(path.join(root, "snapshot.json"), "utf8"));
  assert.strictEqual(result.stdout, `snapshot v3: 3 phases from docs/roadmap.md, docs/progress.md and CHANGELOG.md written to snapshot.json (${bytes} bytes)\n`);
  const json = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json", "--json").json;
  assert.deepStrictEqual(json, { ok: true, command: "snapshot", schema_version: 3, roadmap: "docs/roadmap.md", out: "snapshot.json", phases: 3, bytes, progress: "docs/progress.md", changelog: "CHANGELOG.md" });
  fs.rmSync(path.join(root, "CHANGELOG.md"));
  assert.strictEqual(ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json", "--json").json.changelog, null);
});

test("[REQ-idd-026] snapshot v3 refuses a changelog that cannot decide a stage, or an unreadable configuration, writing nothing", (t) => {
  const root = snapshotV3Project(t, SNAPSHOT_V3_CHANGELOG.replace(" - 2026-01-03", ""));
  const undated = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json", "--json");
  assert.strictEqual(undated.code, 1);
  assert.strictEqual(undated.json.error.code, "changelog-invalid");
  assert.strictEqual(undated.json.error.message, "CHANGELOG.md:5: version 1.0.0 needs its date: '## [1.0.0] - YYYY-MM-DD'");
  assert.match(undated.json.error.how, /## \[Unreleased\]/);
  writeFile(root, "CHANGELOG.md", "## [Unreleased]\n- The platform (s1a-platform)\n## [1.0.0] - 2026-01-03\n- The platform (s1a-platform)\n");
  const twice = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json");
  assert.strictEqual(twice.code, 1);
  assert.match(twice.stderr, /^ospec: CHANGELOG\.md:4: the entry of change s1a-platform sits under the heading of line 3, and the one of line 2 under the heading of line 1 \(changelog-invalid\)\n/);
  writeFile(root, "idd/config.yaml", "delivery:\n  changelog: /etc/changes.md\n");
  const config = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json");
  assert.strictEqual(config.code, 1);
  assert.match(config.stderr, /\(config-invalid\)/);
  assert.ok(!fs.existsSync(path.join(root, "snapshot.json")));
  // The v2 reads neither.
  assert.strictEqual(ospec(root, "snapshot", "--schema-version", "2").code, 0);
});

// E5.13 the v4: the documentation of the project, with the decisions of its ADRs.
const SNAPSHOT_V4_PROGRESS = `${SNAPSHOT_V2_PROGRESS}\n## Problem\n\nClients ask how it goes.\n\n## Decisions\n\n### 0001. A web app\n\nNothing to install.\n`;

function snapshotV4Project(t) {
  const root = snapshotV3Project(t, SNAPSHOT_V3_CHANGELOG);
  writeFile(root, "docs/roadmap.md", SNAPSHOT_V2_ROADMAP.replace("| Change | Content |\n| --- | --- |\n| S1a. Platform | x |", "| Change | Content | ADRs |\n| --- | --- | --- |\n| S1a. Platform | x | 0001 |"));
  writeFile(root, "docs/progress.md", SNAPSHOT_V4_PROGRESS);
  writeFile(root, "docs/architecture/decisions/0001-web-app.md", "# 0001. Web application\n\n- Status: accepted\n- Date: 2026-01-02\n");
  writeFile(root, "docs/architecture/decisions/0002-native-app.md", "# 0002. Native application\n\n- Status: rejected\n");
  return root;
}

test("[REQ-idd-026] snapshot --schema-version 4 prints the v3 with the documentation and the decisions", (t) => {
  const root = snapshotV4Project(t);
  const outputs = [["snapshot", "--schema-version", "4"], ["snapshot", "--schema-version", "4", "--json"]].map((args) => ospec(root, ...args));
  for (const result of outputs) assert.strictEqual(result.code, 0, result.stderr);
  assert.strictEqual(outputs[1].stdout, outputs[0].stdout);
  const { problem, decisions, ...rest } = JSON.parse(outputs[0].stdout);
  assert.strictEqual(problem, "Clients ask how it goes.");
  assert.deepStrictEqual(decisions, [{ number: 1, title: "A web app", date: "2026-01-02", status: "accepted", reason: "Nothing to install.", phases: ["s1a"] }]);
  // The v3 refuses the documentation sections; without them it is the rest of the v4.
  assert.strictEqual(ospec(root, "snapshot", "--schema-version", "3").code, 1);
  writeFile(root, "docs/progress.md", SNAPSHOT_V2_PROGRESS);
  assert.deepStrictEqual(rest, { ...JSON.parse(ospec(root, "snapshot", "--schema-version", "3").stdout), schemaVersion: 4 });
});

test("[REQ-idd-026] snapshot v4 --out reports the ADR directory it read, and refuses a decision without its reason, writing nothing", (t) => {
  const root = snapshotV4Project(t);
  const result = ospec(root, "snapshot", "--schema-version", "4", "--out", "snapshot.json");
  assert.strictEqual(result.code, 0, result.stderr);
  const bytes = Buffer.byteLength(fs.readFileSync(path.join(root, "snapshot.json"), "utf8"));
  assert.strictEqual(result.stdout, `snapshot v4: 3 phases from docs/roadmap.md, docs/progress.md, CHANGELOG.md and docs/architecture/decisions written to snapshot.json (${bytes} bytes)\n`);
  const json = ospec(root, "snapshot", "--schema-version", "4", "--out", "snapshot.json", "--json").json;
  assert.deepStrictEqual(json, {
    ok: true,
    command: "snapshot",
    schema_version: 4,
    roadmap: "docs/roadmap.md",
    out: "snapshot.json",
    phases: 3,
    bytes,
    progress: "docs/progress.md",
    changelog: "CHANGELOG.md",
    decisions: "docs/architecture/decisions",
  });
  fs.rmSync(path.join(root, "snapshot.json"));
  writeFile(root, "docs/progress.md", SNAPSHOT_V4_PROGRESS.split("\n## Decisions")[0]);
  const reasonless = ospec(root, "snapshot", "--schema-version", "4", "--out", "snapshot.json", "--json");
  assert.strictEqual(reasonless.code, 1);
  assert.strictEqual(reasonless.json.error.code, "decisions-invalid");
  assert.strictEqual(reasonless.json.error.message, "docs/architecture/decisions/0001-web-app.md:3: ADR 0001 is accepted and has no reason for the client");
  assert.match(reasonless.json.error.how, /'## Decisions' section of docs\/progress\.md, or mark it '- internal'/);
  assert.ok(!fs.existsSync(path.join(root, "snapshot.json")));
});

test("[REQ-idd-026] no IDD step, hook or check runs snapshot", () => {
  for (const file of ["skills/idd/SKILL.md", "hooks/hooks.json", "idd/config.yaml"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), /ospec(\.js)?["']? snapshot/, file);
  }
});

// E4.15 cli-chaining: the CLI chains what it already knows (REQ-idd-011,
// REQ-idd-014).
// ---------------------------------------------------------------------------

const PAGES_TEST = [
  "const test = require('node:test');",
  "const assert = require('node:assert');",
  "const pages = require('../src/pages.js');",
  "test('ten items fill one page', () => assert.strictEqual(pages(10), 1));",
].join("\n");

// A project whose only check runs its tests, as a bench project has. Its
// `node --test` runs outside this runner: NODE_TEST_CONTEXT would make it report
// to the parent and exit 0 on a failing test.
const OWN_TEST_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT"));

function chain(root, ...args) {
  return ospecWith(OWN_TEST_ENV, root, ...args);
}

function chainProject(t) {
  const root = tempRoot(t);
  const git = gitInit(root);
  writeFile(root, "src/pages.js", "module.exports = (items) => Math.floor(items / 10);\n");
  writeFile(root, "test/pages.test.js", `${PAGES_TEST}\n`);
  writeFile(root, "idd/config.yaml", "checks:\n  test: node --test\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "base");
  return { root, git };
}

const OPEN_PAGES = ["record", "intent", "--change", "fix-pages", "--kind", "bug", "--summary", "Count the last partial page.", "--acceptance", "Eleven items need two pages.", "--no-open-facts", "--basis", "A partial page is a page.", "--path", "src/pages.js", "--path", "test/pages.test.js"];
const RED_PAGES = "test('eleven items need two pages', () => assert.strictEqual(pages(11), 2));\n";

// The red run of the reproduction test, the fix and the green run.
function redGreen(root, command = "node --test") {
  const run = () => chain(root, "run", "--change", "fix-pages", "--obligation", "repro-test", "--command", command, "--json");
  fs.appendFileSync(path.join(root, "test/pages.test.js"), RED_PAGES);
  const red = run();
  writeFile(root, "src/pages.js", "module.exports = (items) => Math.ceil(items / 10);\n");
  return { red, green: run() };
}

test("[REQ-idd-011] record intent declares the plan in the same write, as intent then signals would (E4.15)", (t) => {
  const { root } = chainProject(t);
  const plan = ["--path", "src/pages.js", "--path", "test/pages.test.js", "--work-units", "2"];
  const chained = ospec(root, ...OPEN_PAGES, "--work-units", "2", "--json");
  assert.strictEqual(chained.code, 0, chained.stderr);
  assert.deepStrictEqual(chained.json.plan.added, { signals: ["bug-fix", "multi-unit-or-decision"] });
  assert.strictEqual(chained.json.next.next_step.obligation, "repro-test", "the plan is declared");

  const long = OPEN_PAGES.slice(0, OPEN_PAGES.indexOf("--path")).map((arg) => (arg === "fix-pages" ? "fix-twice" : arg));
  ospec(root, ...long);
  ospec(root, "signals", "--change", "fix-twice", ...plan);
  const declared = (change) => {
    const { plan: declaredPlan, signals, gates, obligations } = stateOf(root, change);
    return { declaredPlan, signals, gates, obligations };
  };
  assert.deepStrictEqual(declared("fix-pages"), declared("fix-twice"));

  const text = ospec(root, ...OPEN_PAGES, "--work-units", "2");
  assert.strictEqual(text.code, 0, text.stderr);
  assert.match(text.stdout, /^no change: intent already recorded on fix-pages; the plan and every derived signal were already recorded; floor [a-z]+\nmemory query: .+\nnext \(repro-test\): ospec run --change fix-pages /);
});

test("[REQ-idd-011] record intent writes neither the intent nor the plan when it refuses either (E4.15)", (t) => {
  const { root } = chainProject(t);
  const ambiguous = ospec(root, "record", "intent", "--change", "fix-pages", "--ambiguous", "--request", "pages are off", "--path", "src/pages.js", "--json");
  assert.deepStrictEqual([ambiguous.code, ambiguous.json.error.code], [2, "usage"]);
  assert.match(ambiguous.json.error.message, /an ambiguous intent declares no plan/);

  const unknown = ospec(root, ...OPEN_PAGES, "--adr", "0099", "--json");
  assert.deepStrictEqual([unknown.code, unknown.json.error.code], [1, "unknown-reference"]);
  const undeclared = ospec(root, ...OPEN_PAGES.filter((arg, index, args) => !["--no-open-facts", "--basis"].includes(arg) && args[index - 1] !== "--basis"), "--json");
  assert.deepStrictEqual([undeclared.code, undeclared.json.error.code], [1, "facts-undeclared"]);
  const units = ospec(root, ...OPEN_PAGES, "--work-units", "0", "--json");
  assert.strictEqual(units.code, 2);
  assert.ok(!fs.existsSync(path.join(root, "idd", "fix-pages", "state.yaml")), "nothing is written");
});

test("[REQ-idd-011] every command that writes a change returns the next ospec next gives (E4.15)", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node verify.js\ndelivery:\n  branching: serial\n" });
  const same = (result, label) => {
    assert.strictEqual(result.code, 0, `${label}: ${result.stderr}`);
    // E4.16: it leaves out the intent, which ospec next keeps.
    const { ok, command, intent, ...next } = ospec(root, "next", "--change", "fix-pagination", "--json").json;
    assert.deepStrictEqual([ok, command, intent.kind], [true, "next", "bug"]);
    assert.deepStrictEqual(result.json.next, next, label);
    return result;
  };
  const opened = same(ospec(root, ...OPEN_BUG), "record intent").json.next;
  assert.deepStrictEqual([opened.next_step.action, opened.delivery.branching], ["declare-plan", "serial"]);
  same(ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt", "--json"), "signals");
  same(ospec(root, "record", "assumption", "--change", "fix-pagination", "--text", "Pages count from one.", "--json"), "record assumption");
  const repro = ["run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node ./verify.js", "--json"];
  same(ospec(root, ...repro), "red run");
  writeFile(root, "src/pages.txt", "2");
  same(ospec(root, ...repro), "green run");
  assert.strictEqual(same(ospec(root, "check", "--change", "fix-pagination", "--json"), "check").json.next.next_step.action, "close");
});

test("[REQ-idd-014] a bugfix closes with four calls: intent with its plan, the red and green runs of the check, and close (E4.15)", (t) => {
  const { root } = chainProject(t);
  const opened = ospec(root, ...OPEN_PAGES, "--json");
  assert.strictEqual(opened.json.next.next_step.command, 'ospec run --change fix-pages --obligation repro-test --command "<test>"');
  const { red, green } = redGreen(root);
  assert.deepStrictEqual([red.code, red.json.run.exit_code, red.json.check.name, red.json.check.evidence], [0, 1, "test", undefined]);
  assert.strictEqual(green.code, 0, green.stderr);
  assert.strictEqual(green.json.verdict, "ready", JSON.stringify(green.json.missing));
  assert.deepStrictEqual(green.json.next.next_step, { action: "close", command: "ospec close --change fix-pages" });
  assert.match(chain(root, "run", "--change", "fix-pages", "--obligation", "repro-test", "--command", "node --test").stdout, /^counted as check test \(run-\d+\): recorded evidence ev-\d+$/m);
  const closed = ospec(root, "close", "--change", "fix-pages", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
});

test("[REQ-idd-014] a run of the only check leaves the evidence ospec check leaves on the same tree (E4.15)", (t) => {
  const { root } = pagesFeature(t);
  const viaRun = stateOf(root, "add-pages");
  const checked = chain(root, "check", "--change", "add-pages", "--json");
  assert.deepStrictEqual([checked.json.verdict, checked.json.added], ["ready", undefined], "the run recorded what the diff derives");
  const viaCheck = stateOf(root, "add-pages");
  const proof = (state, obligation) => {
    const entry = state.obligations.find((item) => item.id === obligation);
    const evidence = state.evidence.find((item) => item.id === entry.evidence.at(-1));
    const runs = (evidence.detail.runs || [evidence.detail.run]).map((id) => state.runs.find((run) => run.id === id));
    return {
      status: entry.status,
      kind: evidence.kind,
      tree: evidence.detail.tree,
      tests: evidence.detail.tests,
      runs: runs.map((run) => ({ purpose: run.purpose, name: run.name, command: run.command, exit_code: run.exit_code, tree: run.tree, tests: run.tests })),
    };
  };
  assert.deepStrictEqual(proof(viaRun, "checks-pass"), proof(viaCheck, "checks-pass"));
  const statuses = (state) => state.obligations.map(({ id, status }) => `${id} ${status}`);
  assert.deepStrictEqual([statuses(viaRun), viaRun.signals, viaRun.gates], [statuses(viaCheck), viaCheck.signals, viaCheck.gates]);
});

test("[REQ-idd-014] a failing run of the only check returns checks-pass to pending, as a failing check does (E4.15)", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node gate.js\n" });
  writeFile(root, "gate.js", "process.exit(process.env.OSPEC_GATE_FAIL ? 1 : 0);\n");
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "gate.js");
  const checksPass = () => stateOf(root, "fix-pagination").obligations.find((entry) => entry.id === "checks-pass").status;
  ospec(root, "check", "--change", "fix-pagination");
  assert.strictEqual(checksPass(), "satisfied");

  const run = ["run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node gate.js", "--json"];
  const red = ospecWith({ ...process.env, OSPEC_GATE_FAIL: "1" }, root, ...run);
  assert.strictEqual(checksPass(), "pending", "the same tree, failing now");
  assert.deepStrictEqual(red.json.missing.find((entry) => entry.obligation === "checks-pass").reason, "check test failed with exit code 1");
  ospec(root, ...run);
  assert.strictEqual(checksPass(), "satisfied");
});

test("[REQ-idd-014] a run counts as the check only for the exact command of a single declared check (E4.15)", (t) => {
  const { root } = project(t);
  writeFile(root, "src/pages.txt", "2");
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt");
  const run = (command) => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", command, "--json").json;
  assert.strictEqual(run(" node verify.js ").check.name, "test", "spaces at the ends do not count");
  assert.strictEqual(run("node  verify.js").check, undefined);
  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\n  lint: node -e 0\n");
  const runs = stateOf(root, "fix-pagination").runs.length;
  assert.strictEqual(run("node verify.js").check, undefined, "one of several checks");
  assert.strictEqual(stateOf(root, "fix-pagination").runs.length, runs + 1);
});

test("[REQ-idd-014] what check refuses leaves the run of the check a test run, with a warning (E4.15)", (t) => {
  const { root } = project(t);
  const cover = [...FEATURE_COVER];
  cover.splice(cover.indexOf("persistence=fixes every behavior") - 1, 2, "--cite", "persistence=verify.js:1");
  openFeature(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...cover);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name);\n");
  ospec(root, "signals", "--change", "add-index", "--diff");
  const ran = ospec(root, "run", "--change", "add-index", "--obligation", "migration-compat-and-test", "--command", "node verify.js", "--plan", "additive index", "--json");
  assert.strictEqual(ran.code, 0, ran.stderr);
  assert.ok(ran.json.evidence, "the migration test is recorded");
  assert.strictEqual(ran.json.check, undefined);
  assert.match(ran.json.warnings[0], /^not counted as check test: persistence=verify\.js:1 cites a file that is neither in the plan nor in the diff; ospec signals --change add-index --path verify\.js/);
  assert.ok(!stateOf(root, "add-index").runs.some((entry) => entry.purpose === "checks"));
});

test("[REQ-idd-022] a run that counts as the check leaves the fitness checks to ospec check (E4.15)", (t) => {
  const { root } = fitnessProject(t);
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX orders_placed ON orders (placed_at);\n");
  assert.strictEqual(ospec(root, "check", "--change", "order-events", "--json").json.missing[0].obligation, "migration-compat-and-test");
  const fitnessRuns = () => stateOf(root, "order-events").runs.filter((entry) => entry.purpose === "fitness").length;
  const before = fitnessRuns();
  const migrate = () => ospec(root, "run", "--change", "order-events", "--obligation", "migration-compat-and-test", "--command", "node verify.js", "--plan", "additive index", "--json");

  const sameTree = migrate();
  assert.strictEqual(sameTree.json.check.name, "test");
  assert.ok(!(sameTree.json.missing || []).some((entry) => entry.obligation === "adr-impact-declaration"), "the check of this tree ran its fitness checks");

  writeFile(root, "src/core.js", "module.exports = 3;\n");
  const moved = migrate();
  const impact = moved.json.missing.find((entry) => entry.obligation === "adr-impact-declaration");
  assert.strictEqual(impact.reason, "its fitness checks run only in ospec check: ospec check --change order-events");
  assert.strictEqual(fitnessRuns(), before, "a run runs no fitness check");
  assert.strictEqual(moved.json.next.next_step.command, "ospec check --change order-events --close");

  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.ok(!checked.json.missing.some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(checked.json.missing));
  assert.strictEqual(fitnessRuns(), before + 1);
});

test("[REQ-idd-014] check --close closes a ready change in the same call and refuses as close otherwise (E4.15)", (t) => {
  const { root, git } = project(t);
  ospec(root, ...OPEN_DOCS);
  const refused = ospec(root, "check", "--change", "fix-readme", "--close", "--json");
  assert.deepStrictEqual([refused.code, refused.json.ok, refused.json.error], [
    1,
    false,
    { code: "close-refused", message: "close refused: the check answered missing (checks-pass)", how: "ospec check --change fix-readme --close" },
  ]);
  assert.strictEqual(refused.json.check.missing[0].reason, "check test failed with exit code 1");
  assert.deepStrictEqual(stateOf(root, "fix-readme").runs.map((run) => run.exit_code), [1], "the check stays recorded");
  const text = ospec(root, "check", "--change", "fix-readme", "--close");
  assert.strictEqual(text.code, 1);
  assert.match(text.stdout, /^missing checks-pass: check test failed with exit code 1$/m);
  assert.strictEqual(text.stderr, "ospec: close refused: the check answered missing (checks-pass) (close-refused)\nospec check --change fix-readme --close\n");

  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\n  smoke: node -e 0\n");
  const gated = ospec(root, "check", "--change", "fix-readme", "--close", "--json");
  assert.deepStrictEqual([gated.code, gated.json.error.message], [1, "close refused: the check answered needs-decision (gate checks-changed)"]);
  const approved = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, add smoke.", "--source", "user");
  assert.strictEqual(approved.code, 0, approved.stderr);

  const closed = ospec(root, "check", "--change", "fix-readme", "--close", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
  assert.deepStrictEqual([closed.json.verdict, closed.json.close.status, closed.json.next], ["ready", "closed", undefined]);
  assert.ok(fs.existsSync(path.join(root, closed.json.close.archive.destination, "state.yaml")));
  assert.ok(!fs.existsSync(path.join(root, "idd", "fix-readme")));

  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "smoke");
  ospec(root, ...OPEN_DOCS.map((arg) => (arg === "fix-readme" ? "fix-typo" : arg)));
  writeFile(root, "notes.txt", "typo fixed\n");
  const closedText = ospec(root, "check", "--change", "fix-typo", "--close");
  assert.strictEqual(closedText.code, 0, closedText.stderr);
  assert.match(closedText.stdout, /^ready: fix-typo can close\n[^]*\nfix-typo closed and archived in idd\/archive\/\d{4}-\d{2}-\d{2}-fix-typo /);
});

// A feature of the pages project under strict TDD, answered and built red to
// green with the command of its only check: five calls.
function pagesFeature(t) {
  const { root, git } = chainProject(t);
  writeFile(root, "idd/config.yaml", "strict_tdd: true\nchecks:\n  test: node --test\n");
  git("commit", "-q", "--no-verify", "-am", "strict");
  const opened = ospec(root, "record", "intent", "--change", "add-pages", "--kind", "feature", "--summary", "Count the last partial page.", "--acceptance", "Eleven items need two pages.", ...FEATURE_COVER, "--path", "src/pages.js", "--path", "test/pages.test.js", "--json");
  assert.strictEqual(opened.json.next.next_step.action, "resolve-gate");
  const answered = ospec(root, "record", "gate", "--change", "add-pages", "--gate", "open-facts", "--resolve", "--answer", "Yes, above 100 is refused.", "--source", "user", "--json");
  assert.strictEqual(answered.json.next.next_step.obligation, "tdd-red-green");
  const run = () => chain(root, "run", "--change", "add-pages", "--obligation", "tdd-red-green", "--unit", "pages", "--command", "node --test", "--json");
  fs.appendFileSync(path.join(root, "test/pages.test.js"), RED_PAGES);
  assert.strictEqual(run().json.run.exit_code, 1);
  writeFile(root, "src/pages.js", "module.exports = (items) => Math.ceil(items / 10);\n");
  return { root, green: run() };
}

test("[REQ-idd-014] a feature with one question closes with five calls: intent, the answer, the red and green runs and close (E4.15)", (t) => {
  const { root, green } = pagesFeature(t);
  assert.strictEqual(green.json.verdict, "ready", JSON.stringify(green.json.missing));
  const closed = ospec(root, "close", "--change", "add-pages", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
});

// E4.16 cli-terse-output: the next of a new change prints the template of the
// categories the project covers, so the record intent refusals reproduced
// from idd-7 had it before failing; a project with code and no UI covers five.
const CLI_FEATURE = ["record", "intent", "--change", "add-priority", "--kind", "feature", "--summary", "Tasks take a priority.", "--acceptance", "add --priority high stores it.", "--request", "Las tareas tienen prioridad"];
const CORE_ASKED = [
  "inputs:¿Qué prioridad recibe una tarea creada sin --priority?",
  'uniqueness:¿"High" y "high" son la misma prioridad?',
  'persistence:¿Una prioridad desconocida en tasks.json se lee como "normal"?',
  'copy:¿La lista muestra la prioridad como "[alta]"?',
  "errors:¿--priority urgente sale con código 2?",
].flatMap((fact) => ["--open-fact", fact]);

test("[REQ-idd-018] the next of a new change prints the categories of the project's profile (E4.16)", (t) => {
  const root = tempRoot(t);
  const git = gitInit(root);
  writeFile(root, "src/tasks.js", "module.exports = [];\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "base");
  const next = ospec(root, "next", "--json").json.next_step;
  assert.strictEqual(next.action, "open-change");
  assert.deepStrictEqual(next.feature.categories, ["inputs", "uniqueness", "persistence", "copy", "errors"]);
  assert.deepStrictEqual(next.feature.omitted, ["url-state", "accessibility"]);
  assert.match(next.feature.command, /--kind feature [^]*--open-fact inputs:"<question>" --open-fact uniqueness:"<question>"/);
  const text = ospec(root, "next").stdout;
  assert.ok(text.includes(`feature: ${next.feature.command}\n`), text);
  assert.match(text, /left out: url-state, accessibility \(the project has code and no UI file/);

  // The idd-7 refusals: no category, a category of its own, one twice and the
  // plain form; each prints the template next gave before failing.
  for (const facts of [
    ["--open-fact", "¿Qué prioridad recibe una tarea creada sin --priority?"],
    ["--open-fact", "Base del porcentaje:¿se aplica sobre 100 o sobre el subtotal?"],
    ["--open-fact", "inputs:¿Qué prioridad recibe una tarea sin --priority?", "--open-fact", "inputs:¿Se admite --priority 0?"],
    ["--no-open-facts", "--basis", "the request settles it"],
  ]) {
    const refused = ospec(root, ...CLI_FEATURE, ...facts, "--json");
    assert.strictEqual(refused.json.error.code, "facts-undeclared", facts.join(" "));
    assert.ok(refused.json.error.how.startsWith(next.feature.command), refused.json.error.how);
  }
  // The regulated refusal: without url-state and accessibility the change opens.
  const opened = ospec(root, ...CLI_FEATURE, ...CORE_ASKED, "--json");
  assert.strictEqual(opened.code, 0, opened.stdout);
  assert.deepStrictEqual(stateOf(root, "add-priority").facts.coverage.map((entry) => entry.category), ["inputs", "uniqueness", "persistence", "copy", "errors"]);

  // A UI file in the plan, or in the project, asks all seven.
  const withUi = ospec(root, ...CLI_FEATURE.map((arg) => (arg === "add-priority" ? "priority-badge" : arg)), ...CORE_ASKED, "--path", "src/badge.tsx", "--json");
  assert.strictEqual(withUi.json.error.message, "a feature must cover url-state, accessibility");
  const web = tempRoot(t);
  writeFile(web, "src/tasks.js", "module.exports = [];\n");
  writeFile(web, "public/index.html", "<main></main>\n");
  const webNext = ospec(web, "next", "--json").json.next_step.feature;
  assert.deepStrictEqual([webNext.categories.length, webNext.omitted], [7, undefined]);
  assert.strictEqual(ospec(tempRoot(t), "next", "--json").json.next_step.feature.categories.length, 7, "a project without code");
});

// E4.16: the CLI writes the Plan of change.md from --path and its Decisions
// from --decision "<text>", so a change with a decision closes without a hand
// edit; --decision without its text is a usage error.
test("[REQ-idd-004] a change with a decision closes without editing change.md (E4.16)", (t) => {
  const { root } = chainProject(t);
  const bare = ospec(root, ...OPEN_PAGES, "--decision", "--json");
  assert.deepStrictEqual([bare.code, bare.json.error.code], [2, "usage"]);
  assert.strictEqual(ospec(root, ...OPEN_PAGES, "--decision", " ", "--json").code, 2);
  assert.ok(!fs.existsSync(path.join(root, "idd", "fix-pages")), "nothing is written");

  const opened = ospec(root, ...OPEN_PAGES, "--decision", "A partial page counts as a page.", "--json");
  assert.strictEqual(opened.code, 0, opened.stdout);
  assert.deepStrictEqual(stateOf(root, "fix-pages").plan.decisions, ["A partial page counts as a page."]);
  const doc = fs.readFileSync(path.join(root, "idd", "fix-pages", "change.md"), "utf8");
  assert.match(doc, /## Plan\n\n<!-- ospec:plan:start -->\n- Files: `src\/pages\.js`, `test\/pages\.test\.js`\n<!-- ospec:plan:end -->\n/);
  assert.match(doc, /## Decisions\n\n<!-- ospec:decisions:start -->\n- A partial page counts as a page\.\n<!-- ospec:decisions:end -->\n/);
  const { green } = redGreen(root);
  assert.strictEqual(green.json.verdict, "ready", JSON.stringify(green.json.missing));
  const closed = ospec(root, "close", "--change", "fix-pages", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
  assert.deepStrictEqual(closed.json.records.map((record) => record.summary), ["A partial page counts as a page."]);
});

test("[REQ-idd-004] a change of several units without a decision closes with empty Decisions (E4.16)", (t) => {
  const { root } = chainProject(t);
  assert.strictEqual(ospec(root, ...OPEN_PAGES, "--work-units", "2").code, 0);
  const { green } = redGreen(root);
  assert.strictEqual(green.json.verdict, "ready", JSON.stringify(green.json.missing));
  assert.strictEqual(ospec(root, "close", "--change", "fix-pages").code, 0);
});

// E4.16: every command that writes prints a status line and the next, with
// what that step needs, within a ceiling of bytes; --json leaves out null, []
// and {} and the intent of the next. The ceilings are about 1.3 times the
// sizes E4.16 measured (190, 180, 124, 872 and 830 bytes of text); v2.161.0
// printed 518, 500, 347, 2380 and 2308.
const TEXT_CEILINGS = Object.freeze({ intent: 256, signals: 256, assumption: 192, green: 1152, check: 1152 });
const JSON_CEILINGS = Object.freeze({ intent: 1600, signals: 1400, assumption: 1024, green: 4608, check: 4736 });

function emptyFields(value, at = "$") {
  if (value === null || typeof value !== "object") return [];
  if (!Array.isArray(value) && Object.keys(value).length === 0) return [at];
  return Object.entries(value).flatMap(([key, entry]) =>
    entry === null || (typeof entry === "object" && Object.keys(entry).length === 0) ? [`${at}.${key}`] : emptyFields(entry, `${at}.${key}`),
  );
}

test("[REQ-idd-011] each command that writes prints a status line and its next within a byte ceiling (E4.16)", (t) => {
  for (const json of [false, true]) {
    const { root } = chainProject(t);
    const flag = json ? ["--json"] : [];
    const runPages = () => chain(root, "run", "--change", "fix-pages", "--obligation", "repro-test", "--command", "node --test", ...flag);
    const outputs = { intent: ospec(root, ...OPEN_PAGES, ...flag) };
    outputs.signals = ospec(root, "signals", "--change", "fix-pages", "--path", "src/pages.js", ...flag);
    outputs.assumption = ospec(root, "record", "assumption", "--change", "fix-pages", "--text", "Pages count from one.", ...flag);
    fs.appendFileSync(path.join(root, "test/pages.test.js"), RED_PAGES);
    const red = runPages();
    writeFile(root, "src/pages.js", "module.exports = (items) => Math.ceil(items / 10);\n");
    outputs.green = runPages();
    outputs.check = ospec(root, "check", "--change", "fix-pages", ...flag);
    for (const [label, result] of Object.entries(outputs)) {
      assert.strictEqual(result.code, 0, `${label}: ${result.stderr}`);
      const bytes = Buffer.byteLength(result.stdout);
      assert.ok(bytes <= (json ? JSON_CEILINGS : TEXT_CEILINGS)[label], `${label}${json ? " --json" : ""}: ${bytes} bytes\n${result.stdout}`);
      if (json) {
        assert.deepStrictEqual(emptyFields(result.json), [], label);
        assert.strictEqual(result.json.next.intent, undefined, `${label}: the next leaves out the intent`);
        assert.ok(result.json.next.next_step.command, label);
      } else {
        assert.match(result.stdout, /^.+\n(?:memory query: .+\n)?(?:.+\n)*?next \(\S+\): ospec /, label);
        assert.doesNotMatch(result.stdout, /^(?:pending|refs|team|branching|changelog|release)(?: rules)?: /m, label);
      }
    }
    if (!json) {
      // A failing run prints its status, its output and the next.
      assert.match(red.stdout, /^run-1: exit 1; no evidence recorded by this run\n {2}/);
      assert.match(red.stdout, /\nnext \(repro-test\): ospec run --change fix-pages --obligation repro-test --command "node --test"\n$/);
      assert.match(outputs.check.stdout, /^ready: fix-pages can close\nran: check test exit 0\nnext \(close\): ospec close --change fix-pages\n/);
    }
  }
});
