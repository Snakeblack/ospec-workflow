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
const {
  CLI,
  tempRoot,
  ospecWith,
  ospec,
  assertGateStep,
  OPEN_BUG,
  FEATURE_COVER,
  openFeature,
  gitInit,
  writeFile,
  VERIFY,
  project,
  stateOf,
  OPEN_DOCS,
  DECLARED_DELIVERY,
} = require("./lib/test-support/ospec-cli.js");

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

// The remedy of signal-not-recorded sent the agent to ospec signals, which
// writes, and neither status nor next listed the recorded signals.
test("status lists the signals of each change, and a retraction of one it lacks points there", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/lib/paginate.js");
  assert.deepStrictEqual(ospec(root, "status", "--change", "fix-pagination", "--json").json.changes[0].signals, ["always", "bug-fix"]);
  assert.match(ospec(root, "status").stdout, /^fix-pagination {2}open {2}bug {2}pending: repro-test, checks-pass {2}gates: - {2}signals: always, bug-fix$/m);
  const refused = ospec(root, "record", "retract", "--change", "fix-pagination", "--signal", "security-boundary", "--reason", "r", "--json");
  assert.strictEqual(refused.json.error.code, "signal-not-recorded");
  assert.strictEqual(refused.json.error.how, "retract only a signal the change has: ospec status --change fix-pagination lists them");
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
    "ospec: unknown command: frobnicate (usage)\ncommands: status, next, record, signals, check, run, review, close, abandon, doctor, registry, router, team, snapshot, foundation\n",
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

// A flag no usage line of the command names, or an answer with nothing to
// resolve, was accepted and dropped with exit 0.
test("a flag the command does not take, or an answer with nothing to resolve, is a usage error that writes nothing", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  const state = path.join(root, "idd", "fix-pagination", "state.yaml");
  const before = fs.readFileSync(state, "utf8");

  const status = ospec(root, "status", "--kind", "feature", "--json");
  assert.strictEqual(status.code, 2);
  assert.match(status.json.error.message, /^status does not take --kind/);
  assert.match(status.json.error.how, /^ {2}ospec status \[--change <id>\] \[--json\]/);
  const check = ospec(root, "check", "--change", "fix-pagination", "--path", "zzz", "--unit", "foo", "--plan", "bar", "--json");
  assert.strictEqual(check.code, 2);
  assert.match(check.json.error.message, /^check does not take --path, --unit, --plan/);

  const gate = ["record", "gate", "--change", "fix-pagination", "--gate", "irreversible-operation"];
  const opened = ospec(root, ...gate, "--open", "--reason", "purges cache", "--answer", "yes", "--source", "user", "--json");
  assert.strictEqual(opened.code, 2);
  assert.match(opened.json.error.message, /--open takes no --answer or --source/);
  assert.strictEqual(fs.readFileSync(state, "utf8"), before);
  assert.strictEqual(ospec(root, ...gate, "--open", "--reason", "purges cache").code, 0);
  const resolved = ospec(root, ...gate, "--resolve", "--answer", "yes", "--source", "user", "--reason", "why", "--json");
  assert.strictEqual(resolved.code, 2);
  assert.match(resolved.json.error.message, /--resolve takes no --reason/);
  const opening = fs.readFileSync(state, "utf8");

  const intent = ospec(root, ...OPEN_BUG, "--answer", "yes", "--source", "user");
  assert.strictEqual(intent.code, 2);
  assert.match(intent.json.error.message, /--answer and --source resolve an ambiguous intent: change fix-pagination has none/);
  const fresh = ospec(root, ...OPEN_BUG.map((word) => (word === "fix-pagination" ? "fix-sorting" : word)), "--answer", "yes", "--source", "user");
  assert.strictEqual(fresh.code, 2);
  assert.ok(!fs.existsSync(path.join(root, "idd", "fix-sorting", "state.yaml")), "a refused intent opens nothing");
  assert.strictEqual(fs.readFileSync(state, "utf8"), opening);

  // The global flags go with any command.
  assert.strictEqual(ospec(root, "status", "--json").code, 0);
});

