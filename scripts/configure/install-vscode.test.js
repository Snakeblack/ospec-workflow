"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { parseArgs, getSettingsPaths, updateSettingsJsoncPreservingComments, main } = require("./install-vscode.js");

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
  assert.match(content, /"chat\.pluginLocations": \[\s*"C:\/dev\/ospec-workflow\/dist\/vscode"\s*\]/);

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
