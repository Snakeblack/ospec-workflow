"use strict";

// End-to-end contract of the ospec CLI, run as a child process against a
// temporary project root: the turn fence of gates (E1.49, E1.61, E1.66),
// ospec router, the output of failing runs (#510, #511), the changelog line
// (#512), follow-ups (#513) and abandon (#409). The helpers the parts share
// are in scripts/lib/test-support/ospec-cli.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  plainRoot,
  tempRoot,
  ospecWith,
  ospec,
  assertGateStep,
  OPEN_BUG,
  writeFile,
  VERIFY,
  project,
  stateOf,
  OPEN_DOCS,
  DECLARED_DELIVERY,
  closeDocsChange,
  doctor,
} = require("./lib/test-support/ospec-cli.js");

// E1.49 gate-turn-fence (REQ-idd-008): the Stop hook counts the turn ends in
// .ospec/turns, which these tests write as the hook would.
function writeTurns(root, turn) {
  writeFile(root, ".ospec/turns", `${turn}\n`);
}

const OPEN_IRREVERSIBLE = ["record", "gate", "--change", "fix-readme", "--gate", "irreversible-operation", "--open", "--reason", "drop the old pages"];
const RESOLVE_IRREVERSIBLE = ["record", "gate", "--change", "fix-readme", "--gate", "irreversible-operation", "--resolve", "--answer", "Go ahead.", "--source", "user"];

test("[E1.49] an answer declared user before a turn ends after the gate opened is recorded user-unverified, and close names it", (t) => {
  const { root } = project(t);
  writeTurns(root, 3);
  ospec(root, ...OPEN_DOCS);
  ospec(root, ...OPEN_IRREVERSIBLE);
  assert.strictEqual(stateOf(root, "fix-readme").gates[0].opened_turn, 3);

  const resolved = ospec(root, ...RESOLVE_IRREVERSIBLE, "--json");
  assert.strictEqual(resolved.code, 0, resolved.stderr);
  assert.deepStrictEqual(resolved.json.warnings, [
    "gate irreversible-operation recorded user-unverified: no turn ended between the gate's opening and the answer; this answer stays user-unverified and close lists it; ask the next gate by ending your turn with its questions, and record its answer after the user replies",
  ]);
  const answered = stateOf(root, "fix-readme").gates[0];
  assert.deepStrictEqual(answered, {
    id: "irreversible-operation",
    status: "resolved",
    reason: "drop the old pages",
    operations: ["drop the old pages"],
    opened_turn: 3,
    answer: "Go ahead.",
    source: "user-unverified",
    resolved_at: answered.resolved_at,
    resolved_turn: 3,
    declared_source: "user",
    unverified_reason: "no turn ended between the gate's opening and the answer",
  });
  // The same answer again changes nothing, after a turn end too.
  writeTurns(root, 4);
  const again = ospec(root, ...RESOLVE_IRREVERSIBLE);
  assert.strictEqual(again.code, 0, again.stderr);
  assert.match(again.stdout, /^no change: gate already recorded on fix-readme$/m);

  // The count is never part of the change: a turn end after the check
  // leaves its evidence fresh.
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  writeTurns(root, 5);
  const closed = ospec(root, "close", "--change", "fix-readme");
  assert.strictEqual(closed.code, 0, closed.stderr);
  assert.match(closed.stdout, /^warning: gate irreversible-operation was answered user-unverified: no turn ended between the gate's opening and the answer$/m);
});

// E1.66 first-gate-turn-fence: the first gate of a repository opens before
// any turn end wrote .ospec/turns.
test("[E1.66] the first gate of a repository without .ospec/turns keeps user once a turn ended, with no warning", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  ospec(root, ...OPEN_IRREVERSIBLE);
  assert.strictEqual(stateOf(root, "fix-readme").gates[0].opened_turn, 0);
  writeTurns(root, 1);
  const resolved = ospec(root, ...RESOLVE_IRREVERSIBLE, "--json");
  assert.strictEqual(resolved.code, 0, resolved.stderr);
  assert.strictEqual(resolved.json.warnings, undefined);
  const gate = stateOf(root, "fix-readme").gates[0];
  assert.deepStrictEqual([gate.source, gate.opened_turn, gate.resolved_turn], ["user", 0, 1]);
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  const closed = ospec(root, "close", "--change", "fix-readme");
  assert.strictEqual(closed.code, 0, closed.stderr);
  assert.doesNotMatch(closed.stdout, /user-unverified/);
});

test("[E1.49] an answer after a turn end keeps user, and a gate opened before E1.49 keeps the source it is answered with", (t) => {
  const { root } = project(t);
  writeTurns(root, 3);
  ospec(root, ...OPEN_DOCS);
  ospec(root, ...OPEN_IRREVERSIBLE);
  writeTurns(root, 4);
  const resolved = ospec(root, ...RESOLVE_IRREVERSIBLE, "--json");
  assert.strictEqual(resolved.code, 0, resolved.stderr);
  assert.strictEqual(resolved.json.warnings, undefined);
  const gate = stateOf(root, "fix-readme").gates[0];
  assert.deepStrictEqual([gate.source, gate.opened_turn, gate.resolved_turn], ["user", 3, 4]);

  // A gate an earlier CLI opened carries no turn.
  ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "adr-amend-or-contradict", "--open", "--reason", "ADR 0003: the hook decides");
  const file = path.join(root, "idd", "fix-readme", "state.yaml");
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  delete state.gates[1].opened_turn;
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  const legacy = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "adr-amend-or-contradict", "--resolve", "--answer", "Amend it.", "--source", "user", "--json");
  assert.strictEqual(legacy.code, 0, legacy.stderr);
  assert.strictEqual(legacy.json.warnings, undefined);
  const amended = stateOf(root, "fix-readme").gates[1];
  assert.deepStrictEqual(amended, { id: "adr-amend-or-contradict", status: "resolved", reason: "ADR 0003: the hook decides", answer: "Amend it.", source: "user", resolved_at: amended.resolved_at });
  assert.match(amended.resolved_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "the time of the answer (E1.77)");
});

