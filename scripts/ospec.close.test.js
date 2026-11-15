"use strict";

// End-to-end contract of the ospec CLI, run as a child process against a
// temporary project root: ospec close, its knowledge records, changelog and
// release (E1.4 c, E3.5, E3.9), ospec doctor (E1.7), the protocol hygiene of
// next (E1.11), security sinks (E1.50) and contract lines (E1.58). The
// helpers the parts share are in scripts/lib/test-support/ospec-cli.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  tempRoot,
  ospec,
  assertGateStep,
  OPEN_BUG,
  FEATURE_COVER,
  openFeature,
  writeFile,
  project,
  stateOf,
  OPEN_DOCS,
  DECLARED_DELIVERY,
  closeDocsChange,
  doctor,
} = require("./lib/test-support/ospec-cli.js");

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
  assert.ok(!("delivery" in closed.json), "without an integration branch close returns no delivery rules");

  // Closing again reports the same entry and release without writing it twice.
  const again = ospec(root, "close", "--change", "fix-readme");
  assert.strictEqual(again.code, 0, again.stderr);
  assert.match(again.stdout, /\nchangelog: CHANGELOG.md already holds under \[Unreleased\] ### Changed: - Fix a typo\. \(fix-readme\)\n/);
  assert.match(again.stdout, /\nrelease: propose v1\.4\.3 \(patch\) with the notes of \[Unreleased\]; .* only with the user's OK/);
  assert.strictEqual(fs.readFileSync(changelog, "utf8"), text);
});

