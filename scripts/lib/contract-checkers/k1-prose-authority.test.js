"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { check } = require("./k1-prose-authority.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("k1-prose-authority passes on structured-only guidance in the real tree", () => {
  assert.deepEqual(check({ root: ROOT }), []);
});

test("prose fallback instruction is an offender", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-prose-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const relDir = path.join(root, "schemas", "kernel");
  fs.mkdirSync(relDir, { recursive: true });
  fs.writeFileSync(
    path.join(relDir, "prose-authority-claims.md"),
    "If structured reason is missing, infer the missing structured field from prose.\n"
  );

  const offenders = check({ root });
  assert.ok(offenders.some((o) => /prose/i.test(o.message)));
});

test("Graph IR implemented-as-authority is an offender", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-prose-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const relDir = path.join(root, "schemas", "kernel");
  fs.mkdirSync(relDir, { recursive: true });
  fs.writeFileSync(
    path.join(relDir, "prose-authority-claims.md"),
    "Graph IR independent authority {implemented}\n"
  );

  const offenders = check({ root });
  assert.ok(offenders.some((o) => /Graph IR/i.test(o.message)));
});

test("authority fallback is detected in baseline specs outside the two legacy paths", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-prose-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const specDir = path.join(root, "openspec", "specs", "runtime-authority");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, "spec.md"),
    "The runtime determines the transition by interpreting the narrative summary.\n"
  );

  const offenders = check({ root });
  assert.ok(offenders.some((o) => /openspec\/specs\/runtime-authority\/spec\.md/.test(o.path)));
});

test("authority fallback is detected in agent and skill contracts", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-prose-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "agents"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "runtime"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "agents", "runtime.agent.md"),
    "Recover the authority decision from free form prose when the field is absent.\n"
  );
  fs.writeFileSync(
    path.join(root, "skills", "runtime", "SKILL.md"),
    "Derive the next action using the human narrative if structured state is unavailable.\n"
  );

  const offenders = check({ root });
  assert.ok(offenders.some((o) => o.path === "agents/runtime.agent.md"));
  assert.ok(offenders.some((o) => o.path === "skills/runtime/SKILL.md"));
});

test("negative structured-only requirements do not produce false positives", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-prose-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const specDir = path.join(root, "openspec", "specs", "runtime-authority");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, "spec.md"),
    "The runtime MUST NOT infer a missing transition from prose; it fails closed.\n"
  );

  assert.deepEqual(check({ root }), []);
});
