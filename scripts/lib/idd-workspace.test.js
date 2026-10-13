"use strict";

// E1.3 impact-signals: the filesystem and git side of signal derivation —
// idd/config.yaml, the stack markers at the root and the diff against a base
// (openspec/specs/idd/spec.md, REQ-idd-012, REQ-idd-013).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  EMPTY_TREE,
  IddWorkspaceError,
  commitTree,
  readArchitecture,
  readCheckTreeFingerprint,
  readDecisionRecords,
  readFitnessSources,
  readGitDiff,
  readHead,
  readKnowledgeSources,
  readProjectContext,
  readTreeFingerprint,
  snapshotTree,
  treeBlobs,
  treeNumstat,
} = require("./idd-workspace.js");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idd-workspace-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function gitRepo(t) {
  const root = tempDir(t);
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "test");
  git(root, "config", "commit.gpgsign", "false");
  return root;
}

function commitAll(root, message) {
  git(root, "add", "-A");
  git(root, "commit", "-q", "--no-verify", "-m", message);
}

test("project context without a config uses the detected stacks and the defaults", (t) => {
  const root = tempDir(t);
  write(root, "package.json", "{}");
  const context = readProjectContext(root);
  assert.strictEqual(context.mode, null);
  assert.strictEqual(context.strictTdd, false);
  assert.deepStrictEqual(context.stacks, ["node"]);
  assert.ok(context.patterns["public-contract"].includes("**/routes/**"));
});

test("project context reads mode, strict_tdd and the impact section from idd/config.yaml", (t) => {
  const root = tempDir(t);
  write(root, "idd/config.yaml", "mode: idd\nstrict_tdd: true\nimpact:\n  public_contract:\n    - cli/**\n");
  const context = readProjectContext(root);
  assert.strictEqual(context.mode, "idd");
  assert.strictEqual(context.strictTdd, true);
  assert.deepStrictEqual(context.stacks, []);
  assert.ok(context.patterns["public-contract"].includes("cli/**"));
});

test("project context adds the files a public package.json publishes", (t) => {
  const root = tempDir(t);
  write(root, "package.json", JSON.stringify({ name: "tiny", main: "index.js", types: "index.d.ts" }));
  assert.deepStrictEqual(readProjectContext(root).patterns.published, ["index.d.ts", "index.js"]);
  write(root, "package.json", JSON.stringify({ name: "app", private: true, main: "src/app.js" }));
  assert.deepStrictEqual(readProjectContext(root).patterns.published, []);
  write(root, "package.json", "{ not json");
  assert.deepStrictEqual(readProjectContext(root).patterns.published, [], "a malformed manifest publishes nothing");
});

test("openspec/config.yaml is SDD configuration and never configures IDD", (t) => {
  const root = tempDir(t);
  write(root, "openspec/config.yaml", "strict_tdd: true\nimpact:\n  public_contract:\n    - cli/**\n");
  const context = readProjectContext(root);
  assert.strictEqual(context.strictTdd, false);
  assert.ok(!context.patterns["public-contract"].includes("cli/**"));
});

test("an invalid configuration is reported with its code", (t) => {
  const root = tempDir(t);
  write(root, "idd/config.yaml", "impact:\n  stack: cobol\n");
  assert.throws(() => readProjectContext(root), (error) => error.code === "impact-config-invalid");
  write(root, "idd/config.yaml", "workflow:\n  mode: idd\n");
  assert.throws(() => readProjectContext(root), (error) => error.code === "config-invalid");
});

test("the diff holds modified, deleted and untracked paths with their added lines", (t) => {
  const root = gitRepo(t);
  write(root, "src/api/orders.js", "const size = 20;\nmodule.exports = { size };\n");
  write(root, "src/legacy/fax.js", "module.exports = {};\n");
  commitAll(root, "base");

  write(root, "src/api/orders.js", "const size = 50;\nmodule.exports = { size };\n");
  fs.rmSync(path.join(root, "src/legacy/fax.js"));
  write(root, "db/migrations/002_drop.sql", "-- cleanup\nALTER TABLE customers DROP COLUMN fax;\n");
  write(root, "idd/c/state.yaml", "{}\n");

  const diff = readGitDiff(root);
  assert.deepStrictEqual(diff.paths, ["db/migrations/002_drop.sql", "src/api/orders.js", "src/legacy/fax.js"]);
  assert.deepStrictEqual(diff.addedLines["src/api/orders.js"], ["const size = 50;"]);
  assert.deepStrictEqual(diff.addedLines["db/migrations/002_drop.sql"], [
    "-- cleanup",
    "ALTER TABLE customers DROP COLUMN fax;",
  ]);
  assert.ok(!("src/legacy/fax.js" in diff.addedLines));
});

