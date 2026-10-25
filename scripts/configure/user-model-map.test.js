"use strict";

// E4.12 acceptance: a fresh install writes no model name the user did not
// choose. Claude uses only its aliases, and an unassigned tier inherits the
// session model without error, Cursor included.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { withEngramStep } = require("./engram-setup.js");
const { userModelsPath, readUserModels } = require("../lib/user-models.js");

const ROOT = path.resolve(__dirname, "..", "..");
const AGENT_DIRS = {
  claude: "agents",
  vscode: "agents",
  "github-copilot": path.join(".github", "agents"),
  opencode: path.join(".opencode", "agents"),
  codex: path.join(".codex", "agents"),
  cursor: "agents",
};
const CLAUDE_ALIASES = new Set(["opus", "sonnet", "haiku"]);

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Every `model` an installed agent declares, TOML or frontmatter.
function declaredModels(out, target) {
  const dir = path.join(out, AGENT_DIRS[target]);
  const models = [];
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    const head = name.endsWith(".toml") ? text : (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [, ""])[1];
    const match = head.match(/^model\s*[:=]\s*(.*)$/m);
    if (match) models.push(match[1].trim().replace(/^"|"$/g, ""));
  }
  return models;
}

for (const target of Object.keys(AGENT_DIRS)) {
  test(`${target}: a fresh build writes ${target === "claude" ? "only Claude's aliases" : "no model name"} and the user's models once assigned`, (t) => {
    const fresh = tempDir(t, `ospec-e412-${target}-`);
    // Cursor's own validator runs: an agent without model must pass it.
    const validate = target === "cursor";
    const first = runConfigure({ sourceDir: ROOT, target, outDir: fresh, validate, withSdd: true });
    assert.equal(first.exitCode, 0, first.validation?.stderr);
    const names = declaredModels(fresh, target);
    if (target === "claude") {
      assert.ok(names.length > 0);
      assert.ok(names.every((name) => CLAUDE_ALIASES.has(name)), names.join(", "));
    } else {
      assert.deepEqual(names, [], `${target} must inherit until the user assigns a model`);
    }

    const assigned = tempDir(t, `ospec-e412-${target}-user-`);
    const userModels = { premium: "user-premium", default: "user-default", cheap: "user-cheap" };
    const second = runConfigure({ sourceDir: ROOT, target, outDir: assigned, validate, withSdd: true, userModels });
    assert.equal(second.exitCode, 0, second.validation?.stderr);
    const chosen = declaredModels(assigned, target);
    assert.ok(chosen.length > 0);
    assert.ok(chosen.every((name) => Object.values(userModels).includes(name)), chosen.join(", "));
  });
}

test("an installer takes --model, saves it for its host and reports the tiers left to inherit", (t) => {
  const home = tempDir(t, "ospec-e412-home-");
  const out = [];
  const stream = { write: (text) => out.push(String(text)) };
  let seen;
  const main = withEngramStep("codex", (argv, deps) => {
    seen = { argv, models: deps.models };
    return 0;
  });
  const code = main(["--with-sdd", "--model", "premium=gpt-sol"], { homedir: () => home, stdout: stream, stderr: stream });
  assert.equal(code, 0);
  assert.deepEqual(seen.argv, ["--with-sdd"]);
  assert.deepEqual(seen.models.userModels, { premium: "gpt-sol" });
  assert.deepEqual(readUserModels({ homedir: () => home, env: {} }).models, { codex: { premium: "gpt-sol" } });
  assert.equal(userModelsPath({ homedir: () => home, env: {} }), seen.models.file);
});

test("an installer refuses --model on a host that always inherits", (t) => {
  const home = tempDir(t, "ospec-e412-home-");
  const out = [];
  const stream = { write: (text) => out.push(String(text)) };
  let called = false;
  const main = withEngramStep("antigravity", () => { called = true; return 0; });
  assert.equal(main(["--model", "premium=x"], { homedir: () => home, stdout: stream, stderr: stream }), 2);
  assert.equal(called, false);
  assert.match(out.join(""), /hereda el modelo de la sesión/);
});

test("the summary shows each tier's model and says how to assign the rest", () => {
  const { createReporter, reportModels } = require("./install-output.js");
  const out = [];
  const stream = { write: (text) => out.push(String(text)) };
  const reporter = createReporter({ target: "cursor", stdout: stream, stderr: stream });
  reportModels(reporter, { userModels: { cheap: "composer" }, unassigned: ["premium", "default"], warning: "se ignora x", file: "/h/.config/ospec/models.yaml" }, "cursor");
  reporter.finish(0);
  const text = out.join("");
  assert.match(text, /Modelos\s+premium heredado · default heredado · cheap composer/);
  assert.match(text, /Asigna un modelo a premium, default con --model <tier>=<modelo> o con npm run setup:tui; se guarda en \/h\/\.config\/ospec\/models\.yaml/);
  assert.match(text, /aviso: se ignora x/);
});
