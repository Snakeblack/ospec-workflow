"use strict";

// Helpers of the end-to-end contract of the ospec CLI (scripts/ospec.test.js
// and scripts/ospec.<area>.test.js): each one runs the CLI as a child process
// against a temporary project root. The contract is split by area so that
// node --test runs the parts in parallel.

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const CLI = path.join(__dirname, "..", "..", "ospec.js");

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

const DECLARED_DELIVERY = "checks:\n  test: node verify.js\ndelivery:\n  changelog: CHANGELOG.md\n  release: per-change\n";

function closeDocsChange(root) {
  ospec(root, ...OPEN_DOCS);
  writeFile(root, "src/pages.txt", "2");
  assert.strictEqual(ospec(root, "check", "--change", "fix-readme", "--json").json.verdict, "ready");
  return ospec(root, "close", "--change", "fix-readme", "--json");
}

function doctor(t, root, ...args) {
  const home = tempRoot(t);
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData", "Roaming") };
  for (const name of Object.keys(env)) if (name.startsWith("DISABLE_") || ["CODEX_HOME", "XDG_CONFIG_HOME", "CLAUDE_CONFIG_DIR"].includes(name)) delete env[name];
  const result = spawnSync(process.execPath, [CLI, "doctor", ...args, "--root", root], { encoding: "utf8", env });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, json: args.includes("--json") ? JSON.parse(result.stdout) : null };
}

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

const E2E = "node -e \"require('fs').appendFileSync('e2e.log', 'x')\"";

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

module.exports = {
  CLI,
  plainRoot,
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
  openRotation,
  review,
  BLOCKER,
  answer,
  recordAnswer,
  DECLARED_DELIVERY,
  closeDocsChange,
  doctor,
  adrText,
  architectureProject,
  OPEN_EVENTS,
  fitnessProject,
  E2E,
  PAGES_TEST,
  chain,
  chainProject,
  OPEN_PAGES,
  RED_PAGES,
};
