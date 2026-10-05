"use strict";

// E1.2 ospec-cli-core: filesystem adapter for idd/<change-id>/state.yaml
// (openspec/specs/idd/spec.md, REQ-idd-002, REQ-idd-003, REQ-idd-011).
// Writes are locked, atomic and idempotent; an interrupted write never
// corrupts the committed state.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { EVIDENCE_MARKERS, LIVING_DOC_SECTIONS } = require("./idd-contract.js");
const { recordIntent, recordSignal } = require("./idd-record.js");
const { listChanges, mutateChange, readChange, serializeState, statePath } = require("./idd-store.js");

const BUG = { change: "fix-pagination", kind: "bug", summary: "Fix the last page.", acceptance: "Two full pages." };

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idd-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const openBug = (state) => recordIntent(state, BUG);
const addBugFix = (state) => recordSignal(state, { id: "bug-fix", reason: "intent kind bug", source: "declaration" });

test("the state lives in idd/<change-id>/state.yaml as canonical JSON", async (t) => {
  const root = tempRoot(t);
  const { state, changed } = await mutateChange(root, "fix-pagination", openBug);
  assert.strictEqual(changed, true);
  assert.strictEqual(statePath(root, "fix-pagination"), path.join(root, "idd", "fix-pagination", "state.yaml"));

  const raw = fs.readFileSync(statePath(root, "fix-pagination"), "utf8");
  assert.strictEqual(raw, serializeState(state));
  assert.ok(raw.endsWith("\n"));
  assert.deepStrictEqual(Object.keys(JSON.parse(raw)), [
    "schema",
    "change",
    "mode",
    "status",
    "intent",
    "signals",
    "obligations",
    "gates",
    "evidence",
  ]);
  assert.deepStrictEqual(await readChange(root, "fix-pagination"), state);
});

test("repeating a record leaves the file byte-identical and untouched", async (t) => {
  const root = tempRoot(t);
  await mutateChange(root, "fix-pagination", openBug);
  await mutateChange(root, "fix-pagination", addBugFix);
  const file = statePath(root, "fix-pagination");
  const before = fs.readFileSync(file, "utf8");
  const mtime = fs.statSync(file).mtimeMs;

  const again = await mutateChange(root, "fix-pagination", addBugFix);
  assert.strictEqual(again.changed, false);
  assert.strictEqual(fs.readFileSync(file, "utf8"), before);
  assert.strictEqual(fs.statSync(file).mtimeMs, mtime);
  assert.strictEqual(JSON.parse(before).signals.filter((s) => s.id === "bug-fix").length, 1);
});

test("an interrupted write keeps the committed state and the next record succeeds", async (t) => {
  const root = tempRoot(t);
  const committed = (await mutateChange(root, "fix-pagination", openBug)).state;
  const file = statePath(root, "fix-pagination");

  const crashingWriter = async (target, content) => {
    await fsp.writeFile(`${target}.tmp`, content.slice(0, 20), "utf8");
    throw new Error("simulated crash before rename");
  };
  await assert.rejects(mutateChange(root, "fix-pagination", addBugFix, { writeFile: crashingWriter }), /simulated crash/);

  assert.deepStrictEqual(await readChange(root, "fix-pagination"), committed);
  assert.ok(!fs.existsSync(`${file}.lock`), "the lock is released after a failed write");

  const { state } = await mutateChange(root, "fix-pagination", addBugFix);
  assert.deepStrictEqual(state.signals.map((s) => s.id), ["always", "bug-fix"]);
  assert.ok(!fs.existsSync(`${file}.tmp`));
});

test("an orphaned backup left by a crash on rename is restored on read", async (t) => {
  const root = tempRoot(t);
  const committed = (await mutateChange(root, "fix-pagination", openBug)).state;
  const file = statePath(root, "fix-pagination");
  fs.renameSync(file, `${file}.bak`);

  assert.deepStrictEqual(await readChange(root, "fix-pagination"), committed);
  assert.ok(fs.existsSync(file));
});