// The skill told the agent to resolve an ambiguous intent with the same
// command plus the fields: with --ambiguous it answered "no change", exit 0,
// and the gate stayed open.
test("--ambiguous with the fields that resolve it is a usage error, and next prints the record intent that does", (t) => {
  const root = tempRoot(t);
  const open = ["record", "intent", "--change", "improve-login", "--ambiguous", "--request", "Improve the login."];
  assert.strictEqual(ospec(root, ...open).code, 0);
  const state = path.join(root, "idd", "improve-login", "state.yaml");
  const before = fs.readFileSync(state, "utf8");
  const fields = ["--kind", "bug", "--summary", "Fix the login.", "--acceptance", "It logs in.", "--no-open-facts", "--basis", "b", "--answer", "a bug", "--source", "user"];
  const looped = ospec(root, ...open, ...fields, "--json");
  assert.strictEqual(looped.code, 2);
  assert.match(looped.json.error.message, /--ambiguous takes only --request/);
  assert.strictEqual(looped.json.error.how, "resolve it with the record intent that ospec next --change improve-login prints, without --ambiguous");
  assert.strictEqual(fs.readFileSync(state, "utf8"), before);
  assert.strictEqual(ospec(root, "record", "intent", "--change", "other", "--ambiguous", "--request", "r", "--kind", "bug").code, 2);

  const command = ospec(root, "next", "--change", "improve-login", "--json").json.next_step.command;
  assert.ok(!command.includes("--ambiguous"), command);
  const resolved = ospec(root, "record", "intent", "--change", "improve-login", ...fields, "--json");
  assert.strictEqual(resolved.code, 0, resolved.stdout);
  assert.strictEqual(stateOf(root, "improve-login").gates.find((gate) => gate.id === "ambiguous-intent").status, "resolved");
});

// E1.45 (B5): a refusal that names no way out of its own takes the one its
// code has (scripts/lib/idd-refusals.js), in JSON and in text.
test("a refusal without its own how carries the one of its code", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_BUG);
  const json = ospec(root, "record", "gate", "--change", "fix-pagination", "--gate", "bogus", "--open", "--json");
  assert.strictEqual(json.code, 1);
  assert.strictEqual(json.json.error.code, "unknown-gate");
  assert.match(json.json.error.how, /ambiguous-intent, kind-change, open-facts, adr-amend-or-contradict, irreversible-operation, review-limit, checks-changed/);

  const text = ospec(root, "record", "withdraw", "--change", "fix-pagination", "--obligation", "nope", "--reason", "r");
  assert.strictEqual(text.code, 1);
  assert.match(text.stderr, /^ospec: change fix-pagination has no obligation nope \(unknown-obligation\)\n.*ospec next --change fix-pagination --json/);
});

// E1.3 impact-signals: `ospec signals` derives and records signals and gates
// from the declaration and the diff (REQ-idd-012).

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

