"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { assertSafeOutDir, buildClaudeMarketplace } = require("./claude-marketplace.js");

const SOURCE = path.join(__dirname, "__fixtures__", "source");

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-marketplace-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("assertSafeOutDir refuses the filesystem root", () => {
  const root = path.parse(process.cwd()).root;
  assert.throws(() => assertSafeOutDir(root, SOURCE), /filesystem root/);
});

test("assertSafeOutDir refuses an ancestor of the source tree", () => {
  assert.throws(() => assertSafeOutDir(path.dirname(SOURCE), SOURCE), /ancestor/);
});

test("assertSafeOutDir refuses --out equal to --source", () => {
  assert.throws(() => assertSafeOutDir(SOURCE, SOURCE), /equals --source/);
});

test("assertSafeOutDir refuses a non-empty dir that is not a prior marketplace build", (t) => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, "important.txt"), "data");
  assert.throws(() => assertSafeOutDir(dir, SOURCE), /not a previous marketplace build/);
});

test("assertSafeOutDir allows a fresh/empty dir", (t) => {
  const dir = tmp(t);
  assert.doesNotThrow(() => assertSafeOutDir(dir, SOURCE));
});

test("assertSafeOutDir allows clobbering a prior marketplace build", (t) => {
  const dir = tmp(t);
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude-plugin", "marketplace.json"), "{}");
  fs.writeFileSync(path.join(dir, "stale.txt"), "old build artifact");
  assert.doesNotThrow(() => assertSafeOutDir(dir, SOURCE));
});

test("buildClaudeMarketplace builds into a fresh dir and writes the marketplace manifest", (t) => {
  const out = path.join(tmp(t), "build");
  const result = buildClaudeMarketplace({
    source: SOURCE,
    out,
    validate: false,
    marketplaceName: "ospec-tools",
    pluginName: "ospec-workflow",
  });
  assert.ok(fs.existsSync(path.join(out, ".claude-plugin", "marketplace.json")));
  assert.equal(result.pluginDir, path.join(out, "plugins", "ospec-workflow"));
});

test("buildClaudeMarketplace refuses a destructive --out and leaves it untouched", (t) => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, "important.txt"), "data");
  assert.throws(
    () =>
      buildClaudeMarketplace({
        source: SOURCE,
        out: dir,
        validate: false,
        marketplaceName: "ospec-tools",
        pluginName: "ospec-workflow",
      }),
    /not a previous marketplace build/,
  );
  assert.ok(fs.existsSync(path.join(dir, "important.txt")), "pre-existing data must survive a refused build");
});