test("[REQ-idd-023] an integration branch gives its rules in next, close and team, and close waits for the promotion", (t) => {
  const declared = "checks:\n  test: node verify.js\ndelivery:\n  branching: serial\n  integration_branch: dev\n  production_branch: main\n  changelog: CHANGELOG.md\n  release: batched\n";
  const { root } = project(t, { checks: declared });
  writeFile(root, "CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n## [1.4.2] - 2026-10-01\n");
  ospec(root, ...OPEN_DOCS);
  const start = ospec(root, "next", "--change", "fix-readme", "--json").json;
  assert.strictEqual(start.next_step.action, "declare-plan");
  assert.deepStrictEqual([start.delivery.integration.value, start.delivery.integration.production], ["dev", "main"]);
  assert.match(start.delivery.how, /branch from the up-to-date integration branch dev/);
  const text = ospec(root, "next", "--change", "fix-readme").stdout;
  assert.match(text, /\nintegration: dev \(idd\/config.yaml\): delivery.integration_branch is declared in idd\/config.yaml; /);
  assert.match(text, /\nintegration rules: work branches start from the up-to-date dev and their pull requests target dev; /);

  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  const closed = ospec(root, "close", "--change", "fix-readme", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
  assert.strictEqual(closed.json.changelog.written, true);
  // The version is proposed on the promotion to main, never on this merge into dev.
  assert.ok(!("release" in closed.json));
  assert.deepStrictEqual([closed.json.delivery.branching, closed.json.delivery.release.value, closed.json.delivery.integration.value], ["serial", "batched", "dev"]);
  const again = ospec(root, "close", "--change", "fix-readme").stdout;
  assert.match(again, /\nrelease rules: entries accumulate under \[Unreleased\] of dev; propose a release when dev is promoted to main/);
  assert.match(again, /\nintegration rules: work branches start from the up-to-date dev/);
  assert.ok(!/\nchangelog: CHANGELOG.md \(/.test(again), "the entry line already says what close wrote");

  const team = ospec(root, "team", "--json").json;
  assert.deepStrictEqual([team.integration.value, team.release.value], ["dev", "batched"]);
  assert.match(ospec(root, "team").stdout, /\nintegration rules: /);
  // Declaring per-change with it is refused when the configuration is read.
  writeFile(root, "idd/config.yaml", declared.replace("batched", "per-change"));
  assert.strictEqual(ospec(root, "team", "--json").json.error.code, "config-invalid");
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

// E1.50: security-boundary that only a sink in the added lines derives is
// retracted with the user's answer, tied to the sinks it saw; a security path
// keeps any answer out.
test("[E1.50] record retract takes the user's answer for a security sink the diff content alone derives", (t) => {
  const { root } = project(t);
  openFeature(root, "record", "intent", "--change", "formula-total", "--kind", "feature", "--summary", "Compute the total from a formula.", "--acceptance", "The report shows the total.", ...FEATURE_COVER);
  writeFile(root, "src/report.js", "const FORMULA = '1 + 2';\nmodule.exports = () => eval(FORMULA);\n");
  writeFile(root, "src/report.test.js", "test('total', () => {});\n");
  const reason = "security boundary: src/report.js adds code evaluation (CWE-94)";
  const checked = ospec(root, "check", "--change", "formula-total", "--json");
  assert.ok(checked.json.added.signals.includes("security-boundary"));
  assert.strictEqual(stateOf(root, "formula-total").signals.find((signal) => signal.id === "security-boundary").reason, reason);

  const retract = ["record", "retract", "--change", "formula-total", "--signal", "security-boundary", "--reason", "the formula is a constant"];
  const plain = ospec(root, ...retract, "--json");
  assert.strictEqual(plain.json.error.code, "signal-confirmed-by-diff");
  assert.match(plain.json.error.how, /no added sink takes untrusted input, add --answer "<their words>" --source user/);
  const answered = ospec(root, ...retract, "--answer", "FORMULA is a constant.", "--source", "user", "--json");
  assert.strictEqual(answered.code, 0, answered.stderr);
  let state = stateOf(root, "formula-total");
  assert.strictEqual(state.obligations.find((o) => o.id === "trust-review").status, "withdrawn");
  assert.deepStrictEqual(state.retracted.at(-1).hits, ["src/report.js adds code evaluation (CWE-94): module.exports = () => eval(FORMULA);"]);
  assert.ok(!(ospec(root, "check", "--change", "formula-total", "--json").json.added?.signals || []).includes("security-boundary"), "the answered sink stays retracted");

  // A new sink brings it back; a security path then keeps any answer out.
  writeFile(root, "src/report.js", "const FORMULA = '1 + 2';\nmodule.exports = () => eval(FORMULA);\nconst run = (cmd) => require('node:child_process').execSync(`sh ${cmd}`);\n");
  assert.ok(ospec(root, "check", "--change", "formula-total", "--json").json.added.signals.includes("security-boundary"));
  writeFile(root, "src/auth/session.js", "module.exports = {};\n");
  ospec(root, "check", "--change", "formula-total", "--json");
  state = stateOf(root, "formula-total");
  assert.strictEqual(state.obligations.find((o) => o.id === "trust-review").status, "pending");
  const byPath = ospec(root, ...retract, "--answer", "None.", "--source", "user", "--json");
  assert.strictEqual(byPath.json.error.code, "retract-answer-refused");
});

test("[E1.50] --security declares the security boundary without widening the plan", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "share-links", "--kind", "bug", "--summary", "Shared links expire.", "--acceptance", "An old link is refused.", "--no-open-facts", "--basis", "The request fixes every behavior.", "--path", "src/links.js");
  const plan = stateOf(root, "share-links").plan;
  const declared = ospec(root, "signals", "--change", "share-links", "--security", "--json");
  assert.strictEqual(declared.code, 0, declared.stderr);
  const state = stateOf(root, "share-links");
  assert.deepStrictEqual(state.signals.find((signal) => signal.id === "security-boundary"), { id: "security-boundary", reason: "declared a security boundary", source: "declaration" });
  assert.strictEqual(state.obligations.find((o) => o.id === "trust-review").status, "pending");
  assert.deepStrictEqual(state.plan, plan, "the plan stays as it was");
  // The diff does not confirm a declared boundary, so a plain retraction withdraws it.
  const retracted = ospec(root, "record", "retract", "--change", "share-links", "--signal", "security-boundary", "--reason", "the links module holds no secret", "--json");
  assert.strictEqual(retracted.code, 0, retracted.stderr);
});

// #423 (E1.58): public-contract that only the content of a doc derives is
// retracted with the user's answer, tied to the contract lines it saw.
test("record retract takes the user's answer for a public contract a doc's content alone derives", (t) => {
  const { root } = project(t);
  ospec(root, "record", "intent", "--change", "security-policy", "--kind", "docs", "--summary", "Document how to report a vulnerability.", "--acceptance", "SECURITY.md names the contact form.", "--no-open-facts", "--basis", "The request fixes every behavior.");
  ospec(root, "signals", "--change", "security-policy", "--path", "SECURITY.md");
  const policy = "# Security\n\nReport it through `POST /api/contact/` (the contact form).\n";
  writeFile(root, "SECURITY.md", policy);
  const reason = "public contract: SECURITY.md adds API";
  assert.ok(ospec(root, "check", "--change", "security-policy", "--json").json.added.signals.includes("public-contract"));

  const retract = ["record", "retract", "--change", "security-policy", "--signal", "public-contract", "--reason", "the policy cites the contact form we already have"];
  const plain = ospec(root, ...retract, "--json");
  assert.strictEqual(plain.json.error.code, "signal-confirmed-by-diff");
  assert.match(plain.json.error.how, /no contract.*--answer "<their words>" --source user/);
  const answered = ospec(root, ...retract, "--answer", "It is the existing form.", "--source", "user", "--json");
  assert.strictEqual(answered.code, 0, answered.stderr);
  let state = stateOf(root, "security-policy");
  assert.ok(!state.signals.some((signal) => signal.id === "public-contract"));
  assert.strictEqual(state.obligations.find((o) => o.id === "contract-spec-and-test").status, "withdrawn");
  assert.deepStrictEqual(state.retracted, [
    {
      id: "public-contract",
      reason,
      source: "diff",
      retract_reason: "the policy cites the contact form we already have",
      confirmed_by: reason,
      hits: ["SECURITY.md adds API: Report it through `POST /api/contact/` (the contact form)."],
      answer: "It is the existing form.",
      answer_source: "user",
    },
  ]);
  const checked = ospec(root, "check", "--change", "security-policy", "--json");
  assert.strictEqual(checked.code, 0, checked.stderr);
  assert.ok(!(checked.json.added?.signals || []).includes("public-contract"), "the answered lines stay retracted");

  // A line that cites a new endpoint brings it back.
  writeFile(root, "SECURITY.md", `${policy}Check the triage queue at \`GET /api/reports\`.\n`);
  assert.ok(ospec(root, "check", "--change", "security-policy", "--json").json.added.signals.includes("public-contract"));
  state = stateOf(root, "security-policy");
  assert.strictEqual(state.obligations.find((o) => o.id === "contract-spec-and-test").status, "pending");
});

// E1.58: a contract line in a contract document is the contract itself, as a
// path that derives the signal, so the user's answer does not retract it.
test("record retract refuses the user's answer for a contract line in a contract document", (t) => {
  const { root } = project(t);
  ospec(root, ...OPEN_DOCS);
  ospec(root, "signals", "--change", "fix-readme", "--path", "docs/api/contact.md");
  writeFile(root, "docs/api/contact.md", "# Contact\n\n`POST /api/contact/` takes the form.\n");
  assert.ok(ospec(root, "check", "--change", "fix-readme", "--json").json.added.signals.includes("public-contract"));
  const retract = ["record", "retract", "--change", "fix-readme", "--signal", "public-contract", "--reason", "it cites the existing form"];
  const refused = ospec(root, ...retract, "--answer", "It is the existing form.", "--source", "user", "--json");
  assert.strictEqual(refused.json.error.code, "retract-answer-refused");
  assert.match(refused.json.error.message, /docs\/api\/contact\.md is a contract document/);
  const plain = ospec(root, ...retract, "--json");
  assert.strictEqual(plain.json.error.code, "signal-confirmed-by-diff");
  assert.doesNotMatch(plain.json.error.how, /--answer/);
  assert.strictEqual(stateOf(root, "fix-readme").obligations.find((o) => o.id === "contract-spec-and-test").status, "pending");
});

// #496: public-contract that an impact path outside a contract document
// derives is retracted with the user's answer, tied to the lines the diff
// changes in that path; a later edit of it or another path brings it back.
const FUNCTIONS_CONFIG = "checks:\n  test: node verify.js\nimpact:\n  public_contract:\n    - functions/*/index.ts\n";
const HANDLER = 'import { serve } from "https://cdn.example/serve.ts";\nserve(() => new Response("ok"));\n';
const HANDLER_NPM = HANDLER.replace("https://cdn.example/serve.ts", "npm:serve");
const PATH_HIT = (file) => new RegExp(`^${file.replaceAll("/", "\\/").replaceAll(".", "\\.")} changes: sha256:[0-9a-f]{64}$`);

function functionsProject(t) {
  const { root, git } = project(t, { checks: FUNCTIONS_CONFIG });
  for (const name of ["a", "b"]) writeFile(root, `functions/${name}/index.ts`, HANDLER);
  writeFile(root, "src/api/users.js", "module.exports = () => [];\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "functions");
  ospec(root, "record", "intent", "--change", "npm-imports", "--kind", "bug", "--summary", "Import serve from npm.", "--acceptance", "The functions import npm:serve.", "--no-open-facts", "--basis", "The request fixes every behavior.", "--path", "functions/a/index.ts");
  return { root, git };
}

const RETRACT_CONTRACT = ["record", "retract", "--change", "npm-imports", "--signal", "public-contract", "--reason", "only an import specifier changes"];
const contractOf = (root) => stateOf(root, "npm-imports").obligations.find((o) => o.id === "contract-spec-and-test").status;
const hasContract = (root) => stateOf(root, "npm-imports").signals.some((signal) => signal.id === "public-contract");

test("[#496] record retract takes the user's answer for a public contract an impact path outside a contract document derives", (t) => {
  const { root } = functionsProject(t);
  writeFile(root, "functions/a/index.ts", HANDLER_NPM);
  ospec(root, "check", "--change", "npm-imports", "--json");
  assert.strictEqual(contractOf(root), "pending");

  const plain = ospec(root, ...RETRACT_CONTRACT, "--json");
  assert.strictEqual(plain.json.error.code, "signal-confirmed-by-diff");
  assert.match(plain.json.error.how, /the diff changes no contract: .*, add --answer "<their words>" --source user/);
  const answered = ospec(root, ...RETRACT_CONTRACT, "--answer", "No route, request or response changes.", "--source", "user", "--json");
  assert.strictEqual(answered.code, 0, answered.stderr);
  let entry = stateOf(root, "npm-imports").retracted.at(-1);
  assert.strictEqual(entry.confirmed_by, "public contract: touches functions/a/index.ts (matches functions/*/index.ts)");
  assert.strictEqual(entry.hits.length, 1);
  assert.match(entry.hits[0], PATH_HIT("functions/a/index.ts"));
  assert.strictEqual(contractOf(root), "withdrawn");

  // Neither a later check nor declaring the answered path again brings it back.
  assert.strictEqual(ospec(root, "check", "--change", "npm-imports", "--json").code, 0);
  assert.strictEqual(ospec(root, "signals", "--change", "npm-imports", "--path", "functions/a/index.ts", "--json").code, 0);
  assert.ok(!hasContract(root), "the answered path stays retracted");
  assert.strictEqual(contractOf(root), "withdrawn");

  // Another contract path brings it back, and the answer then covers both.
  writeFile(root, "functions/b/index.ts", HANDLER_NPM);
  assert.ok(ospec(root, "check", "--change", "npm-imports", "--json").json.added.signals.includes("public-contract"));
  assert.strictEqual(contractOf(root), "pending");
  assert.strictEqual(ospec(root, ...RETRACT_CONTRACT, "--answer", "No route changes in b either.", "--source", "user", "--json").code, 0);
  entry = stateOf(root, "npm-imports").retracted.at(-1);
  assert.strictEqual(entry.hits.length, 2);
  assert.match(entry.hits[1], PATH_HIT("functions/b/index.ts"));

  // A later edit of an answered path brings it back too.
  writeFile(root, "functions/a/index.ts", `${HANDLER_NPM}serve(() => new Response("gone", { status: 410 }));\n`);
  assert.ok(ospec(root, "check", "--change", "npm-imports", "--json").json.added.signals.includes("public-contract"));
  assert.strictEqual(contractOf(root), "pending");

  // So does a planned contract path the answer did not see.
  assert.strictEqual(ospec(root, ...RETRACT_CONTRACT, "--answer", "The new line keeps the routes.", "--source", "user", "--json").code, 0);
  assert.ok(ospec(root, "signals", "--change", "npm-imports", "--path", "functions/c/index.ts", "--json").json.added.signals.includes("public-contract"));
});

test("[#496] the user's answer covers a default contract path and the contract lines of a doc, but no contract document nor a path without lines", (t) => {
  const { root, git } = functionsProject(t);
  // A base pattern (**/api/**) and a doc line that cites an endpoint: one answer, both hits.
  writeFile(root, "src/api/users.js", "module.exports = () => []; // sorted elsewhere\n");
  writeFile(root, "SECURITY.md", "Report it through `POST /api/contact/`.\n");
  ospec(root, "check", "--change", "npm-imports", "--json");
  assert.strictEqual(ospec(root, ...RETRACT_CONTRACT, "--answer", "Nothing public changes.", "--source", "user", "--json").code, 0);
  const { hits } = stateOf(root, "npm-imports").retracted.at(-1);
  assert.strictEqual(hits.length, 2);
  assert.match(hits[0], PATH_HIT("src/api/users.js"));
  assert.strictEqual(hits[1], "SECURITY.md adds API: Report it through `POST /api/contact/`.");
  assert.ok(!hasContract(root));

  // A contract document among the paths is the contract itself.
  writeFile(root, "openapi.yaml", "openapi: 3.1.0\n");
  assert.ok(ospec(root, "check", "--change", "npm-imports", "--json").json.added.signals.includes("public-contract"));
  const document = ospec(root, ...RETRACT_CONTRACT, "--answer", "Nothing public changes.", "--source", "user", "--json");
  assert.strictEqual(document.json.error.code, "retract-answer-refused");
  assert.match(document.json.error.message, /openapi\.yaml is a contract document/);
  assert.doesNotMatch(ospec(root, ...RETRACT_CONTRACT, "--json").json.error.how ?? "", /--answer/);
  fs.rmSync(path.join(root, "openapi.yaml"));

  // A renamed function changes no line the answer could be tied to.
  git("mv", "functions/b", "functions/c");
  ospec(root, "check", "--change", "npm-imports", "--json");
  const renamed = ospec(root, ...RETRACT_CONTRACT, "--answer", "Nothing public changes.", "--source", "user", "--json");
  assert.strictEqual(renamed.json.error.code, "retract-answer-refused");
  assert.match(renamed.json.error.message, /functions\/[bc]\/index\.ts changes no line/);
  assert.strictEqual(contractOf(root), "pending");
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

// #496: a new file under a path that derives public-contract is answered as a changed one.
test("record retract takes the user's answer for a public contract a new file under a contract path derives", (t) => {
  const { root } = project(t);
  openFeature(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...FEATURE_COVER);
  ospec(root, "signals", "--change", "add-index", "--path", "src/api/search.js");
  writeFile(root, "src/api/search.js", "module.exports = {};\n");
  const answered = ospec(root, "record", "retract", "--change", "add-index", "--signal", "public-contract", "--reason", "internal", "--answer", "Not public.", "--source", "user", "--json");
  assert.strictEqual(answered.code, 0, answered.stderr);
  assert.strictEqual(stateOf(root, "add-index").obligations.find((o) => o.id === "contract-spec-and-test").status, "withdrawn");
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