test("an approved irreversible operation does not approve the next one, declared, opened by hand or in the diff (gate bypass)", (t) => {
  const root = tempRoot(t);
  const git = gitInit(root);
  writeFile(root, "src/customers/profile.js", "module.exports = {};\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "base");
  const approve = () => ospec(root, "record", "gate", "--change", "drop-fax", "--gate", "irreversible-operation", "--resolve", "--answer", "Approved.", "--source", "user-unverified", "--json");
  const pending = (result) => result.json.next.pending_decision;

  const opened = ospec(root, "record", "intent", "--change", "drop-fax", "--kind", "refactor", "--summary", "Drop fax.", "--acceptance", "No fax reads.", "--no-open-facts", "--basis", "The request fixes every behavior.", "--operation", "drop-column", "--operation", "rewrite-history", "--json");
  assert.strictEqual(opened.code, 0, opened.stdout);
  assert.strictEqual(pending(opened).reason, "irreversible operation: declared drop-column; declared rewrite-history");
  approve();

  const declared = ospec(root, "signals", "--change", "drop-fax", "--operation", "drop-database", "--json");
  assert.deepStrictEqual([pending(declared)?.gate, pending(declared)?.reason], ["irreversible-operation", "irreversible operation: declared drop-database"]);
  approve();

  const manual = ospec(root, "record", "gate", "--change", "drop-fax", "--gate", "irreversible-operation", "--open", "--reason", "rewrite published history", "--json");
  assert.deepStrictEqual([manual.json.changed, pending(manual)?.reason], [true, "rewrite published history"]);
  approve();

  writeFile(root, "db/migrations/003_drop_fax.sql", "ALTER TABLE customers DROP COLUMN fax_number;\n");
  const diff = ospec(root, "signals", "--change", "drop-fax", "--diff", "--json");
  assert.strictEqual(pending(diff)?.reason, "irreversible operation: DROP COLUMN in db/migrations/003_drop_fax.sql");
  approve();
  const again = ospec(root, "signals", "--change", "drop-fax", "--diff", "--operation", "drop-column", "--json");
  assert.deepStrictEqual([again.json.changed, pending(again) ?? null], [false, null]);
  assert.deepStrictEqual(stateOf(root, "drop-fax").gates.map((gate) => gate.status), ["resolved", "resolved", "resolved", "resolved"]);
});

test("an --operation outside the irreversible ids is a usage error that lists them and writes nothing (gate bypass)", (t) => {
  const root = tempRoot(t);
  const refused = ospec(root, ...OPEN_BUG, "--operation", "delete user data");
  assert.strictEqual(refused.code, 2, refused.stdout);
  assert.strictEqual(refused.json.error.code, "usage");
  assert.match(refused.json.error.message, /unknown --operation "delete user data": the irreversible operations are drop-table, drop-column, drop-schema, drop-database, truncate-table, delete-data, rewrite-history/);
  assert.match(refused.json.error.how, /ospec record gate --change fix-pagination --gate irreversible-operation --open --reason "<operation>"/);
  assert.strictEqual(fs.existsSync(path.join(root, "idd", "fix-pagination")), false);

  ospec(root, ...OPEN_BUG);
  const before = fs.readFileSync(path.join(root, "idd", "fix-pagination", "state.yaml"), "utf8");
  const signals = ospec(root, "signals", "--change", "fix-pagination", "--path", "src/a.js", "--operation", "drop-table", "--operation", "drop-users");
  assert.strictEqual(signals.code, 2, signals.stdout);
  assert.match(signals.stderr, /unknown --operation "drop-users"/);
  assert.strictEqual(fs.readFileSync(path.join(root, "idd", "fix-pagination", "state.yaml"), "utf8"), before);
  assert.match(ospec(root, "--help").stdout, /operations: drop-table, drop-column, drop-schema, drop-database, truncate-table, delete-data, rewrite-history/);
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

// REQ-idd-014: another change's commits that land behind the opening of this
// one count in its diff until the user moves its base past them.
function behindAnotherChange(t) {
  const { root, git } = project(t);
  ospec(root, ...OPEN_DOCS);
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", message);
    return git("rev-parse", "HEAD").trim();
  };
  const opened = stateOf(root, "fix-readme").base;
  commit("chore(idd): open fix-readme");
  writeFile(root, "src/paginate.js", "module.exports = 50;\n");
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "idd/archive/2026-01-02-add-paginate/state.yaml", "{}\n");
  const merged = commit("feat: paginate");
  writeFile(root, "README.md", "# Pages\n");
  return { root, git, commit, opened, merged };
}

test("[REQ-idd-014] record base moves the base past another change's commits once the user answers base-moved", (t) => {
  const { root, opened, merged } = behindAnotherChange(t);
  const close = () => ospec(root, "close", "--change", "fix-readme", "--json");

  const mismatch = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(mismatch.json.error?.code, "kind-mismatch");
  assert.match(mismatch.json.error.how, /ask the user to move the base instead: ospec record base --change fix-readme --to <rev> --reason "<why>"$/);
  const narrowed = ospec(root, "check", "--change", "fix-readme", "--base", "HEAD", "--json");
  assert.strictEqual(narrowed.json.verdict, "ready", JSON.stringify(narrowed.json));
  assert.strictEqual(close().json.error?.code, "kind-mismatch", "close reads the diff against the change's base, whatever --base the check took");

  const asked = ospec(root, "record", "base", "--change", "fix-readme", "--to", "HEAD", "--reason", "add-paginate merged behind the opening", "--json");
  assert.strictEqual(asked.code, 0, asked.stdout);
  assertGateStep(asked.json.next.next_step, "base-moved");
  const { question, questions, ...move } = asked.json.next.pending_decision;
  assert.deepStrictEqual(move, {
    gate: "base-moved",
    reason: "add-paginate merged behind the opening",
    from: opened,
    to: merged,
    commits: 2,
    paths: ["src/pages.txt", "src/paginate.js"],
    archived: ["2026-01-02-add-paginate"],
  });
  assert.match(question, /Do they all belong to other changes\?.*ospec record base --cancel/);
  assert.deepStrictEqual(questions, [
    `the base moves from ${opened} to ${merged}, past 2 commits`,
    "paths that leave the diff: src/pages.txt, src/paginate.js",
    "changes archived in between: 2026-01-02-add-paginate",
  ]);
  assert.strictEqual(stateOf(root, "fix-readme").base, opened, "nothing moves before the answer");
  assert.strictEqual(close().code, 1, "an open gate keeps the change open");
  const again = ospec(root, "record", "base", "--change", "fix-readme", "--to", merged, "--reason", "add-paginate merged behind the opening", "--json");
  assert.strictEqual(again.json.changed, false, "the same move is asked once");

  const answered = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "base-moved", "--resolve", "--answer", "Yes, they are add-paginate's.", "--source", "user", "--json");
  assert.strictEqual(answered.code, 0, answered.stdout);
  const state = stateOf(root, "fix-readme");
  assert.strictEqual(state.base, merged);
  assert.strictEqual(state.base_moves.length, 1);
  const { moved_at: movedAt, ...moved } = state.base_moves[0];
  assert.deepStrictEqual(moved, { from: opened, to: merged, reason: "add-paginate merged behind the opening" });
  assert.match(movedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.strictEqual(state.obligations.find((entry) => entry.id === "checks-pass").status, "pending", "the checks read the new diff before the change closes");
  assert.match(close().json.error.message, /checks-pass/);

  const checked = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(checked.json.verdict, "ready", JSON.stringify(checked.json));
  const closed = close();
  assert.strictEqual(closed.code, 0, closed.stdout);
});

test("[REQ-idd-014] record base refuses a commit outside the branch, and --cancel withdraws the question", (t) => {
  const { root, git, commit, opened, merged } = behindAnotherChange(t);
  const base = (...args) => ospec(root, "record", "base", "--change", "fix-readme", ...args, "--json");
  const to = (rev) => base("--to", rev, "--reason", "merged behind the opening");

  assert.strictEqual(to("no-such-ref").json.error?.code, "unknown-base");
  assert.strictEqual(to("--help").json.error?.code, "usage");
  assert.strictEqual(to(opened).json.changed, false, "the base it already has moves nothing");
  // A commit that descends from the base on a branch HEAD does not hold.
  git("stash", "-q", "--include-untracked");
  git("switch", "-q", "-c", "side");
  writeFile(root, "src/side.js", "module.exports = 1;\n");
  const side = commit("feat: side");
  git("switch", "-q", "main");
  git("stash", "pop", "-q");
  const ahead = to(side);
  assert.strictEqual(ahead.json.error?.code, "base-not-descendant");
  assert.match(ahead.json.error.how, /descends from the change's base and is HEAD or one of its ancestors/);
  // A commit of HEAD's history that does not descend from the base.
  git("switch", "-q", "--orphan", "other");
  writeFile(root, "NOTES.md", "notes\n");
  git("add", "NOTES.md");
  git("commit", "-q", "--no-verify", "-m", "other root");
  const other = git("rev-parse", "HEAD").trim();
  git("switch", "-q", "-f", "main");
  git("merge", "-q", "--no-verify", "--allow-unrelated-histories", "-m", "merge other", other);
  assert.strictEqual(to(other).json.error?.code, "base-not-descendant");

  assert.strictEqual(base("--to", "HEAD").code, 2, "a move needs its reason");
  assert.strictEqual(base("--to", "HEAD", "--reason", "r", "--cancel").code, 2);
  assert.strictEqual(base("--cancel").json.error?.code, "gate-not-open");
  const opening = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "base-moved", "--open", "--json");
  assert.strictEqual(opening.json.error?.code, "gate-managed-by-base");

  assert.strictEqual(to(merged).json.next.pending_decision.to, merged);
  // Another target replaces the one still asked.
  const head = git("rev-parse", "HEAD").trim();
  assert.strictEqual(to("HEAD").json.next.pending_decision.to, head);
  assert.strictEqual(stateOf(root, "fix-readme").gates.filter((gate) => gate.id === "base-moved").length, 1);
  const cancelled = base("--cancel");
  assert.strictEqual(cancelled.code, 0, cancelled.stdout);
  const state = stateOf(root, "fix-readme");
  assert.strictEqual(state.base, opened);
  assert.ok(!state.gates.some((gate) => gate.id === "base-moved"));
  assert.ok(!("base_moves" in state));
});

test("[REQ-idd-014] a change opened before the first commit has no base to move", (t) => {
  const root = tempRoot(t);
  ospec(root, ...OPEN_DOCS);
  const refused = ospec(root, "record", "base", "--change", "fix-readme", "--to", "HEAD", "--reason", "r", "--json");
  assert.strictEqual(refused.json.error?.code, "base-missing");
});

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

// Makes one write fail with EIO: the rename that replaces the file
// OSPEC_TEST_FAIL_RENAME names, or the writeFileSync of OSPEC_TEST_FAIL_WRITE.
const WRITE_FAILS_PRELOAD = `
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const eio = () => Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
const rename = fsp.rename;
fsp.rename = function (from, to, ...rest) {
  if (process.env.OSPEC_TEST_FAIL_RENAME && String(to).endsWith(process.env.OSPEC_TEST_FAIL_RENAME)) return Promise.reject(eio());
  return rename.call(this, from, to, ...rest);
};
const writeFileSync = fs.writeFileSync;
fs.writeFileSync = function (file, ...rest) {
  if (process.env.OSPEC_TEST_FAIL_WRITE && String(file).endsWith(process.env.OSPEC_TEST_FAIL_WRITE)) throw eio();
  return writeFileSync.call(this, file, ...rest);
};
`;

function failingWrites(t, root, failure) {
  const preload = path.join(root, "..", `${path.basename(root)}-write-fails.js`);
  fs.writeFileSync(preload, WRITE_FAILS_PRELOAD);
  t.after(() => fs.rmSync(preload, { force: true }));
  return { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(preload)}`, ...failure };
}

// close wrote the changelog inside the reducer: a state write that failed
// after it left the entry with the change open, and the next close found
// its evidence stale.
test("a close whose state write fails leaves the changelog as it was, and the next close writes it", (t) => {
  const { root } = project(t, { checks: DECLARED_DELIVERY });
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  const failed = ospecWith(failingWrites(t, root, { OSPEC_TEST_FAIL_RENAME: path.join("fix-readme", "state.yaml") }), root, "close", "--change", "fix-readme");
  assert.strictEqual(failed.code, 1, failed.stdout);
  assert.match(failed.stderr, /EIO/);
  assert.strictEqual(stateOf(root, "fix-readme").status, "open");
  assert.ok(!fs.existsSync(path.join(root, "CHANGELOG.md")), "the changelog waits for the closed state");
  const closed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
  assert.strictEqual(closed.json.changelog.written, true);
  assert.match(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), /\n- Fix a typo\. \(fix-readme\)\n/);
});

test("a close that saved the closed state but not the changelog writes the entry when it resumes", (t) => {
  const { root } = project(t, { checks: DECLARED_DELIVERY });
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  const failed = ospecWith(failingWrites(t, root, { OSPEC_TEST_FAIL_WRITE: "CHANGELOG.md" }), root, "close", "--change", "fix-readme");
  assert.strictEqual(failed.code, 1, failed.stdout);
  assert.strictEqual(stateOf(root, "fix-readme").status, "closed");
  assert.ok(!fs.existsSync(path.join(root, "CHANGELOG.md")));
  const resumed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(resumed.code, 0, resumed.stdout);
  assert.strictEqual(resumed.json.changelog.written, true);
  assert.ok(fs.existsSync(path.join(root, ...resumed.json.archive.destination.split("/"), "state.yaml")));
  const again = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(again.json.changelog.written, false, "an archived change reports the entry it wrote");
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
  // check runs npm, which writes its logs under the user's home and cache.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-npm-home-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const npmEnv = { ...process.env, HOME: home, USERPROFILE: home, npm_config_cache: path.join(home, "npm-cache") };
  assert.strictEqual(ospecWith(npmEnv, root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  assert.strictEqual(ospecWith(npmEnv, root, "close", "--change", "fix-readme", "--json").code, 0);
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
  // A base that passes its own check, as the counterproof's control needs (E1.48).
  const { root } = project(t, { checks: "checks:\n  test: node -e 0\n" });
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination");
  // The reproduction test the diff adds (E1.48), under another command than
  // the check, which a run also counts as (E4.15).
  writeFile(root, "test/pages.js", `${VERIFY}\n`);
  const run = () =>
    ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node test/pages.js", "--json");

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
  // The base still has one page; without the new test the command fails
  // another way, and the base passes its own check.
  assert.deepStrictEqual(green.json.counterproof.runs, [
    { id: "run-4", exit_code: 1 },
    { id: "run-5", exit_code: 1, control: true },
    { id: "run-6", exit_code: 0, control: true },
  ]);
  const state = stateOf(root, "fix-pagination");
  assert.strictEqual(state.obligations.find((entry) => entry.id === "repro-test").status, "satisfied");
  assert.deepStrictEqual(state.evidence[0].detail, { red: "run-2", green: "run-3", counterproof: ["run-4", "run-5", "run-6"] });
  const counterproof = state.runs.find((entry) => entry.id === "run-4");
  assert.deepStrictEqual(
    [counterproof.purpose, counterproof.obligation, counterproof.command, counterproof.base],
    ["counterproof", "repro-test", "node test/pages.js", state.base],
  );
  assert.strictEqual(green.json.next.next_step.obligation, "checks-pass");
});