test("an untracked symlink is its target, never followed, in the diff and the tree fingerprint", (t) => {
  const root = gitRepo(t);
  const outside = tempDir(t);
  write(outside, "secret.txt", "outside the repository\n");
  write(root, "src/app.js", "module.exports = 1;\n");
  commitAll(root, "base");
  try {
    fs.symlinkSync("missing/target", path.join(root, "broken"));
    fs.symlinkSync(outside, path.join(root, "linkdir"), "dir");
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "linkfile"), "file");
  } catch (error) {
    t.skip(`symlink unavailable: ${error.message}`);
    return;
  }

  const diff = readGitDiff(root);
  assert.deepStrictEqual(diff.paths, ["broken", "linkdir", "linkfile"]);
  for (const link of diff.paths) {
    assert.deepStrictEqual(diff.addedLines[link], [fs.readlinkSync(path.join(root, link))], link);
  }
  assert.notDeepStrictEqual(diff.addedLines.linkfile, ["outside the repository"], "the target's content is not read");

  const before = readTreeFingerprint(root);
  write(outside, "secret.txt", "changed outside\n");
  assert.strictEqual(readTreeFingerprint(root), before, "the target's content is not read");
  // Node 24: fs.rmSync on a dangling symlink returns success and leaves the link.
  fs.unlinkSync(path.join(root, "broken"));
  fs.symlinkSync("other/target", path.join(root, "broken"));
  assert.notStrictEqual(readTreeFingerprint(root), before, "a new link target changes it");
});

test("the diff against a base includes committed work on the branch", (t) => {
  const root = gitRepo(t);
  write(root, "README.md", "x\n");
  commitAll(root, "base");
  const base = git(root, "rev-parse", "HEAD").trim();
  write(root, "src/auth/session.js", "module.exports = 1;\n");
  commitAll(root, "work");

  assert.deepStrictEqual(readGitDiff(root).paths, []);
  assert.deepStrictEqual(readGitDiff(root, { base }).paths, ["src/auth/session.js"]);
});

test("the diff is refused outside a git repository or with an unknown base", (t) => {
  const plain = tempDir(t);
  assert.throws(() => readGitDiff(plain), (error) => error instanceof IddWorkspaceError && error.code === "not-a-git-repo");

  const root = gitRepo(t);
  write(root, "a.txt", "a\n");
  commitAll(root, "base");
  assert.throws(() => readGitDiff(root, { base: "no-such-ref" }), (error) => error.code === "unknown-base");
  assert.throws(() => readGitDiff(root, { base: "--output=x" }), (error) => error.code === "unknown-base");
});

test("the head commit is the change base, and null outside git or before the first commit", (t) => {
  assert.strictEqual(readHead(tempDir(t)), null);
  const root = gitRepo(t);
  assert.strictEqual(readHead(root), null);
  write(root, "a.txt", "a\n");
  commitAll(root, "base");
  assert.strictEqual(readHead(root), git(root, "rev-parse", "HEAD").trim());
});

