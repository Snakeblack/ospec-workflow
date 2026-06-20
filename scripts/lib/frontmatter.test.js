"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parse,
  serialize,
  getField,
  stripKeys,
  setScalar,
  setArray,
} = require("./frontmatter.js");

const SAMPLE = [
  "---",
  "name: sdd-apply",
  "description: 'Implement tasks.'",
  "tools: ['read', 'search', 'edit']",
  "user-invocable: false",
  "target: vscode",
  "---",
  "",
  "# SDD Apply",
  "Body line.",
  "",
].join("\n");

test("parse splits frontmatter fields from the body", () => {
  const { frontmatter, body } = parse(SAMPLE);

  assert.equal(getField(frontmatter, "name").value, "sdd-apply");
  assert.equal(getField(frontmatter, "description").value, "Implement tasks.");
  assert.deepEqual(getField(frontmatter, "tools").value, [
    "read",
    "search",
    "edit",
  ]);
  assert.ok(body.startsWith("\n# SDD Apply"));
});

test("serialize round-trips unmodified content byte-for-byte", () => {
  assert.equal(serialize(parse(SAMPLE)), SAMPLE);
});

test("parse returns empty frontmatter when no block is present", () => {
  const text = "# Just a body\nNo frontmatter.\n";
  const { frontmatter, body } = parse(text);

  assert.deepEqual(frontmatter, []);
  assert.equal(body, text);
});

test("parse is tolerant of non-string input", () => {
  assert.deepEqual(parse(null), { frontmatter: [], body: "" });
});

test("stripKeys removes only the named top-level keys", () => {
  const parsed = parse(SAMPLE);
  parsed.frontmatter = stripKeys(parsed.frontmatter, [
    "target",
    "user-invocable",
  ]);
  const out = serialize(parsed);

  assert.ok(!out.includes("target:"));
  assert.ok(!out.includes("user-invocable:"));
  assert.ok(out.includes("name: sdd-apply"));
  assert.ok(out.includes("# SDD Apply"));
});

test("setScalar replaces an existing key and appends a new one", () => {
  let { frontmatter, body } = parse(SAMPLE);
  frontmatter = setScalar(frontmatter, "name", "renamed");
  frontmatter = setScalar(frontmatter, "context", "fork");
  const out = serialize({ frontmatter, body });

  assert.ok(out.includes("name: renamed"));
  assert.ok(out.includes("context: fork"));
  assert.ok(!out.includes("name: sdd-apply"));
});

test("setScalar quotes values that would break a plain scalar", () => {
  let { frontmatter, body } = parse(SAMPLE);
  frontmatter = setScalar(
    frontmatter,
    "description",
    "Manage the atlas: scaffold it (init), report status.",
  );
  const out = serialize({ frontmatter, body });

  assert.ok(
    out.includes(
      'description: "Manage the atlas: scaffold it (init), report status."',
    ),
  );
  // Round-trips back to the original unquoted value.
  assert.equal(
    getField(parse(out).frontmatter, "description").value,
    "Manage the atlas: scaffold it (init), report status.",
  );
});

test("setScalar leaves safe plain scalars unquoted", () => {
  let { frontmatter, body } = parse(SAMPLE);
  frontmatter = setScalar(frontmatter, "description", "Run apply for a change.");
  frontmatter = setScalar(frontmatter, "name", "renamed");
  const out = serialize({ frontmatter, body });

  assert.ok(out.includes("description: Run apply for a change."));
  assert.ok(out.includes("name: renamed"));
});

test("setArray writes an inline list in repo style", () => {
  let { frontmatter, body } = parse(SAMPLE);
  frontmatter = setArray(frontmatter, "tools", ["Read", "Grep", "Glob"]);
  const out = serialize({ frontmatter, body });

  assert.ok(out.includes("tools: ['Read', 'Grep', 'Glob']"));
});

test("parse preserves nested block fields untouched on serialize", () => {
  const text = [
    "---",
    "name: x",
    "metadata:",
    "  author: me",
    '  version: "3.0"',
    "---",
    "body",
    "",
  ].join("\n");

  assert.equal(serialize(parse(text)), text);
});
