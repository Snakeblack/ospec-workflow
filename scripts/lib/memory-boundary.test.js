"use strict";

// Fitness function of ADR-0006 (memory without authority): no module of the
// IDD engine reaches the memory detection, directly or through another module,
// so no IDD decision can depend on cross-session memory. The doctor may detect
// memory to diagnose the installation; it decides nothing.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const LIB = __dirname;
const MEMORY = new Set(["engram-detect.js"]);
const LOCAL_REQUIRE = /require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

function localRequires(file) {
  const text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(LOCAL_REQUIRE)].map((match) => path.resolve(path.dirname(file), match[1])).filter((target) => target.endsWith(".js"));
}

// The chain of local requires from `file` to a memory module, or null.
function memoryPath(file, seen = new Set()) {
  if (seen.has(file)) return null;
  seen.add(file);
  for (const target of localRequires(file)) {
    if (MEMORY.has(path.basename(target))) return [path.basename(file), path.basename(target)];
    const chain = memoryPath(target, seen);
    if (chain) return [path.basename(file), ...chain];
  }
  return null;
}

test("[ADR-0006] no IDD engine module reaches the memory detection", () => {
  const engine = fs.readdirSync(LIB).filter((name) => /^idd-.*\.js$/.test(name) && !name.endsWith(".test.js"));
  assert.ok(engine.length > 10, "the IDD engine modules are found");
  for (const name of engine) {
    const chain = memoryPath(path.join(LIB, name));
    assert.strictEqual(chain, null, `${name} reaches memory: ${chain?.join(" -> ")}`);
  }
});

test("[ADR-0006] the walker finds a memory module reached through another module", () => {
  assert.deepStrictEqual(memoryPath(path.join(LIB, "ospec-doctor.js")), ["ospec-doctor.js", "engram-detect.js"]);
});
