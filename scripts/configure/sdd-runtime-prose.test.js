"use strict";

// PR4c of the 2026-10-29 general review. The SDD prose runs the installed
// runtime, never a project-relative `scripts/`: a global install and the Claude
// plugin keep it outside the project. Claude substitutes ${CLAUDE_PLUGIN_ROOT}
// only in the bodies it loads (skills, commands, agents); the handlers the
// orchestrator reads on demand name `<ospec-runtime>`, which the orchestrator
// defines. Every other host renders the runtime marker in the whole tree.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure, PROFILES } = require("./cli.js");
const { RUNTIME_DIR_MARKER } = require("./shared-dir.js");

const ROOT = path.resolve(__dirname, "..", "..");
const CLAUDE_RUNTIME = "${CLAUDE_PLUGIN_ROOT}";
const ON_DEMAND_DIR = "<ospec-runtime>";
const RECHECK = "scripts/lib/verify-lineage-recheck.js";

function generate(t, target) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-sdd-runtime-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const result = runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false, withSdd: true });
  const prose = result.files.filter((file) => /\.(md|toml)$/.test(file.path)).map((file) => [file.path, String(file.content)]);
  return { out, prose, byPath: new Map(prose) };
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A body Claude loads itself, where it substitutes ${CLAUDE_PLUGIN_ROOT}.
const claudeLoadsBody = (file) => /^(agents|commands)\/[^/]+\.md$/.test(file) || /^skills\/[^/]+\/SKILL\.md$/.test(file);

function find(prose, pattern) {
  return prose.filter(([, content]) => pattern.test(content)).map(([file]) => file);
}

