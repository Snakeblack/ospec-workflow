"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { check } = require("./k1-maturity.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("k1-maturity passes when every scoped entry is well-tagged", () => {
  assert.deepEqual(check({ root: ROOT }), []);
});

test("missing maturity tag is an offender", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-maturity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docDir = path.join(root, "docs", "architecture");
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(
    path.join(docDir, "harness-evolution.md"),
    ["## Registro de madurez", "", "### Implementado", "", "- Untagged capability", "", "## Métricas", ""].join(
      "\n"
    )
  );

  const offenders = check({ root });
  assert.ok(offenders.some((o) => /lacks a maturity tag/i.test(o.message)));
});

test("a target capability mislabeled implemented is an offender", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-maturity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docDir = path.join(root, "docs", "architecture");
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(
    path.join(docDir, "harness-evolution.md"),
    [
      "## Registro de madurez",
      "",
      "### Target arquitectónico aceptado",
      "",
      "- {implemented} Runtime-owned lifecycle.",
      "",
      "## Métricas",
      "",
    ].join("\n")
  );

  const offenders = check({ root });
  assert.ok(offenders.some((o) => /target.*implemented|implemented.*target/i.test(o.message)));
});

test("missing document and missing maturity section fail closed", (t) => {
  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "k1-maturity-"));
  t.after(() => fs.rmSync(missingRoot, { recursive: true, force: true }));
  assert.match(check({ root: missingRoot })[0].message, /could not be read/i);

  const sectionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "k1-maturity-"));
  t.after(() => fs.rmSync(sectionRoot, { recursive: true, force: true }));
  const docDir = path.join(sectionRoot, "docs", "architecture");
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(path.join(docDir, "harness-evolution.md"), "# Architecture\n");
  assert.match(check({ root: sectionRoot })[0].message, /missing ## Registro de madurez/i);
});

test("multiple tags and implemented Graph IR authority are both offenders", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-maturity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docDir = path.join(root, "docs", "architecture");
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(
    path.join(docDir, "harness-evolution.md"),
    [
      "## Registro de madurez",
      "",
      "### Implementado y reusable",
      "",
      "- {implemented} {target} Graph IR as independent authority.",
      "",
    ].join("\n")
  );

  const offenders = check({ root });
  assert.ok(offenders.some((item) => /multiple tags/i.test(item.message)));
  assert.ok(offenders.some((item) => /Graph IR authority/i.test(item.message)));
});

test("an unclassified maturity subsection still enforces one valid tag without inventing a category", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-maturity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docDir = path.join(root, "docs", "architecture");
  fs.mkdirSync(docDir, { recursive: true });
  fs.writeFileSync(
    path.join(docDir, "harness-evolution.md"),
    [
      "## Registro de madurez",
      "",
      "### Compatibilidad heredada",
      "",
      "- {target} Consumer migration remains pending.",
      "",
    ].join("\n")
  );

  assert.deepEqual(check({ root }), []);
});