test("[E1.49] without a turn count the ambiguous intent answered user is recorded user-unverified", (t) => {
  const root = tempRoot(t);
  ospec(root, "record", "intent", "--change", "improve-login", "--ambiguous", "--request", "Improve the login.");
  const resolved = ospec(root, "record", "intent", "--change", "improve-login", "--kind", "bug", "--summary", "Fix the login redirect.", "--acceptance", "The login lands on the dashboard.", "--no-open-facts", "--basis", "The answer fixes every behavior.", "--answer", "The redirect after login.", "--source", "user");
  assert.strictEqual(resolved.code, 0, resolved.stderr);
  assert.match(resolved.stdout, /^warning: gate ambiguous-intent recorded user-unverified: no turn count in \.ospec\/turns: no end-of-turn hook ran in this workspace; this answer stays user-unverified and close lists it; install or repair the host's ospec hooks so the next answers can be verified$/m);
  const [gate] = stateOf(root, "improve-login").gates;
  assert.deepStrictEqual([gate.source, gate.declared_source, gate.opened_turn, gate.resolved_turn], ["user-unverified", "user", 0, null]);
});

// E1.61 turn-fence-worktree: in a linked worktree outside the project the
// session's cwd stays in the project, so the hook counts the turn ends there.
test("[E1.61] in a worktree outside the project the turn ends counted in the main repository fence its gates", (t) => {
  const { root, git } = project(t);
  const worktree = path.join(plainRoot(t), "wt");
  git("worktree", "add", "-q", "-b", "wt", worktree);
  // A count the worktree kept from a session that once ran there, plus the
  // one of the project, where this session's turns end.
  writeTurns(worktree, 7);
  writeTurns(root, 3);
  ospec(worktree, ...OPEN_DOCS);
  ospec(worktree, ...OPEN_IRREVERSIBLE);
  assert.strictEqual(stateOf(worktree, "fix-readme").gates[0].opened_turn, 10);

  const early = ospec(worktree, ...RESOLVE_IRREVERSIBLE, "--json");
  assert.strictEqual(early.code, 0, early.stderr);
  const fenced = stateOf(worktree, "fix-readme").gates[0];
  assert.deepStrictEqual([fenced.source, fenced.resolved_turn, fenced.unverified_reason], ["user-unverified", 10, "no turn ended between the gate's opening and the answer"]);

  ospec(worktree, "record", "gate", "--change", "fix-readme", "--gate", "adr-amend-or-contradict", "--open", "--reason", "ADR 0003: the hook decides");
  writeTurns(root, 4);
  const answered = ospec(worktree, "record", "gate", "--change", "fix-readme", "--gate", "adr-amend-or-contradict", "--resolve", "--answer", "Amend it.", "--source", "user", "--json");
  assert.strictEqual(answered.code, 0, answered.stderr);
  assert.strictEqual(answered.json.warnings, undefined);
  const gate = stateOf(worktree, "fix-readme").gates[1];
  assert.deepStrictEqual([gate.source, gate.opened_turn, gate.resolved_turn], ["user", 10, 11]);
});

test("[E1.49] check runs no check the user has not approved: it opens checks-changed, and the next check after the answer runs it", (t) => {
  const { root } = project(t);
  const marker = path.join(tempRoot(t), "ran");
  const proposed = `checks:\n  test: node -e "require('fs').writeFileSync(process.argv[1], '1')" ${marker}\n`;
  writeTurns(root, 3);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "README.md", "# Pages\n");
  writeFile(root, "idd/config.yaml", proposed);

  const gated = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(gated.code, 0, gated.stderr);
  assert.strictEqual(gated.json.decision?.gate, "checks-changed", JSON.stringify(gated.json));
  assert.strictEqual(gated.json.checks, undefined, "no check ran");
  assert.ok(gated.json.warnings.includes("no check ran: checks-changed waits for the user's approval of the checks and settings of idd/config.yaml"), JSON.stringify(gated.json.warnings));
  assert.match(gated.json.missing.find((entry) => entry.obligation === "checks-pass").reason, /^no check ran: the user has not approved/);
  assert.strictEqual(gated.json.next.next_step.action, "resolve-gate");
  assert.ok(!fs.existsSync(marker), "the proposed check must not run before the user's answer");
  assert.deepStrictEqual(stateOf(root, "fix-readme").runs ?? [], [], "no run is recorded");
  assert.match(ospec(root, "check", "--change", "fix-readme").stdout, /^warning: no check ran: /m);

  // Declined: back to the base checks, the unanswered gate is dropped and the base check runs.
  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\n");
  const restored = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(restored.json.decision, undefined, JSON.stringify(restored.json));
  assert.deepStrictEqual(restored.json.checks.map((run) => run.command), ["node verify.js"]);

  // Approved after a turn end: the answer stays user and the next check runs the command.
  writeFile(root, "idd/config.yaml", proposed);
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.decision?.gate, "checks-changed");
  assert.ok(!fs.existsSync(marker));
  writeTurns(root, 4);
  const approved = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, use it.", "--source", "user", "--json");
  assert.strictEqual(approved.code, 0, approved.stderr);
  assert.strictEqual(approved.json.warnings, undefined);
  assert.strictEqual(stateOf(root, "fix-readme").gates.find((gate) => gate.id === "checks-changed").source, "user");
  const ran = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(ran.json.verdict, "ready", JSON.stringify(ran.json));
  assert.ok(fs.existsSync(marker), "the approved check runs");
});

