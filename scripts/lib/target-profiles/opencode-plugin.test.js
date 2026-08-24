"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { PLUGIN_SOURCE } = require("./opencode-plugin.js");

function extractResolveBinary() {
  const match = PLUGIN_SOURCE.match(/export function resolveBinary\(([^)]*)\) \{([\s\S]*?)\n\}/);
  assert.ok(match, "plugin must export resolveBinary for layout tests");
  return new Function("resolve", "join", "existsSync", `return function resolveBinary(${match[1]}) {${match[2]}\n};`)(
    path.win32.resolve,
    path.win32.join,
    () => false,
  );
}

test("resolveBinary prefers the global OpenCode release directory", () => {
  const resolveBinary = extractResolveBinary();
  const pluginDir = "C:\\Users\\ManuelRetamozoGarcía\\.config\\opencode\\plugins";
  const globalBinary = "C:\\Users\\ManuelRetamozoGarcía\\.config\\opencode\\release\\dist\\ospec-hooks.exe";
  const localBinary = "C:\\Users\\ManuelRetamozoGarcía\\.config\\release\\dist\\ospec-hooks.exe";

  assert.equal(
    resolveBinary({ here: pluginDir, extension: ".exe", exists: (candidate) => candidate === globalBinary || candidate === localBinary }),
    globalBinary,
  );
});

test("resolveBinary falls back to the project-local release directory", () => {
  const resolveBinary = extractResolveBinary();
  const pluginDir = "C:\\repos\\proyecto\\.opencode\\plugins";
  const localBinary = "C:\\repos\\proyecto\\release\\dist\\ospec-hooks.exe";

  assert.equal(
    resolveBinary({ here: pluginDir, extension: ".exe", exists: (candidate) => candidate === localBinary }),
    localBinary,
  );
});

test("resolveBinary uses PATH only when neither managed layout contains a binary", () => {
  const resolveBinary = extractResolveBinary();

  assert.equal(
    resolveBinary({ here: "C:\\repos\\proyecto\\.opencode\\plugins", extension: ".exe", exists: () => false }),
    "ospec-hooks.exe",
  );
});