test("the source tree ignores idd/ while check-tree identity tracks only effective checks", (t) => {
  const root = gitRepo(t);
  write(root, "src/app.js", "module.exports = 1;\n");
  commitAll(root, "base");

  const clean = readTreeFingerprint(root);
  assert.match(clean, /^sha256:[0-9a-f]{64}$/);
  assert.strictEqual(readTreeFingerprint(root), clean, "stable for the same tree");

  write(root, "idd/fix/state.yaml", "{}\n");
  write(root, "idd/config.yaml", "strict_tdd: true\n");
  assert.strictEqual(readTreeFingerprint(root), clean, "IDD state is not part of the tree");
  const noChecks = readCheckTreeFingerprint(root);
  assert.strictEqual(readCheckTreeFingerprint(root), noChecks, "check identity is stable");

  write(root, "idd/config.yaml", "# verifier config\nstrict_tdd: false\n");
  assert.strictEqual(readCheckTreeFingerprint(root), noChecks, "unrelated config and formatting do not invalidate checks");
  write(root, "idd/config.yaml", "strict_tdd: false\nchecks:\n  test: npm test\n");
  const configured = readCheckTreeFingerprint(root);
  assert.notStrictEqual(configured, noChecks, "adding a check changes check identity");
  write(root, "idd/config.yaml", "strict_tdd: true # unrelated\nchecks:\n  test: npm test\n");
  assert.strictEqual(readCheckTreeFingerprint(root), configured, "unrelated fields and formatting preserve check identity");
  write(root, "idd/config.yaml", "checks:\n  test: npm run test\n");
  assert.notStrictEqual(readCheckTreeFingerprint(root), configured, "changing a command invalidates check identity");
  const changedChecks = readCheckTreeFingerprint(root);
  write(root, "idd/fix/state.yaml", "{\"status\":\"closed\"}\n");
  assert.strictEqual(readCheckTreeFingerprint(root), changedChecks, "CLI state writes do not invalidate check evidence");

  write(root, "src/app.js", "module.exports = 2;\n");
  const edited = readTreeFingerprint(root);
  assert.notStrictEqual(edited, clean, "a tracked edit changes it");

  write(root, "src/new.js", "1\n");
  const untracked = readTreeFingerprint(root);
  assert.notStrictEqual(untracked, edited, "an untracked file changes it");
  write(root, "src/new.js", "2\n");
  assert.notStrictEqual(readTreeFingerprint(root), untracked, "untracked content counts");

  fs.rmSync(path.join(root, "src/new.js"));
  write(root, "src/app.js", "module.exports = 1;\n");
  assert.strictEqual(readTreeFingerprint(root), clean, "back to the committed tree");

  assert.throws(() => readTreeFingerprint(tempDir(t)), (error) => error.code === "not-a-git-repo");
});

test("a snapshot tree holds tracked and untracked files without touching the index or idd/", (t) => {
  const root = gitRepo(t);
  write(root, "src/app.js", "one\n");
  write(root, ".gitignore", "*.log\n");
  commitAll(root, "base");
  const base = commitTree(root, readHead(root));
  assert.strictEqual(commitTree(root, null), EMPTY_TREE);

  write(root, "src/app.js", "one\ntwo\n");
  write(root, "src/new.js", "fresh\n");
  write(root, "debug.log", "ignored\n");
  write(root, "idd/fix/state.yaml", "{}\n");
  const before = git(root, "status", "--porcelain");
  const tree = snapshotTree(root);
  assert.strictEqual(git(root, "status", "--porcelain"), before, "the real index is untouched");

  const blobs = treeBlobs(root, tree);
  assert.ok(blobs.has("src/new.js"));
  assert.ok(!blobs.has("debug.log"));
  assert.ok(![...blobs.keys()].some((file) => file.startsWith("idd/")));
  assert.deepStrictEqual(treeNumstat(root, base, tree), [
    { path: "src/app.js", added: 1, deleted: 0 },
    { path: "src/new.js", added: 1, deleted: 0 },
  ]);
  assert.strictEqual(snapshotTree(root), tree, "the same working tree gives the same tree");
});

// ---------------------------------------------------------------------------
// Architecture references and new ADRs (E3.1, REQ-idd-020)
// ---------------------------------------------------------------------------

