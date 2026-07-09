"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { assertSafeOutDir, buildCodexMarketplace } = require("./codex-marketplace.js");

const SOURCE = path.join(__dirname, "__fixtures__", "source");
const WORKFLOW = path.join(__dirname, "..", "..", ".github", "workflows", "publish-marketplace.yml");
const README = path.join(__dirname, "..", "..", "README.md");
const INSTALL_GUIDE = path.join(__dirname, "..", "..", "docs", "plugin-installation.md");

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-marketplace-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("buildCodexMarketplace emits the documented Codex catalog and isolated plugin payload", (t) => {
  const out = path.join(tmp(t), "release");
  const result = buildCodexMarketplace({ source: SOURCE, out, validate: false });
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(out, ".agents", "plugins", "marketplace.json"), "utf8"),
  );

  assert.equal(marketplace.name, "ospec-tools");
  assert.deepEqual(marketplace.plugins, [
    {
      name: "ospec-workflow",
      source: { source: "local", path: "./plugins/codex/ospec-workflow" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Productivity",
    },
  ]);
  assert.deepEqual(marketplace.interface, { displayName: "OSpec Tools" });
  assert.equal(result.pluginDir, path.join(out, "plugins", "codex", "ospec-workflow"));
  assert.ok(fs.existsSync(path.join(result.pluginDir, ".codex-plugin", "plugin.json")));
  assert.equal(fs.existsSync(path.join(out, "marketplace.json")), false);
});

test("buildCodexMarketplace preserves the Claude marketplace and plugin payload", (t) => {
  const out = path.join(tmp(t), "release");
  const claudeManifest = path.join(out, ".claude-plugin", "marketplace.json");
  const claudePlugin = path.join(out, "plugins", "ospec-workflow", "marker.txt");
  fs.mkdirSync(path.dirname(claudeManifest), { recursive: true });
  fs.mkdirSync(path.dirname(claudePlugin), { recursive: true });
  fs.writeFileSync(claudeManifest, "{\"claude\":true}\n");
  fs.writeFileSync(claudePlugin, "preserve me\n");

  buildCodexMarketplace({ source: SOURCE, out, validate: false });

  assert.equal(fs.readFileSync(claudeManifest, "utf8"), "{\"claude\":true}\n");
  assert.equal(fs.readFileSync(claudePlugin, "utf8"), "preserve me\n");
});

test("assertSafeOutDir refuses a Codex release build at the source root", () => {
  assert.throws(() => assertSafeOutDir(SOURCE, SOURCE), /equals --source/);
});

test("assertSafeOutDir permits a child staging directory", (t) => {
  const out = path.join(tmp(t), "release");
  assert.doesNotThrow(() => assertSafeOutDir(out, SOURCE));
});

test("release workflow assembles both marketplaces without moving Claude paths", () => {
  const workflow = fs.readFileSync(WORKFLOW, "utf8");

  assert.match(workflow, /node scripts\/configure\/claude-marketplace\.js --no-validate/);
  assert.match(workflow, /node scripts\/configure\/codex-marketplace\.js --out dist\/claude-marketplace --no-validate/);
  assert.match(workflow, /dist\/claude-marketplace\/plugins\/ospec-workflow\/scripts\/hooks/);
  assert.match(workflow, /cd dist\/claude-marketplace/);
});

test("release workflow registers the published Codex catalog with the documented ref and sparse paths", () => {
  const workflow = fs.readFileSync(WORKFLOW, "utf8");
  const installCli = workflow.indexOf("npm install -g @openai/codex");
  const addMarketplace = workflow.indexOf(
    "codex plugin marketplace add ${GITHUB_REPOSITORY} --ref release --sparse .agents/plugins --sparse plugins/codex/ospec-workflow",
  );

  assert.ok(installCli >= 0, "the workflow must install the Codex CLI");
  assert.ok(addMarketplace > installCli, "the remote marketplace must be registered after installing Codex");
  assert.match(workflow, /codex plugin marketplace list/);
  assert.doesNotMatch(workflow, /#release/);
  assert.doesNotMatch(workflow, /codex plugin add/);
});

test("public documentation describes documented remote registration and interactive installation", () => {
  for (const documentPath of [README, INSTALL_GUIDE]) {
    const document = fs.readFileSync(documentPath, "utf8");

    assert.match(
      document,
      /codex plugin marketplace add snakeblack\/ospec-workflow --ref release --sparse .agents\/plugins --sparse plugins\/codex\/ospec-workflow/,
    );
    assert.match(document, /\/plugins/);
    assert.match(document, /npm run setup:codex/);
    assert.doesNotMatch(document, /codex plugin marketplace add[^\r\n]*#release/);
    assert.doesNotMatch(document, /codex plugin add/);
  }
});
