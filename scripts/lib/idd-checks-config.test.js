"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { candidateCheckCommand } = require("./idd-checks-config.js");

function project(t, manifest, locks = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-checks-config-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (manifest !== undefined) fs.writeFileSync(path.join(root, "package.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  for (const lock of locks) fs.writeFileSync(path.join(root, lock), "");
  return root;
}

for (const [manager, command] of Object.entries({ npm: "npm test", pnpm: "pnpm test", yarn: "yarn test", bun: "bun run test" })) {
  test(`a declared ${manager} manager is suggested ahead of a stale lockfile`, (t) => {
    const root = project(t, { scripts: { test: "node verify.js" }, packageManager: `${manager}@1.0.0` }, ["yarn.lock", "package-lock.json"]);
    assert.equal(candidateCheckCommand(root), command);
  });
}

test("root lockfiles select an undeclared manager and conflicting locks need a user command", (t) => {
  const manifest = { scripts: { test: "node verify.js" } };
  for (const [lock, command] of Object.entries({ "pnpm-lock.yaml": "pnpm test", "yarn.lock": "yarn test", "bun.lock": "bun run test", "bun.lockb": "bun run test", "package-lock.json": "npm test", "npm-shrinkwrap.json": "npm test" })) {
    assert.equal(candidateCheckCommand(project(t, manifest, [lock])), command);
  }
  assert.equal(candidateCheckCommand(project(t, manifest)), "npm test");
  assert.equal(candidateCheckCommand(project(t, manifest, ["package-lock.json", "pnpm-lock.yaml"])), null);
  assert.equal(candidateCheckCommand(project(t, manifest, ["package-lock.json", "npm-shrinkwrap.json"])), "npm test");
});

test("missing or malformed manifests, placeholders and invalid managers provide no command", (t) => {
  const manifests = [undefined, "{broken", "null", {}, { scripts: {} }, { scripts: { test: false } },
    { scripts: { test: "  " } }, { scripts: { test: 'echo "Error: no test specified" && exit 1' } },
    ...[null, ["pnpm@1.0.0"], { toString: "pnpm@1.0.0" }, "unknown@1.0.0", "pnpm"].map((packageManager) => ({ scripts: { test: "node verify.js" }, packageManager }))];
  for (const manifest of manifests) assert.equal(candidateCheckCommand(project(t, manifest)), null, JSON.stringify(manifest));
});

test("a suggestion executes no script and creates no configuration", (t) => {
  const root = project(t, { scripts: { test: 'node -e "require(\'fs\').writeFileSync(\'executed\', \'yes\')"' } });
  const before = fs.readdirSync(root);
  assert.equal(candidateCheckCommand(root), "npm test");
  assert.deepEqual(fs.readdirSync(root), before);
});