test("[E1.49] a checks-changed answer the turn fence keeps user-unverified still approves the checks, with its warning", (t) => {
  const { root } = project(t);
  const marker = path.join(tempRoot(t), "ran");
  writeTurns(root, 3);
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "README.md", "# Pages\n");
  writeFile(root, "idd/config.yaml", `checks:\n  test: node -e "require('fs').writeFileSync(process.argv[1], '1')" ${marker}\n`);
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.decision?.gate, "checks-changed");

  // Answered in the turn the gate opened: the fence warns, it does not stop the command.
  const fenced = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes.", "--source", "user", "--json");
  assert.strictEqual(fenced.code, 0, fenced.stderr);
  assert.match(fenced.json.warnings[0], /^gate checks-changed recorded user-unverified: no turn ended between the gate's opening and the answer; /);
  const ran = ospec(root, "check", "--change", "fix-readme", "--json");
  assert.strictEqual(ran.json.verdict, "ready", JSON.stringify(ran.json));
  assert.ok(fs.existsSync(marker), "a user-unverified answer approves the checks it lists");
  const closed = ospec(root, "close", "--change", "fix-readme");
  assert.strictEqual(closed.code, 0, closed.stderr);
  assert.match(closed.stdout, /^warning: gate checks-changed was answered user-unverified: no turn ended between the gate's opening and the answer$/m);
});

// claude-router: `ospec router` writes the Claude Code router from the plugin
// it belongs to (OSPEC_PLUGIN_ROOT here) into CLAUDE_CONFIG_DIR or ~/.claude.
function routerEnv(t, { source = true } = {}) {
  const base = plainRoot(t);
  const plugin = path.join(base, "plugin");
  if (source) {
    fs.mkdirSync(path.join(plugin, "global-instructions"), { recursive: true });
    fs.writeFileSync(path.join(plugin, "global-instructions", "CLAUDE.md"), "# ospec-workflow\n\nrouter\n");
  }
  fs.mkdirSync(path.join(plugin, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "ospec-workflow", version: "9.1.0" }));
  const config = path.join(base, "config");
  const env = { ...process.env, HOME: base, USERPROFILE: base, CLAUDE_CONFIG_DIR: config, OSPEC_PLUGIN_ROOT: plugin };
  return { base, config, env, rules: path.join(config, "rules", "ospec-workflow.md"), state: path.join(config, "plugins", "data", "ospec-workflow-ospec-tools", "router.json") };
}

test("ospec router installs, reports, turns off and removes the user router", (t) => {
  const r = routerEnv(t);
  const root = plainRoot(t);
  const installed = ospecWith(r.env, root, "router", "install", "--json");
  assert.strictEqual(installed.code, 0, installed.stderr);
  assert.strictEqual(installed.json.path, r.rules);
  assert.strictEqual(fs.readFileSync(r.rules, "utf8"), "# ospec-workflow\n\nrouter\n");
  const text = ospecWith(r.env, root, "router", "install");
  assert.match(text.stdout, /router already current in/);

  const status = ospecWith(r.env, root, "router", "status", "--json");
  assert.strictEqual(status.json.source.version, "9.1.0");
  assert.strictEqual(status.json.user.file, "current");
  assert.strictEqual(status.json.project.file, "absent");

  const off = ospecWith(r.env, root, "router", "off", "--json");
  assert.deepStrictEqual(off.json.removed, [r.rules]);
  assert.strictEqual(JSON.parse(fs.readFileSync(r.state, "utf8")).declined, true);
  const removed = ospecWith(r.env, root, "router", "remove");
  assert.match(removed.stdout, /nothing to remove; the notice comes back/);
  assert.strictEqual(fs.existsSync(r.state), false);
});

test("ospec router install --scope project writes the team router and the settings of --root", (t) => {
  const r = routerEnv(t);
  const root = plainRoot(t);
  const result = ospecWith(r.env, root, "router", "install", "--scope", "project");
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /snakeblack\/ospec-workflow\.git#release; plugin enabled/);
  const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude", "settings.json"), "utf8"));
  assert.strictEqual(settings.enabledPlugins["ospec-workflow@ospec-tools"], true);
  assert.ok(fs.existsSync(path.join(root, ".claude", "rules", "ospec-workflow.md")));
  assert.strictEqual(fs.existsSync(r.rules), false);
});