for (const target of Object.keys(PROFILES)) {
  const dirs = target === "claude" ? [CLAUDE_RUNTIME, ON_DEMAND_DIR] : [RUNTIME_DIR_MARKER];
  const dirPattern = `(?:${dirs.map(escape).join("|")})`;

  test(`${target}: SDD prose never runs a project-relative runtime script`, (t) => {
    const { prose } = generate(t, target);
    // `node scripts/sync-handbook.mjs` runs from the project's own `web-doc/`.
    assert.deepEqual(find(prose, /node\s+"?scripts\/[\w./-]+\.js\b/), [], `${target}: node scripts/….js`);
    assert.deepEqual(find(prose, /require\(['"]\.\/scripts\//), [], `${target}: require('./scripts/…')`);
    assert.deepEqual(find(prose, /<pluginInstallRoot>/), [], `${target}: <pluginInstallRoot>`);
    assert.deepEqual(find(prose, /\{\{ospec-runtime/), [], `${target}: unresolved runtime placeholder`);
  });

  test(`${target}: every runtime script the SDD prose names ships in the runtime`, (t) => {
    const { out, prose } = generate(t, target);
    const cited = new Set();
    for (const [, content] of prose) {
      for (const match of content.matchAll(new RegExp(`${dirPattern}/(scripts/[\\w./-]+?\\.js)`, "g"))) cited.add(match[1]);
    }
    for (const script of ["scripts/archive-transaction-run.js", "scripts/route-dispatch-run.js", "scripts/validate-phase.js", "scripts/phase-completion-run.js", "scripts/lib/ospec-state.js", RECHECK]) {
      assert.ok(cited.has(script), `${target}: the SDD prose must name ${script} under the runtime directory`);
    }
    const missing = [...cited].filter((script) => !fs.existsSync(path.join(out, ...script.split("/"))));
    assert.deepEqual(missing, [], `${target}: cited runtime scripts that do not ship`);
  });

  test(`${target}: the runners run from the runtime directory`, (t) => {
    const { prose } = generate(t, target);
    const runs = (script) => new RegExp(`node "${dirPattern}/scripts/${escape(script)}"`);
    for (const script of ["archive-transaction-run.js", "route-dispatch-run.js", "validate-phase.js", "phase-completion-run.js"]) {
      assert.notDeepEqual(find(prose, runs(script)), [], `${target}: no prose runs node "<runtime>/scripts/${script}"`);
    }
    assert.notDeepEqual(find(prose, new RegExp(`require\\('${dirPattern}/scripts/lib/ospec-state\\.js'\\)`)), [], `${target}: sdd-reconcile requires ospec-state from the runtime`);
  });

  if (target === "claude") {
    test("claude: loaded bodies name ${CLAUDE_PLUGIN_ROOT}; handlers read on demand name <ospec-runtime>", (t) => {
      const { prose, byPath } = generate(t, target);
      const onDemandCarriers = find(prose, new RegExp(escape(ON_DEMAND_DIR)));
      const orchestrator = "skills/sdd-orchestrator/SKILL.md";
      assert.deepEqual(onDemandCarriers.filter((file) => claudeLoadsBody(file) && file !== orchestrator), [], "a loaded body must name the substituted root");
      assert.ok(onDemandCarriers.includes("skills/_shared/gate-archive-quality.md"), "the archive handler is read on demand");
      assert.deepEqual(find(prose, new RegExp(escape(CLAUDE_RUNTIME))).filter((file) => !claudeLoadsBody(file)), [], "Claude does not substitute in a file it only reads");
      assert.match(byPath.get(orchestrator), /`<ospec-runtime>`[^\n]*`\$\{CLAUDE_PLUGIN_ROOT\}`/, "the orchestrator defines <ospec-runtime>");
      assert.match(byPath.get("agents/sdd-archive.md"), /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/archive-transaction-run\.js/, "an embedded handler resolves to the substituted root");
    });
  } else {
    test(`${target}: only the installer's runtime marker names the runtime`, (t) => {
      const { prose } = generate(t, target);
      assert.deepEqual(find(prose, new RegExp(`${escape(ON_DEMAND_DIR)}|${escape(CLAUDE_RUNTIME)}`)), [], target);
    });
  }
}

// Source prose names a runtime module through the placeholder. A bare path is
// left only where it is an example or names something outside the runtime.
const BARE_PATH_ALLOWED = new Map([
  ["agents/sdd-orchestrator.agent.md", ["scripts/lib/cache.js"]],
  ["skills/_shared/sdd-phase-common.md", ["scripts/lib/cache.js"]],
  ["skills/_shared/token-budget.md", ["scripts/docs-lint.test.js"]],
  ["skills/_shared/review-judgment.md", ["scripts/lib/review-lineage.js"]],
]);

function sddProseFiles() {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) visit(rel);
      else if (rel.endsWith(".md")) files.push(rel);
    }
  };
  for (const dir of fs.readdirSync(path.join(ROOT, "skills"))) {
    if (dir === "_shared" || dir.startsWith("sdd-")) visit(`skills/${dir}`);
  }
  for (const name of fs.readdirSync(path.join(ROOT, "agents"))) if (/^sdd-.*\.agent\.md$/.test(name)) files.push(`agents/${name}`);
  for (const name of fs.readdirSync(path.join(ROOT, "commands"))) if (/^sdd-.*\.prompt\.md$/.test(name)) files.push(`commands/${name}`);
  return files.sort();
}

test("source SDD prose names runtime modules through {{ospec-runtime}}", () => {
  const bare = [];
  for (const file of sddProseFiles()) {
    const content = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const match of content.matchAll(/(?<![\w./{}-])scripts\/[\w./-]+?\.js/g)) {
      if (!(BARE_PATH_ALLOWED.get(file) || []).includes(match[0])) bare.push(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual(bare, []);
});

test("the orchestrator's phase table lists every phase it delegates", () => {
  const source = fs.readFileSync(path.join(ROOT, "agents/sdd-orchestrator.agent.md"), "utf8");
  const agents = JSON.parse(source.match(/^agents: (\[.*\])$/m)[1].replace(/'/g, '"'));
  const phases = agents.filter((agent) => !agent.startsWith("review-"));
  const table = source.slice(source.indexOf("| Phase | Reads | Writes |"));
  const rows = new Set([...table.slice(0, table.indexOf("\n\n")).matchAll(/^\| `([a-z-]+)` \|/gm)].map((match) => match[1]));
  assert.deepEqual(phases.filter((phase) => !rows.has(phase)), []);
});
