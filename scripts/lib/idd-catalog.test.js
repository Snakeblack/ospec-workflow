"use strict";

// E1.42 the IDD catalog the Go hooks embed (internal/iddsession/catalog.json)
// is the one the CLI emits, so Stop and PreCompact give the step of ospec next
// (openspec/specs/hooks/spec.md §4.7).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { CHANGE_ID_PATTERN, OBLIGATIONS } = require("./idd-contract.js");
const { HOW } = require("./idd-next.js");
const { CATALOG_FILE, CHANGE_PLACEHOLDER, iddCatalog, renderCatalog } = require("./idd-catalog.js");

const ROOT = path.resolve(__dirname, "..", "..");

test("the catalog Go embeds is the one the CLI emits", () => {
  const committed = fs.readFileSync(path.join(ROOT, CATALOG_FILE), "utf8");
  assert.strictEqual(committed, renderCatalog(), `${CATALOG_FILE} is stale: run node scripts/lib/idd-catalog.js --write`);
});

test("each how is a template of the change id, which Go fills in", () => {
  assert.ok(!CHANGE_ID_PATTERN.test(CHANGE_PLACEHOLDER), "no change id may hold the placeholder");
  const { obligations } = iddCatalog();
  assert.deepStrictEqual(obligations.map(({ id }) => id), OBLIGATIONS.map(({ id }) => id));
  for (const { id, how } of obligations) {
    assert.strictEqual(how.replaceAll(CHANGE_PLACEHOLDER, "fix-a"), HOW[id]("fix-a"), id);
  }
});