test("readArchitecture finds ADRs by id and scenarios in the knowledge map, and none without them", (t) => {
  const root = tempDir(t);
  assert.deepStrictEqual(readArchitecture(root), { adrs: new Map(), scenarios: new Set() });

  write(root, "docs/architecture/decisions/0002-sync.md", "# 0002. Integración síncrona\n\n- Status: accepted\n");
  write(root, "docs/architecture/decisions/README.md", "# Decisiones\n");
  write(root, "docs/architecture/knowledge-map.yaml", JSON.stringify({ quality_scenarios: [{ id: "deterministic-resume" }, { name: "sin id" }] }));
  const { adrs, scenarios } = readArchitecture(root);
  assert.deepStrictEqual([...adrs], [["0002", { path: "docs/architecture/decisions/0002-sync.md", status: "accepted" }]]);
  assert.deepStrictEqual([...scenarios], ["deterministic-resume"]);

  write(root, "docs/architecture/knowledge-map.yaml", "quality_scenarios:\n  - id: x\n");
  assert.throws(() => readArchitecture(root), (error) => error instanceof IddWorkspaceError && error.code === "knowledge-map-unreadable");
});

test("[REQ-idd-021] readKnowledgeSources reads the v2 map, ADR currency, scenarios, slots and glossary terms", (t) => {
  const root = tempDir(t);
  assert.deepStrictEqual(readKnowledgeSources(root), {
    map: null,
    sources: { adrs: new Map(), scenarios: new Set(), slots: new Map(), terms: null },
    warnings: [],
  });

  const map = {
    schema: "ospec-component-map/v2",
    components: [{ id: "engine", summary: "s", evidence: ["src/engine.js:1"], paths: ["src/**"], knowledge: { adrs: ["0001"] } }],
    boundaries: [],
    dependencies: [],
    divergences: [],
  };
  write(root, "src/engine.js", "module.exports = {};\n");
  write(root, "docs/architecture/component-map.yaml", JSON.stringify(map));
  write(root, "docs/architecture/decisions/0001-a.md", "# 0001. A\n\n- Status: accepted\n- Evidence: src/engine.js:1, src/engine.js:9\n");
  write(root, "docs/architecture/decisions/0002-b.md", "# 0002. B\n\n- Status: superseded by 0003\n- Evidence: src/engine.js:1\n");
  write(root, "docs/architecture/knowledge-map.yaml", JSON.stringify({ slots: [{ id: "team.shape", state: "confirmed" }], quality_scenarios: [{ id: "fast" }] }));
  write(root, "docs/product/glossary.md", "# Glossary\n\n## Change\n");
  const read = readKnowledgeSources(root);
  assert.deepStrictEqual(read.map, map);
  assert.deepStrictEqual(read.warnings, []);
  assert.deepStrictEqual([...read.sources.adrs.keys()], ["0001", "0002"]);
  assert.deepStrictEqual(read.sources.adrs.get("0001").evidence, ['"src/engine.js:9" is past the end of the file']);
  assert.deepStrictEqual(read.sources.adrs.get("0002"), { path: "docs/architecture/decisions/0002-b.md", status: "superseded", evidence: [] });
  assert.deepStrictEqual([...read.sources.scenarios], ["fast"]);
  assert.deepStrictEqual([...read.sources.slots], [["team.shape", "confirmed"]]);
  assert.deepStrictEqual([...read.sources.terms].sort(), ["change", "glossary"]);
});

test("[REQ-idd-021] an unreadable or invalid map is a warning with no map, never an error", (t) => {
  const root = tempDir(t);
  write(root, "docs/architecture/component-map.yaml", "components:\n  - id: x\n");
  write(root, "docs/architecture/knowledge-map.yaml", "slots: []\n");
  let read = readKnowledgeSources(root);
  assert.strictEqual(read.map, null);
  assert.strictEqual(read.warnings.length, 2);
  assert.match(read.warnings[0], /component-map\.yaml is not JSON text/);
  assert.match(read.warnings[1], /knowledge-map\.yaml is not JSON text/);

  write(root, "docs/architecture/component-map.yaml", JSON.stringify({ schema: "ospec-component-map/v2", components: [] }));
  write(root, "docs/architecture/knowledge-map.yaml", "{}");
  read = readKnowledgeSources(root);
  assert.strictEqual(read.map, null);
  assert.deepStrictEqual(read.warnings.length, 1);
  assert.match(read.warnings[0], /component-map\.yaml is not a valid component map: /);
});