test("concurrent identical records produce one entry", async (t) => {
  const root = tempRoot(t);
  await mutateChange(root, "fix-pagination", openBug);
  const results = await Promise.all([1, 2, 3].map(() => mutateChange(root, "fix-pagination", addBugFix)));
  assert.deepStrictEqual(results.map((r) => r.changed).sort(), [false, false, true]);
  const state = await readChange(root, "fix-pagination");
  assert.deepStrictEqual(state.obligations.map((o) => o.id), ["checks-pass", "repro-test"]);
});

test("an invalid result is never written", async (t) => {
  const root = tempRoot(t);
  await mutateChange(root, "fix-pagination", openBug);
  const before = fs.readFileSync(statePath(root, "fix-pagination"), "utf8");
  const corrupting = (state) => ({ state: { ...state, route: "standard" }, changed: true });
  await assert.rejects(mutateChange(root, "fix-pagination", corrupting), /unknown field: route/);
  assert.strictEqual(fs.readFileSync(statePath(root, "fix-pagination"), "utf8"), before);
});

test("a reducer must keep the change id of its directory", async (t) => {
  const root = tempRoot(t);
  await assert.rejects(mutateChange(root, "other-change", openBug), /does not match/);
  assert.ok(!fs.existsSync(statePath(root, "other-change")));
});

test("a change id that is not kebab-case never reaches the filesystem", async (t) => {
  const root = tempRoot(t);
  for (const id of ["../escape", "a/b", "Fix", ""]) {
    await assert.rejects(mutateChange(root, id, openBug), (error) => error.code === "invalid-change-id", id);
    await assert.rejects(readChange(root, id), (error) => error.code === "invalid-change-id", id);
  }
  assert.ok(!fs.existsSync(path.join(root, "escape")));
  assert.ok(!fs.existsSync(path.join(root, "idd")));
});

test("unreadable or invalid state is reported, never silently replaced", async (t) => {
  const root = tempRoot(t);
  const file = statePath(root, "broken");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "schema: idd-state/v1\nchange: broken\n");
  await assert.rejects(readChange(root, "broken"), (error) => error.code === "state-unreadable");
  await assert.rejects(mutateChange(root, "broken", openBug), (error) => error.code === "state-unreadable");
  assert.strictEqual(fs.readFileSync(file, "utf8"), "schema: idd-state/v1\nchange: broken\n");
});

test("listChanges returns open and closed changes in id order, skipping the archive", async (t) => {
  const root = tempRoot(t);
  for (const change of ["b-change", "a-change"]) {
    await mutateChange(root, change, (state) => recordIntent(state, { ...BUG, change }));
  }
  fs.mkdirSync(path.join(root, "idd", "archive", "2026-10-05-old"), { recursive: true });
  fs.mkdirSync(path.join(root, "idd", "empty-dir"), { recursive: true });
  assert.deepStrictEqual((await listChanges(root)).map((s) => s.change), ["a-change", "b-change"]);
  assert.deepStrictEqual(await listChanges(tempRoot(t)), []);
  assert.strictEqual(await readChange(root, "missing"), null);
});

test("the living document is created from the template only when living-doc is active, and never overwritten", async (t) => {
  const root = tempRoot(t);
  const doc = path.join(root, "idd", "fix-pagination", "change.md");
  await mutateChange(root, "fix-pagination", openBug);
  assert.ok(!fs.existsSync(doc));

  const addDoc = (state) => recordSignal(state, { id: "multi-unit-or-decision", reason: "two units", source: "declaration" });
  await mutateChange(root, "fix-pagination", addDoc);
  const template = fs.readFileSync(doc, "utf8");
  let cursor = 0;
  for (const heading of LIVING_DOC_SECTIONS) {
    const at = template.indexOf(`## ${heading}`, cursor);
    assert.ok(at >= cursor, `section ${heading} in order`);
    cursor = at;
  }
  assert.ok(template.indexOf(EVIDENCE_MARKERS.start) > template.indexOf("## Evidence"));
  assert.ok(template.indexOf(EVIDENCE_MARKERS.end) > template.indexOf(EVIDENCE_MARKERS.start));
  assert.ok(template.includes("Fix the last page."));

  fs.writeFileSync(doc, "edited by the model\n");
  await mutateChange(root, "fix-pagination", addDoc);
  assert.strictEqual(fs.readFileSync(doc, "utf8"), "edited by the model\n");
});
