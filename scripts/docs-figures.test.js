"use strict";

// Public figures drift (E1.78): every count the public documentation states
// for the IDD gates, the targets and the reviewers matches the source it comes
// from, and every skill declares the license of the repository. The README said
// nine gates while the quickstart still said six: this test fails on the next
// one that falls behind.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

// --- sources ---------------------------------------------------------------

function gateCount() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "internal", "iddsession", "catalog.json"), "utf8")).gates.length;
}

// A target is a profile that declares its id; the directory also holds helpers.
function targetCount() {
  const dir = path.join(ROOT, "scripts", "lib", "target-profiles");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"))
    .filter((name) => typeof require(path.join(dir, name)).id === "string").length;
}

function reviewerCount() {
  return fs.readdirSync(path.join(ROOT, "agents")).filter((name) => /^review-.+\.agent\.md$/.test(name)).length;
}

// --- documents -------------------------------------------------------------

// The public documentation in English and Spanish. handbook/historia/ describes
// past designs, and docs/roadmaps and docs/analysis quote old figures on purpose.
function publicDocuments() {
  const files = ["README.md", "README.es.md"].map((name) => path.join(ROOT, name));
  const walk = (dir, skip) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(abs, skip);
      } else if (entry.name.endsWith(".md")) files.push(abs);
    }
  };
  walk(path.join(ROOT, "docs", "en"), new Set());
  walk(path.join(ROOT, "handbook"), new Set(["historia"]));
  return files;
}

const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
});

const FIGURES = Object.freeze([
  { name: "gates", source: "internal/iddsession/catalog.json", count: gateCount, nouns: ["gates"] },
  { name: "targets", source: "scripts/lib/target-profiles", count: targetCount, nouns: ["targets", "tools", "herramientas", "plataformas"] },
  { name: "reviewers", source: "agents/review-*.agent.md", count: reviewerCount, nouns: ["reviewers", "revisores"] },
]);

// A number, in digits or in words, right before the noun, which may be wrapped
// in Markdown emphasis or code: "nine gates", "seis *gates*", "7 herramientas".
function statedCounts(text, nouns) {
  const number = `\\d+|${Object.keys(NUMBER_WORDS).join("|")}`;
  const pattern = new RegExp(`\\b(${number})\\s+[*_\`]*(${nouns.join("|")})\\b`, "giu");
  const found = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(pattern)) {
      const token = match[1].toLowerCase();
      found.push({ line: index + 1, text: match[0], value: /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token] });
    }
  });
  return found;
}

function statements(figure) {
  return publicDocuments().flatMap((file) =>
    statedCounts(fs.readFileSync(file, "utf8"), figure.nouns).map((entry) => ({
      ...entry,
      file: path.relative(ROOT, file).split(path.sep).join("/"),
    })),
  );
}

for (const figure of FIGURES) {
  test(`every public count of ${figure.name} matches ${figure.source}`, () => {
    const expected = figure.count();
    const wrong = statements(figure)
      .filter((entry) => entry.value !== expected)
      .map((entry) => `${entry.file}:${entry.line} says "${entry.text}"`);
    assert.deepEqual(wrong, [], `${figure.source} gives ${expected} ${figure.name}`);
  });
}

test("the README and both quickstarts state the gate count", () => {
  const gates = FIGURES.find((figure) => figure.name === "gates");
  const files = new Set(statements(gates).map((entry) => entry.file));
  for (const file of ["README.md", "handbook/quickstart.md", "docs/en/quickstart.md"]) {
    assert.ok(files.has(file), `${file} no longer states how many gates there are`);
  }
});

test("the figure scan reads digits and words in English and Spanish", () => {
  const values = statedCounts("nine gates, seis *gates*, 7 herramientas and `9` gates", ["gates", "herramientas"]).map((entry) => entry.value);
  assert.deepEqual(values, [9, 6, 7]);
});

// --- skill licenses --------------------------------------------------------

const SKILL_LICENSE = "MIT AND Commons-Clause";
const OWN_AUTHOR = "manuel-retamozo-garcia";

function skillFrontmatters() {
  const dir = path.join(ROOT, "skills");
  return fs
    .readdirSync(dir)
    .filter((name) => fs.existsSync(path.join(dir, name, "SKILL.md")))
    .map((name) => {
      const text = fs.readFileSync(path.join(dir, name, "SKILL.md"), "utf8");
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      return { name, front: block ? block[1] : "" };
    });
}

function field(front, pattern) {
  const match = pattern.exec(front);
  return match ? match[1].trim().replace(/^"(.*)"$/, "$1") : null;
}

test("the repository LICENSE is MIT with the Commons Clause, the license every skill declares", () => {
  const license = fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8");
  assert.match(license, /^MIT License/);
  assert.match(license, /Commons Clause/);
});

test("every skill declares the repository license", () => {
  const wrong = skillFrontmatters()
    .map(({ name, front }) => ({ name, license: field(front, /^license:(.*)$/m) }))
    .filter((skill) => skill.license !== SKILL_LICENSE)
    .map((skill) => `skills/${skill.name}: ${skill.license === null ? "no license" : skill.license}`);
  assert.deepEqual(wrong, []);
});

// A skill that keeps third-party text names its authors or its origin, and
// NOTICE keeps that work's copyright notice: both lists move together.
test("every skill that names a third-party author or origin is listed in NOTICE", () => {
  const notice = fs.readFileSync(path.join(ROOT, "NOTICE"), "utf8");
  const missing = skillFrontmatters()
    .filter(({ front }) => {
      const authors = (field(front, /^ {2}author:(.*)$/m) || "").split(",").map((name) => name.trim()).filter(Boolean);
      return authors.some((name) => name !== OWN_AUTHOR) || field(front, /^ {2}origin:(.*)$/m) !== null;
    })
    .map(({ name }) => name)
    .filter((name) => !new RegExp(`(^|[\\s,(])${name}([\\s,.(]|$)`, "m").test(notice));
  assert.deepEqual(missing, []);
});