test("readDecisionRecords reports a missing ADR, its lint errors and the ids it cites", (t) => {
  const root = tempDir(t);
  write(root, "docs/architecture/decisions/0003-eventos.md", "# 0003. Eventos\n\nEnmienda 0002; ver ADR-0001.\n");
  const records = readDecisionRecords(root, ["docs/architecture/decisions/0003-eventos.md", "docs/architecture/decisions/0004-x.md"]);
  assert.deepStrictEqual(records["docs/architecture/decisions/0004-x.md"], { exists: false });
  const read = records["docs/architecture/decisions/0003-eventos.md"];
  assert.strictEqual(read.id, "0003");
  assert.deepStrictEqual(read.cites, ["0003", "0002", "0001"]);
  assert.ok(read.errors.some((error) => /missing required property "status"/.test(error)), read.errors.join("\n"));
});

function adrText(id, status, fitness) {
  return `# ${id}. Decisión\n\n- Status: ${status}\n- Date: 2026-10-11\n\n## Context and drivers\nX.\n\n## Fitness function\n${fitness}\n\n## Review trigger\nY.\n`;
}

test("[REQ-idd-022] readFitnessSources reads ADR checks and v2 scenario fitness from the base, not the working tree", (t) => {
  const root = gitRepo(t);
  write(root, "docs/architecture/decisions/0006-memoria.md", adrText("0006", "accepted", "Nada importa la memoria.\n- Check: `node --test boundary.test.js`"));
  write(root, "docs/architecture/decisions/0003-cli.md", adrText("0003", "accepted", "Se rechaza en revisión."));
  write(root, "docs/architecture/decisions/old/0009-x.md", adrText("0009", "accepted", "- Check: `false`"));
  write(root, "docs/architecture/knowledge-map.yaml", JSON.stringify({
    schema: "ospec-knowledge-map/v2",
    quality_scenarios: [
      { id: "latency", fitness: { description: "p95", checks: ["npm run bench"] } },
      { id: "audit", fitness: { description: "Un auditor lo lee." } },
      { id: "plain" },
    ],
  }));
  commitAll(root, "base");
  const base = git(root, "rev-parse", "HEAD").trim();

  // The working tree weakens the check and adds an ADR; the base still rules.
  write(root, "docs/architecture/decisions/0006-memoria.md", adrText("0006", "accepted", "Nada importa la memoria."));
  write(root, "docs/architecture/decisions/0012-nuevo.md", adrText("0012", "accepted", "- Check: `npm test`"));

  const { sources, warnings } = readFitnessSources(root, base);
  assert.deepStrictEqual(warnings, []);
  assert.deepStrictEqual([...sources.adrs], [
    ["0003", { path: "docs/architecture/decisions/0003-cli.md", status: "accepted", checks: [], fitness: "Se rechaza en revisión." }],
    ["0006", { path: "docs/architecture/decisions/0006-memoria.md", status: "accepted", checks: ["node --test boundary.test.js"], fitness: "Nada importa la memoria. - Check: `node --test boundary.test.js`" }],
  ]);
  assert.deepStrictEqual([...sources.scenarios], [
    ["latency", { path: "docs/architecture/knowledge-map.yaml", checks: ["npm run bench"], description: "p95" }],
    ["audit", { path: "docs/architecture/knowledge-map.yaml", checks: [], description: "Un auditor lo lee." }],
  ]);
});

test("[REQ-idd-022] a v1 map has no scenario fitness, and an unreadable base or map is a warning", (t) => {
  const root = gitRepo(t);
  write(root, "docs/architecture/knowledge-map.yaml", JSON.stringify({ schema: "ospec-knowledge-map/v1", quality_scenarios: [{ id: "latency", fitness: { checks: ["x"] } }] }));
  commitAll(root, "v1");
  const v1 = readFitnessSources(root, "HEAD");
  assert.deepStrictEqual([v1.sources.scenarios.size, v1.warnings], [0, []]);

  write(root, "docs/architecture/knowledge-map.yaml", "quality_scenarios:\n  - id: x\n");
  commitAll(root, "yaml");
  assert.match(readFitnessSources(root, "HEAD").warnings[0], /knowledge-map\.yaml at the base is not JSON text/);
  assert.match(readFitnessSources(root, "0000000000000000000000000000000000000000").warnings[0], /cannot be read/);
  assert.match(readFitnessSources(root, null).warnings[0], /no base commit/);
});