test("ospec router refuses without a built router, an edited file or a bad scope", (t) => {
  const missing = routerEnv(t, { source: false });
  const root = plainRoot(t);
  const refused = ospecWith(missing.env, root, "router", "install", "--json");
  assert.strictEqual(refused.code, 1);
  assert.strictEqual(refused.json.error.code, "router-source-missing");
  assert.match(refused.json.error.how, /npm run setup:claude/);

  const edited = routerEnv(t);
  fs.mkdirSync(path.dirname(edited.rules), { recursive: true });
  fs.writeFileSync(edited.rules, "# mine\n");
  const modified = ospecWith(edited.env, root, "router", "install");
  assert.strictEqual(modified.code, 1);
  assert.match(modified.stderr, /\(router-modified\)/);
  assert.match(modified.stderr, /ospec router install --force/);
  assert.strictEqual(ospecWith(edited.env, root, "router", "install", "--force").code, 0);

  const scope = ospecWith(edited.env, root, "router", "install", "--scope", "team");
  assert.strictEqual(scope.code, 2);
  assert.match(scope.stderr, /--scope takes user or project/);
});

// #510: a passing run of a pair that records no evidence says why, with the
// reason ospec check gives.
test("[REQ-idd-014] a passing run that closes no pair prints why (#510)", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt");
  const marker = `node -e "process.exit(require('fs').existsSync('marker') ? 0 : 1)"`;
  const run = () => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", marker);
  assert.match(run().stdout, /^run-1: exit 1; no evidence recorded by this run\n/, "a failing run keeps its line");
  writeFile(root, "marker", "");
  assert.match(run().stdout, /^run-2: exit 0; no evidence recorded by this run: the diff adds no line to a test: .+\nnext \(repro-test\): /);
});

test("[REQ-idd-014] a reproduction that never failed names what may have hidden its red (#510)", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt");
  const first = ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node -e 0");
  assert.match(
    first.stdout,
    /^run-1: exit 0; no evidence recorded by this run: no failing run recorded: run the test with ospec run --obligation repro-test before the fix; if it passes without the fix, check that no tool wrote a generated file, such as a lockfile, again before the test ran\n/,
    first.stderr,
  );
});

// #511: the whole output of a failing check or run stays in a local file.
const LONG_FAILURE = `node -e "console.log('expected 2 pages, got 1');for(let i=1;i<=30;i++)console.log('line '+i);process.exit(1)"`;

