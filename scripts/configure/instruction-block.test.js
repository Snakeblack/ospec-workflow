"use strict";

// Roadmap E0.4: the router lands in files the user also owns, so it lives
// between markers that a reinstall replaces and a removal takes out cleanly.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  BEGIN,
  END,
  isLegacyOrchestratorFile,
  removeBlock,
  removeRouterBlock,
  upsertBlock,
  writeRouterBlock,
} = require("./instruction-block.js");

function tmpFile(t, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-block-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "AGENTS.md");
  if (content !== undefined) fs.writeFileSync(file, content);
  return file;
}

test("upsertBlock creates the block alone in an empty file", () => {
  assert.equal(upsertBlock("", "# Router\n"), `${BEGIN}\n# Router\n${END}\n`);
  assert.equal(upsertBlock(undefined, "# Router"), `${BEGIN}\n# Router\n${END}\n`);
});

test("upsertBlock appends after the user's content and replaces only its own block later", () => {
  const first = upsertBlock("# Mine\n\nKeep this.\n", "# Router v1");
  assert.equal(first, `# Mine\n\nKeep this.\n\n${BEGIN}\n# Router v1\n${END}\n`);
  const edited = first + "\n## Added by the user later\n";
  const second = upsertBlock(edited, "# Router v2");
  assert.equal(second, `# Mine\n\nKeep this.\n\n${BEGIN}\n# Router v2\n${END}\n\n## Added by the user later\n`);
  assert.equal(upsertBlock(second, "# Router v2"), second, "idempotent");
});

test("removeBlock restores the user's content", () => {
  const original = "# Mine\n\nKeep this.\n";
  assert.equal(removeBlock(upsertBlock(original, "# Router")), original);
  assert.equal(removeBlock(upsertBlock("", "# Router")), "");
  const around = `# Top\n\n${BEGIN}\nx\n${END}\n\n# Bottom\n`;
  assert.equal(removeBlock(around), "# Top\n\n# Bottom\n");
  assert.equal(removeBlock(original), original, "no block, no change");
});

test("a begin marker without its end marker is refused, never guessed", () => {
  const broken = `# Mine\n${BEGIN}\nhalf a block\n`;
  assert.throws(() => upsertBlock(broken, "# Router"), /no end marker/);
  assert.throws(() => removeBlock(broken), /no end marker/);
});

test("the pre-E0.4 orchestrator file is recognised as legacy only without markers", () => {
  assert.ok(isLegacyOrchestratorFile("\n# SDD Orchestrator\n\nCoordinate phases.\n"));
  assert.ok(!isLegacyOrchestratorFile("# My project\n\nNotes about # SDD Orchestrator inline.\n"));
  assert.ok(!isLegacyOrchestratorFile(upsertBlock("# SDD Orchestrator\n", "# Router")));
});

test("writeRouterBlock keeps user content, and replaces a legacy file entirely", (t) => {
  const user = tmpFile(t, "# Mine\n");
  writeRouterBlock(user, "# Router\n");
  assert.equal(fs.readFileSync(user, "utf8"), `# Mine\n\n${BEGIN}\n# Router\n${END}\n`);

  const legacy = tmpFile(t, "\n# SDD Orchestrator\n\n63 KB of protocol\n");
  writeRouterBlock(legacy, "# Router\n");
  assert.equal(fs.readFileSync(legacy, "utf8"), `${BEGIN}\n# Router\n${END}\n`);

  const owned = tmpFile(t, "anything the previous install owned\n");
  writeRouterBlock(owned, "# Router\n", { replaceWhole: true });
  assert.equal(fs.readFileSync(owned, "utf8"), `${BEGIN}\n# Router\n${END}\n`);

  const missing = tmpFile(t);
  writeRouterBlock(missing, "# Router\n");
  assert.equal(fs.readFileSync(missing, "utf8"), `${BEGIN}\n# Router\n${END}\n`);
});

test("removeRouterBlock takes the block out and deletes a file left empty", (t) => {
  const user = tmpFile(t, "# Mine\n");
  writeRouterBlock(user, "# Router\n");
  assert.equal(removeRouterBlock(user), true);
  assert.equal(fs.readFileSync(user, "utf8"), "# Mine\n");

  const only = tmpFile(t);
  writeRouterBlock(only, "# Router\n");
  assert.equal(removeRouterBlock(only), true);
  assert.ok(!fs.existsSync(only));

  assert.equal(removeRouterBlock(tmpFile(t)), false, "a missing file is left alone");
  const untouched = tmpFile(t, "# Mine\n");
  assert.equal(removeRouterBlock(untouched), false);
  assert.equal(fs.readFileSync(untouched, "utf8"), "# Mine\n");
});
