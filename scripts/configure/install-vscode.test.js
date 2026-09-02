"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  getSettingsPaths,
  updateSettingsJsoncPreservingComments,
  ensurePluginsMarketplaces,
  upsertInstalledJSON,
  installIntoAgentPlugins,
  main,
} = require("./install-vscode.js");

test("parseArgs parses flags cleanly", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), {
    dryRun: true,
    validate: true,
    source: undefined,
  });
  assert.deepEqual(parseArgs(["--no-validate", "--source", "/custom/src"]), {
    dryRun: false,
    validate: false,
    source: "/custom/src",
  });
});

test("getSettingsPaths returns platform-specific paths", () => {
  const winPaths = getSettingsPaths({ platform: "win32", env: { APPDATA: "C:\\Users\\User\\AppData\\Roaming" } });
  assert.ok(winPaths.length > 0);
  assert.equal(winPaths[0].name, "VS Code");
});

test("updateSettingsJsoncPreservingComments preserves comments and structure", () => {
  const initialJsonc = `// Custom user configuration
{
  /* Primary theme */
  "workbench.colorTheme": "Default Dark+",
  "editor.fontSize": 14, // Line comment
}
`;
  const pluginPath = "C:/dev/ospec-workflow/dist/vscode";
  const { content, updated } = updateSettingsJsoncPreservingComments(initialJsonc, pluginPath);
  assert.equal(updated, true);
  assert.match(content, /\/\/ Custom user configuration/);
  assert.match(content, /\/\* Primary theme \*\//);
  assert.match(content, /\/\/ Line comment/);
  assert.match(content, /"chat\.plugins\.enabled": true/);
  assert.match(content, /"chat\.agentFilesLocations": \{\s*"C:\/dev\/ospec-workflow\/dist\/vscode\/agents": true\s*\}/);

  // Idempotency: second run does not modify
  const secondRun = updateSettingsJsoncPreservingComments(content, pluginPath);
  assert.equal(secondRun.updated, false);
  assert.equal(secondRun.content, content);
});

test("updateSettingsJsoncPreservingComments throws on invalid JSONC", () => {
  const invalidJsonc = `{\n  "unclosed": "missing quote\n}`;
  assert.throws(
    () => updateSettingsJsoncPreservingComments(invalidJsonc, "/some/path"),
    /Failed to parse JSONC/,
  );
});

test("main returns non-zero when settings file is corrupt", () => {
  const mockFs = {
    existsSync: (p) => p.includes("settings.json"),
    readFileSync: () => "{ corrupt json syntax",
    writeFileSync: () => {},
  };
  const exitCode = main([], {
    fs: mockFs,
    runConfigure: () => ({ exitCode: 0 }),
    copyBinaryToTree: () => {},
    homedir: () => "/home/user",
    env: { APPDATA: "C:/fake" },
    platform: "win32",
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(exitCode, 1);
});

test("updateSettingsJsoncPreservingComments converts scalar pluginLocations without duplication", () => {
  const initialJsonc = `{\n  "editor.fontSize": 14,\n  "chat.pluginLocations": "C:/other-plugin"\n}`;
  const pluginPath = "C:/dev/ospec-workflow/dist/vscode";
  const { content, updated } = updateSettingsJsoncPreservingComments(initialJsonc, pluginPath);
  assert.equal(updated, true);
  assert.match(content, /"chat\.pluginLocations": \[\s*"C:\/other-plugin",\s*"C:\/dev\/ospec-workflow\/dist\/vscode"\s*\]/);

  // Check no duplicate key was created
  const matches = content.match(/"chat\.pluginLocations"/g);
  assert.equal(matches.length, 1);
});

test("main creates settings.json when user settings directory exists", () => {
  const written = {};
  const mockFs = {
    existsSync: (p) => p.includes("User") && !p.includes("settings.json"),
    readFileSync: () => "",
    writeFileSync: (p, data) => { written[p] = data; },
  };
  const exitCode = main([], {
    fs: mockFs,
    runConfigure: () => ({ exitCode: 0 }),
    copyBinaryToTree: () => {},
    homedir: () => "/home/user",
    env: { APPDATA: "C:/fake" },
    platform: "win32",
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(exitCode, 0);
  assert.ok(Object.keys(written).some((p) => p.includes("settings.json")));
});

test("main returns 1 when no VS Code settings directory exists", () => {
  const mockFs = {
    existsSync: () => false,
    readFileSync: () => "",
    writeFileSync: () => {},
  };
  const exitCode = main([], {
    fs: mockFs,
    runConfigure: () => ({ exitCode: 0 }),
    copyBinaryToTree: () => {},
    homedir: () => "/home/user",
    env: { APPDATA: "C:/fake" },
    platform: "win32",
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(exitCode, 1);
});

test("updateSettingsJsoncPreservingComments adds agentFilesLocations when pluginLocations is already set", () => {
  const pluginPath = "C:/dev/ospec-workflow/dist/vscode";
  const initialJsonc = `{\n  "chat.pluginLocations": [\n    "${pluginPath}"\n  ]\n}`;
  const { content, updated } = updateSettingsJsoncPreservingComments(initialJsonc, pluginPath);
  assert.equal(updated, true);
  assert.match(content, /"chat\.pluginLocations"/);
  assert.match(content, /"C:\/dev\/ospec-workflow\/dist\/vscode\/agents": true/);

  const secondRun = updateSettingsJsoncPreservingComments(content, pluginPath);
  assert.equal(secondRun.updated, false);
});

test("updateSettingsJsoncPreservingComments handles array with trailing comma and comments", () => {
  const initialJsonc = `{\n  "chat.pluginLocations": [\n    "/existing/one", // first plugin\n    "/existing/two",\n  ],\n}`;
  const pluginPath = "/new/plugin";
  const { content, updated } = updateSettingsJsoncPreservingComments(initialJsonc, pluginPath);
  assert.equal(updated, true);
  assert.match(content, /"\/existing\/one"/);
  assert.match(content, /"\/existing\/two"/);
  assert.match(content, /"\/new\/plugin"/);
  assert.match(content, /\/\/ first plugin/);
});

test("ensurePluginsMarketplaces adds marketplace and is idempotent", () => {
  const initialJsonc = `{\n  // User config\n  "editor.fontSize": 14\n}`;
  const marketplace = "snakeblack/ospec-workflow";
  const { content, updated } = ensurePluginsMarketplaces(initialJsonc, marketplace);
  assert.equal(updated, true);
  assert.match(content, /"chat\.plugins\.marketplaces"/);
  assert.match(content, /"snakeblack\/ospec-workflow"/);
  assert.match(content, /\/\/ User config/);

  const secondRun = ensurePluginsMarketplaces(content, marketplace);
  assert.equal(secondRun.updated, false);
});

test("main preflight aborts before any writes when one settings file is corrupt", () => {
  const written = {};
  const mockFs = {
    existsSync: (p) => p.includes("settings.json"),
    readFileSync: (p) => {
      if (p.includes("Insiders")) return "{ corrupt json syntax";
      return '{\n  "editor.fontSize": 14\n}';
    },
    writeFileSync: (p, data) => { written[p] = data; },
  };
  const exitCode = main([], {
    fs: mockFs,
    runConfigure: () => ({ exitCode: 0 }),
    copyBinaryToTree: () => {},
    homedir: () => "/home/user",
    env: { APPDATA: "C:/fake" },
    platform: "win32",
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });
  assert.equal(exitCode, 1);
  assert.equal(Object.keys(written).length, 0, "No files must be written if any settings file fails preflight");
});

test("upsertInstalledJSON preserves other plugins and is idempotent", () => {
  const existing = JSON.stringify({
    version: 1,
    installed: [{
      pluginUri: "file:///home/user/.vscode/agent-plugins/github.com/microsoft/plugins/plugins/other",
      marketplace: "microsoft/plugins",
      name: "other",
    }],
  }, null, "\t");
  const pluginUri = "file:///home/user/.vscode/agent-plugins/github.com/snakeblack/ospec-workflow";
  const first = JSON.parse(upsertInstalledJSON(existing, pluginUri));
  assert.equal(first.installed.length, 2);
  assert.equal(first.installed[1].name, "ospec-workflow");
  assert.equal(first.installed[1].marketplace, "snakeblack/ospec-workflow");
  const second = JSON.parse(upsertInstalledJSON(JSON.stringify(first), pluginUri));
  assert.equal(second.installed.length, 2);
});

test("installIntoAgentPlugins copies the plugin and writes installed.json", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-agent-plugins-"));
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-plugin-src-"));
  fs.mkdirSync(path.join(src, "agents"), { recursive: true });
  fs.writeFileSync(path.join(src, ".plugin.json"), '{"name":"ospec-workflow"}\n');
  fs.writeFileSync(path.join(src, "agents", "sdd-apply.agent.md"), "---\ntarget: vscode\nmodel: GPT-5.6 Terra (copilot)\n---\n");
  try {
    const { dest, written } = installIntoAgentPlugins(src, { homedir: () => home, fs });
    assert.equal(written, 1);
    assert.equal(dest, path.join(home, ".vscode", "agent-plugins", "github.com", "snakeblack", "ospec-workflow"));
    const copied = fs.readFileSync(path.join(dest, "agents", "sdd-apply.agent.md"), "utf8");
    assert.match(copied, /target: vscode/);
    const manifest = JSON.parse(fs.readFileSync(path.join(home, ".vscode", "agent-plugins", "installed.json"), "utf8"));
    assert.equal(manifest.version, 1);
    assert.equal(manifest.installed[0].name, "ospec-workflow");
    assert.match(manifest.installed[0].pluginUri, /^file:/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
});