function sha256Of(file) {
  return `sha256:${require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}

test("[REQ-idd-014] a failing run keeps its whole output in .ospec/runs and close removes it (#511)", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node -e 0\n" });
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination");
  const run = (command, ...flag) => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", command, ...flag);
  const failing = run(LONG_FAILURE, "--json");
  assert.strictEqual(failing.json.run.output_file, ".ospec/runs/fix-pagination/run-1.log");
  const file = path.join(root, ".ospec/runs/fix-pagination/run-1.log");
  assert.match(fs.readFileSync(file, "utf8"), /^expected 2 pages, got 1\n/);
  const stored = stateOf(root, "fix-pagination").runs.find((entry) => entry.id === "run-1");
  assert.strictEqual(sha256Of(file), stored.output_sha256);
  assert.strictEqual(stored.output_file, undefined, "the state keeps its shape");
  assert.doesNotMatch(failing.json.run.output_tail.join("\n"), /expected 2 pages/, "the tail misses the error");

  const text = run(LONG_FAILURE);
  assert.match(text.stdout, /\n {2}line 30\n {2}full output: \.ospec\/runs\/fix-pagination\/run-2\.log\n/);

  // The pair of test/pages.js closes the change; a passing run writes nothing.
  writeFile(root, "test/pages.js", `${VERIFY}\n`);
  run("node test/pages.js", "--json");
  writeFile(root, "src/pages.txt", "2");
  const green = run("node test/pages.js", "--json");
  assert.strictEqual(green.json.run.output_file, undefined);
  assert.deepStrictEqual(fs.readdirSync(path.join(root, ".ospec/runs/fix-pagination")).sort(), ["run-1.log", "run-2.log", "run-3.log"]);
  const closed = ospec(root, "check", "--change", "fix-pagination", "--close", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout + closed.stderr);
  assert.ok(!fs.existsSync(path.join(root, ".ospec/runs/fix-pagination")), "close removes the outputs of the change");
});

test("[REQ-idd-014] a failing check names the file with its whole output (#511)", (t) => {
  const { root } = project(t, { checks: `checks:\n  test: ${LONG_FAILURE}\n  lint: node -e 0\n` });
  ospec(root, ...OPEN_DOCS);
  const failing = ospec(root, "check", "--change", "fix-readme", "--json");
  const [test_, lint] = failing.json.checks;
  assert.strictEqual(test_.output_file, ".ospec/runs/fix-readme/run-1.log");
  assert.strictEqual(lint.output_file, undefined);
  assert.strictEqual(sha256Of(path.join(root, test_.output_file)), stateOf(root, "fix-readme").runs[0].output_sha256);
  const text = ospec(root, "check", "--change", "fix-readme");
  assert.match(text.stdout, /\n {2}line 30\n {2}full output: \.ospec\/runs\/fix-readme\/run-3\.log\n/);
});

// #512: the line a change publishes in the changelog can be declared and
// corrected while it is open; the intent stays as recorded.
test("[REQ-idd-025] record changelog replaces the line close writes and keeps the intent (#512)", (t) => {
  const { root } = project(t, { checks: DECLARED_DELIVERY });
  writeFile(root, "CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n## [1.4.2] - 2026-10-01\n");
  ospec(root, ...OPEN_DOCS);
  const record = (...args) => ospec(root, "record", "changelog", "--change", "fix-readme", ...args, "--json");

  const first = record("--line", "Fix a typo  and\nthe broken link.");
  assert.deepStrictEqual([first.code, first.json.changed], [0, true], first.stderr);
  assert.strictEqual(stateOf(root, "fix-readme").changelog_line, "Fix a typo and the broken link.");
  assert.strictEqual(record("--line", "Fix a typo and the broken link.").json.changed, false, "the same line changes nothing");
  assert.strictEqual(record("--line", "Fix two typos.").json.changed, true, "the last line replaces the one before");
  assert.strictEqual(stateOf(root, "fix-readme").intent.summary, "Fix a typo.", "the intent stays as recorded");

  // The intent still refuses another summary, and its remedy names the command.
  const conflict = ospec(root, ...OPEN_DOCS.map((arg) => (arg === "Fix a typo." ? "Fix two typos." : arg)), "--json");
  assert.strictEqual(conflict.json.error?.code, "intent-conflict");
  assert.match(conflict.json.error.how, /ospec record changelog --change fix-readme --line/);

  assert.strictEqual(record().code, 2, "neither --line nor --clear is a usage error");
  assert.strictEqual(record("--line", "x", "--clear").code, 2);
  assert.strictEqual(record("--line", "  ").json.error?.code, "changelog-line-required");

  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  const closed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.deepStrictEqual(closed.json.changelog, { path: "CHANGELOG.md", section: "Changed", entry: "- Fix two typos. (fix-readme)", written: true });
  assert.match(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), /## \[Unreleased\]\n\n### Changed\n- Fix two typos\. \(fix-readme\)\n/);
  // An archived change takes no record, as record assumption answers.
  assert.strictEqual(record("--line", "Late.").json.error?.code, ospec(root, "record", "assumption", "--change", "fix-readme", "--text", "Late.", "--json").json.error?.code);
});

test("[REQ-idd-025] record changelog --clear returns to the summary, and an ambiguous intent declares no line (#512)", (t) => {
  // Without delivery.changelog the line is kept all the same.
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  const record = (change, ...args) => ospec(root, "record", "changelog", "--change", change, ...args, "--json");
  assert.strictEqual(record("fix-readme", "--clear").json.changed, false, "nothing to clear");
  record("fix-readme", "--line", "Fix two typos.");
  assert.strictEqual(record("fix-readme", "--clear").json.changed, true);
  assert.ok(!("changelog_line" in stateOf(root, "fix-readme")));

  ospec(root, "record", "intent", "--change", "improve-login", "--ambiguous", "--request", "Improve the login.", "--json");
  assert.strictEqual(record("improve-login", "--line", "Better login.").json.error?.code, "ambiguous-intent-open");
  assert.strictEqual(record("no-such", "--line", "x").json.error?.code, "unknown-change");
});

// #513: a follow-up of a closed change passes its ceremony and adds no entry
// of its own while the entry it completes is still under [Unreleased].
const OPEN_FOLLOW_UP = ["record", "intent", "--change", "fix-dates", "--kind", "docs", "--summary", "Adjust the dates.", "--acceptance", "Right dates.", "--no-open-facts", "--basis", "The request fixes every behavior."];
const CLOSED_DOCS_CHANGELOG = "# Changelog\n\n## [Unreleased]\n\n### Changed\n- Fix a typo. (fix-readme)\n\n## [1.4.2] - 2026-10-01\n";

function followUpProject(t) {
  const { root } = project(t, { checks: DECLARED_DELIVERY });
  writeFile(root, "CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n## [1.4.2] - 2026-10-01\n");
  assert.strictEqual(closeDocsChange(root).code, 0);
  assert.strictEqual(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), CLOSED_DOCS_CHANGELOG);
  ospec(root, ...OPEN_FOLLOW_UP);
  const completes = (...args) => ospec(root, "record", "completes", "--change", "fix-dates", ...args, "--json");
  const close = (...flag) => {
    writeFile(root, "README.md", "dates\n");
    ospec(root, "check", "--change", "fix-dates", "--json");
    return ospec(root, "close", "--change", "fix-dates", ...flag);
  };
  return { root, completes, close };
}

test("[REQ-idd-025] a follow-up closes without an entry of its own and its archive names the change it completes (#513)", (t) => {
  const { root, completes, close } = followUpProject(t);
  assert.deepStrictEqual([completes("--of", "fix-readme").json.changed, completes("--of", "fix-readme").json.changed], [true, false]);
  assert.strictEqual(completes().code, 2, "neither --of nor --clear is a usage error");
  const closed = close();
  assert.strictEqual(closed.code, 0, closed.stderr);
  assert.match(closed.stdout, /\nchangelog: CHANGELOG\.md gets no entry, this change completes fix-readme, whose entry stays under \[Unreleased\] ### Changed: - Fix a typo\. \(fix-readme\)\n/);
  assert.strictEqual(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), CLOSED_DOCS_CHANGELOG, "the changelog is as the first change left it");
  const again = ospec(root, "close", "--change", "fix-dates", "--json").json;
  assert.deepStrictEqual(again.changelog, { path: "CHANGELOG.md", completes: "fix-readme", section: "Changed", entry: "- Fix a typo. (fix-readme)", written: false });
  assert.strictEqual(again.release.version, "1.4.3", "the release still comes from the entry that stands");
  const archive = fs.readdirSync(path.join(root, "idd/archive")).find((name) => name.endsWith("-fix-dates"));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, "idd/archive", archive, "state.yaml"), "utf8")).completes, "fix-readme");
});

test("[REQ-idd-025] a follow-up that declares a changelog line rewrites the entry it completes, with that change's id (#513)", (t) => {
  const { root, completes, close } = followUpProject(t);
  completes("--of", "fix-readme");
  ospec(root, "record", "changelog", "--change", "fix-dates", "--line", "Fix a typo and the dates.");
  const closed = close("--json");
  assert.deepStrictEqual(closed.json.changelog, { path: "CHANGELOG.md", completes: "fix-readme", section: "Changed", entry: "- Fix a typo and the dates. (fix-readme)", written: true });
  assert.strictEqual(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), CLOSED_DOCS_CHANGELOG.replace("Fix a typo.", "Fix a typo and the dates."));
});

test("[REQ-idd-025] a follow-up is refused for an unknown, released or follow-up change, and --clear writes its own entry (#513)", (t) => {
  const { root, completes, close } = followUpProject(t);
  assert.strictEqual(completes("--of", "no-such").json.error?.code, "completes-unknown");
  assert.strictEqual(completes("--of", "fix-dates").json.error?.code, "completes-unknown", "an open change completes nothing");
  assert.strictEqual(completes("--of", "  ").json.error?.code, "completes-required");
  assert.strictEqual(completes("--of", "fix-readme").json.changed, true);

  // The entry it leans on is published before the follow-up closes.
  writeFile(root, "CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n## [1.4.3] - 2026-10-02\n\n### Changed\n- Fix a typo. (fix-readme)\n");
  const refused = close("--json");
  assert.strictEqual(refused.json.error?.code, "completes-released");
  assert.match(refused.json.error.how, /ospec record completes --change fix-dates --clear/);
  assert.strictEqual(stateOf(root, "fix-dates").status, "open", "a refused close leaves the change open");
  assert.strictEqual(completes("--of", "fix-readme").json.error?.code, "completes-released", "declaring it again says the same");

  assert.strictEqual(completes("--clear").json.changed, true);
  const closed = close("--json");
  assert.deepStrictEqual(closed.json.changelog, { path: "CHANGELOG.md", section: "Changed", entry: "- Adjust the dates. (fix-dates)", written: true });

  // A follow-up has no entry of its own, so nothing completes it.
  ospec(root, ...OPEN_FOLLOW_UP.map((arg) => (arg === "fix-dates" ? "fix-more" : arg)));
  const chained = ospec(root, "record", "completes", "--change", "fix-more", "--of", "fix-readme", "--json");
  assert.strictEqual(chained.json.error?.code, "completes-released");
});

test("[REQ-idd-025] a follow-up of a follow-up names the first change, and a project without a changelog declares none (#513)", (t) => {
  const { root, completes, close } = followUpProject(t);
  completes("--of", "fix-readme");
  assert.strictEqual(close("--json").code, 0);
  ospec(root, ...OPEN_FOLLOW_UP.map((arg) => (arg === "fix-dates" ? "fix-more" : arg)));
  const chained = ospec(root, "record", "completes", "--change", "fix-more", "--of", "fix-dates", "--json");
  assert.strictEqual(chained.json.error?.code, "completes-follow-up");
  assert.match(chained.json.error.message, /name fix-readme$/);

  const bare = project(t).root;
  ospec(bare, ...OPEN_FOLLOW_UP);
  const undeclared = ospec(bare, "record", "completes", "--change", "fix-dates", "--of", "fix-readme", "--json");
  assert.strictEqual(undeclared.json.error?.code, "completes-without-changelog");
});

// #409 (REQ-idd-028): a change that was replaced, discarded or opened by
// mistake is archived as abandoned by the user's answer to the abandon gate.
const OPEN_ABANDONED_BUG = OPEN_BUG.map((arg) => (arg === "fix-pagination" ? "old-fix" : arg)).filter((arg) => arg !== "--json");
const abandonOf = (root, change, ...args) => ospec(root, "abandon", "--change", change, ...args, "--json");
const answerAbandon = (root, change, source = "user") =>
  ospec(root, "record", "gate", "--change", change, "--gate", "abandon", "--resolve", "--answer", "Yes, drop it.", "--source", source, "--json");
const archivedState = (root, change) => {
  const name = fs.readdirSync(path.join(root, "idd/archive")).filter((entry) => entry.slice(11) === change).sort().at(-1);
  return JSON.parse(fs.readFileSync(path.join(root, "idd/archive", name, "state.yaml"), "utf8"));
};

test("[REQ-idd-028] the user's answer archives a change with pending obligations as abandoned, with no check, changelog entry or knowledge record (#409)", (t) => {
  const { root } = project(t, { checks: DECLARED_DELIVERY });
  const changelog = "# Changelog\n\n## [Unreleased]\n\n## [1.4.2] - 2026-10-01\n";
  writeFile(root, "CHANGELOG.md", changelog);
  writeTurns(root, 3);
  ospec(root, ...OPEN_ABANDONED_BUG);
  ospec(root, "signals", "--change", "old-fix", "--path", "src/pages.txt", "--decision", "Count the last page.");
  writeFile(root, "src/pages.txt", "half done");
  writeFile(root, ".ospec/runs/old-fix/run-1.log", "kept output\n");
  const before = stateOf(root, "old-fix");
  assert.ok(before.obligations.some((entry) => entry.id === "repro-test" && entry.status === "pending"));

  const asked = abandonOf(root, "old-fix", "--reason", "Delivered under another id.");
  assert.strictEqual(asked.code, 0, asked.stderr);
  assert.deepStrictEqual({ abandon: asked.json.abandon, changed: asked.json.changed }, { abandon: "asked", changed: true });
  assertGateStep(asked.json.next.next_step, "abandon");
  assert.strictEqual(asked.json.next.pending_decision.reason, "Delivered under another id.");
  assert.strictEqual(stateOf(root, "old-fix").status, "open", "asking archives nothing");
  assert.strictEqual(abandonOf(root, "old-fix", "--reason", "Delivered under another id.").json.changed, false);

  writeTurns(root, 4);
  const answered = answerAbandon(root, "old-fix");
  assert.strictEqual(answered.code, 0, answered.stderr);
  const { archive, abandoned } = answered.json;
  assert.strictEqual(answered.json.status, "abandoned");
  assert.match(archive.destination, /^idd\/archive\/\d{4}-\d{2}-\d{2}-old-fix$/);
  assert.deepStrictEqual({ ...abandoned, at: null }, { at: null, reason: "Delivered under another id.", answer: "Yes, drop it.", source: "user" });
  assert.ok(answered.json.pending_obligations.includes("repro-test"));
  for (const absent of ["records", "changelog", "release", "warnings", "next"]) assert.ok(!(absent in answered.json), `no ${absent}`);

  assert.ok(!fs.existsSync(path.join(root, "idd/old-fix")), "the change left idd/");
  assert.ok(!fs.existsSync(path.join(root, ".ospec/runs/old-fix")), "its kept outputs are dropped");
  assert.strictEqual(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), changelog, "no changelog entry");
  assert.strictEqual(fs.readFileSync(path.join(root, "src/pages.txt"), "utf8"), "half done", "the working tree stays");
  const stored = archivedState(root, "old-fix");
  assert.strictEqual(stored.status, "abandoned");
  assert.deepStrictEqual(stored.obligations, before.obligations, "obligations stay as they were");
  assert.deepStrictEqual(stored.evidence, []);
  assert.ok(!("closed_at" in stored));
  assert.match(fs.readFileSync(path.join(root, archive.destination, "change.md"), "utf8"), /Count the last page\./);

  assert.deepStrictEqual(ospec(root, "status", "--json").json.changes ?? [], []);
  assert.strictEqual(ospec(root, "next", "--json").json.next_step.action, "open-change");
  const text = ospec(root, "abandon", "--change", "old-fix");
  assert.match(text.stdout, /^old-fix already archived in idd\/archive\/\S+-old-fix .*\nreason: Delivered under another id\.\nanswer \(user\): Yes, drop it\.\nleft without evidence: .*repro-test.*\nno changelog entry and no knowledge record; the working tree stays as it is\n$/);
});

test("[REQ-idd-028] abandon archives nothing without the user's answer, and --cancel withdraws the question (#409)", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  assert.strictEqual(abandonOf(root, "fix-readme").code, 2, "an open change needs --reason or --cancel");
  assert.strictEqual(abandonOf(root, "fix-readme", "--reason", "  ").code, 2);
  assert.strictEqual(abandonOf(root, "fix-readme", "--cancel", "--reason", "x").code, 2);
  assert.strictEqual(abandonOf(root, "fix-readme", "--cancel").json.error?.code, "gate-not-open");
  assert.strictEqual(ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "abandon", "--open", "--reason", "x", "--json").json.error?.code, "gate-managed-by-abandon");
  assert.strictEqual(answerAbandon(root, "fix-readme").json.error?.code, "gate-not-open");

  abandonOf(root, "fix-readme", "--reason", "Opened by mistake.");
  const unanswered = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "abandon", "--resolve", "--json");
  assert.strictEqual(unanswered.json.error?.code, "gate-answer-required");
  assert.strictEqual(ospec(root, "close", "--change", "fix-readme", "--json").json.error?.code, "close-refused", "a change that is delivered still needs its evidence");
  // Another reason replaces the question still asked.
  assert.strictEqual(abandonOf(root, "fix-readme", "--reason", "Discarded.").json.changed, true);
  assert.deepStrictEqual(stateOf(root, "fix-readme").gates.map((gate) => [gate.id, gate.status, gate.reason]), [["abandon", "open", "Discarded."]]);

  const cancelled = abandonOf(root, "fix-readme", "--cancel");
  assert.deepStrictEqual({ abandon: cancelled.json.abandon, changed: cancelled.json.changed }, { abandon: "cancelled", changed: true });
  assert.deepStrictEqual(stateOf(root, "fix-readme").gates, []);
  assert.strictEqual(stateOf(root, "fix-readme").status, "open");
  assert.ok(!fs.existsSync(path.join(root, "idd/archive")) || fs.readdirSync(path.join(root, "idd/archive")).length === 0);
});

test("[REQ-idd-028] abandon is asked before any other gate, also of an ambiguous intent, and a relayed answer archives with its warning (#409)", (t) => {
  const { root } = project(t);
  writeTurns(root, 1);
  ospec(root, "record", "intent", "--change", "improve-login", "--ambiguous", "--request", "Improve the login.");
  ospec(root, ...OPEN_DOCS);
  ospec(root, ...OPEN_IRREVERSIBLE);
  for (const change of ["improve-login", "fix-readme"]) {
    const asked = abandonOf(root, change, "--reason", "Discarded.");
    assert.strictEqual(asked.code, 0, asked.stdout);
    assertGateStep(asked.json.next.next_step, "abandon");
  }
  assert.deepStrictEqual(ospec(root, "status", "--change", "fix-readme", "--json").json.changes[0].open_gates, ["abandon", "irreversible-operation"]);

  // No turn ended since the gate opened: the answer is kept user-unverified.
  const fenced = answerAbandon(root, "improve-login");
  assert.strictEqual(fenced.json.abandoned.source, "user-unverified");
  assert.deepStrictEqual(fenced.json.warnings, ["gate abandon was answered user-unverified: no turn ended between the gate's opening and the answer"]);
  const relayed = answerAbandon(root, "fix-readme", "user-unverified");
  assert.strictEqual(relayed.json.status, "abandoned");
  assert.deepStrictEqual(relayed.json.warnings, ["gate abandon was answered user-unverified: the answer was relayed"]);
  assert.deepStrictEqual(archivedState(root, "fix-readme").gates.map((gate) => [gate.id, gate.status]), [["irreversible-operation", "open"], ["abandon", "resolved"]]);
  assert.match(ospec(root, "abandon", "--change", "fix-readme").stdout, /\nwarning: gate abandon was answered user-unverified: the answer was relayed\n$/);
});

test("[REQ-idd-028] --superseded-by names another change that exists, and an abandoned id closes nothing, completes nothing and opens again (#409)", (t) => {
  const { root } = project(t, { checks: DECLARED_DELIVERY });
  writeFile(root, "CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n");
  assert.strictEqual(closeDocsChange(root).code, 0);
  ospec(root, ...OPEN_ABANDONED_BUG);
  ospec(root, ...OPEN_FOLLOW_UP);
  const superseded = (id) => abandonOf(root, "old-fix", "--reason", "Replaced.", "--superseded-by", id).json;
  assert.strictEqual(superseded("no-such").error?.code, "superseded-by-unknown");
  assert.strictEqual(superseded("old-fix").error?.code, "superseded-by-self");
  assert.strictEqual(superseded("Not_An_Id").error?.code, "superseded-by-invalid");
  assert.strictEqual(superseded("fix-readme").changed, true, "an archived change replaces it");
  assert.strictEqual(superseded("fix-dates").changed, true, "an open change replaces it, and replaces the question");
  assert.strictEqual(ospec(root, "next", "--change", "old-fix", "--json").json.pending_decision.superseded_by, "fix-dates");
  const answered = answerAbandon(root, "old-fix");
  assert.strictEqual(answered.json.abandoned.superseded_by, "fix-dates");
  assert.match(ospec(root, "abandon", "--change", "old-fix").stdout, /\nsuperseded by: fix-dates\n/);

  // An abandoned change is neither open nor closed.
  for (const refused of [
    ospec(root, "close", "--change", "old-fix", "--json"),
    abandonOf(root, "old-fix", "--reason", "Again."),
    abandonOf(root, "old-fix", "--cancel"),
  ]) assert.strictEqual(refused.json.error?.code, "change-abandoned");
  assert.strictEqual(ospec(root, "record", "completes", "--change", "fix-dates", "--of", "old-fix", "--json").json.error?.code, "completes-unknown");
  assert.strictEqual(abandonOf(root, "fix-readme", "--reason", "Late.").json.error?.code, "change-closed");
  assert.strictEqual(abandonOf(root, "no-such", "--reason", "x").json.error?.code, "unknown-change");
  assert.strictEqual(abandonOf(root, "no-such").json.error?.code, "unknown-change");

  // Its id opens again, as the id of a closed change does.
  const reopened = ospec(root, ...OPEN_ABANDONED_BUG, "--json");
  assert.strictEqual(reopened.code, 0, reopened.stdout);
  assert.deepStrictEqual([stateOf(root, "old-fix").status, stateOf(root, "old-fix").gates.length], ["open", 0]);
});

test("[REQ-idd-028] an interrupted archive of an abandoned change is finished by ospec abandon, and nothing else acts on it (#409)", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  abandonOf(root, "fix-readme", "--reason", "Discarded.");
  const { archive } = answerAbandon(root, "fix-readme").json;
  // The state was saved and the move never happened.
  fs.renameSync(path.join(root, archive.destination), path.join(root, "idd/fix-readme"));

  const next = ospec(root, "next", "--change", "fix-readme", "--json").json;
  assert.deepStrictEqual(next.next_step, { action: "abandon", command: "ospec abandon --change fix-readme" });
  assert.ok(!("pending_decision" in next));
  const warned = doctor(t, root, "--json").json.checks.find((entry) => entry.id === "idd-change" && entry.subject === "fix-readme");
  assert.strictEqual(warned.status, "warn");
  assert.match(warned.cause, /^abandoned at \S+ but still outside idd\/archive\/: the archive was interrupted$/);
  assert.match(warned.action, /ospec abandon --change fix-readme/);
  for (const refused of [
    ospec(root, "close", "--change", "fix-readme", "--json"),
    ospec(root, "check", "--change", "fix-readme", "--json"),
    ospec(root, "record", "assumption", "--change", "fix-readme", "--text", "x", "--json"),
    abandonOf(root, "fix-readme", "--reason", "Again."),
  ]) assert.strictEqual(refused.json.error?.code, "change-abandoned");

  const finished = abandonOf(root, "fix-readme");
  assert.strictEqual(finished.code, 0, finished.stdout);
  assert.deepStrictEqual({ abandon: finished.json.abandon, destination: finished.json.archive.destination }, { abandon: "archived", destination: archive.destination });
  assert.ok(!fs.existsSync(path.join(root, "idd/fix-readme")));
  assert.strictEqual(abandonOf(root, "fix-readme").json.archive.already_complete, true);
});
