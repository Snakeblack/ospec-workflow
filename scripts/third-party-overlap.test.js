"use strict";

// The third-party text measure reads every version in the source's history,
// not only its current tree: a copy taken before the source rewrote or
// deleted a file still counts.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const { longLines, measure, main, findInBlobs } = require("./third-party-overlap.js");

const REWRITTEN = "This sentence lived in the first version and was later removed.";
const CURRENT = "This sentence is still in the current tree of the source work.";
const BRANCH_ONLY = "This sentence only exists on a branch that was never merged back.";
const CODE_ONLY = "this sentence sits inside a Go file and not in any markdown file";
const OWN = "This sentence was written for the target and never existed upstream.";

function git(cwd, ...args) {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "ignore",
  });
}

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-overlap-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, "source");
  fs.mkdirSync(source);
  git(source, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(source, "guide.md"), `# Guide\n\n${REWRITTEN}\n`);
  fs.writeFileSync(path.join(source, "main.go"), `// ${CODE_ONLY}\n`);
  git(source, "add", ".");
  git(source, "commit", "-q", "-m", "first");
  fs.writeFileSync(path.join(source, "guide.md"), `# Guide\n\n${CURRENT}\n`);
  git(source, "commit", "-q", "-am", "rewrite");
  git(source, "switch", "-q", "-c", "side");
  fs.writeFileSync(path.join(source, "notes.md"), `  ${BRANCH_ONLY}  \r\n`);
  git(source, "add", ".");
  git(source, "commit", "-q", "-m", "side");
  git(source, "switch", "-q", "main");

  const target = path.join(dir, "target");
  fs.mkdirSync(path.join(target, "nested"), { recursive: true });
  fs.writeFileSync(path.join(target, "skill.md"), `# Skill\n\n${REWRITTEN}\n${CURRENT}\n${OWN}\n\tshort line\n`);
  fs.writeFileSync(path.join(target, "nested", "more.md"), `- ${BRANCH_ONLY}\n${BRANCH_ONLY}\n// ${CODE_ONLY}\n`);
  fs.writeFileSync(path.join(target, "nested", "ignored.js"), `${CURRENT}\n`);
  return { source, target };
}

test("long lines are trimmed and need the minimum length", () => {
  assert.deepEqual(longLines("  abc  \r\nabcdef\n\n   xy\n", 3), ["abc", "abcdef"]);
});

test("a line counts when any version on any ref holds it, even one the source removed", async (t) => {
  const { source, target } = setup(t);
  const report = await measure({ source, entries: [path.join(target, "skill.md")] });
  assert.equal(report.files.length, 1);
  assert.deepEqual(report.files[0].lines, [REWRITTEN, CURRENT]);
  assert.equal(report.files[0].long, 3);
  assert.deepEqual(report.total, { long: 3, matched: 2 });
});

test("a directory contributes only files with the extensions, and lines match after trimming", async (t) => {
  const { source, target } = setup(t);
  const report = await measure({ source, entries: [target] });
  assert.deepEqual(
    report.files.map((entry) => [path.relative(target, entry.file), entry.matched, entry.long]),
    [
      [path.join("nested", "more.md"), 1, 3],
      ["skill.md", 2, 3],
    ],
  );
  assert.deepEqual(report.files[0].lines, [BRANCH_ONLY]);
});

test("the extensions also choose which versions of the source are read", async (t) => {
  const { source, target } = setup(t);
  const entries = [path.join(target, "nested", "more.md")];
  const markdown = await measure({ source, entries });
  assert.equal(markdown.files[0].lines.includes(`// ${CODE_ONLY}`), false);
  const withGo = await measure({ source, entries, extensions: ["md", "go"] });
  assert.deepEqual(withGo.files[0].lines, [BRANCH_ONLY, `// ${CODE_ONLY}`]);
});

function sink() {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

test("the command prints a line per file and the total, or JSON", async (t) => {
  const { source, target } = setup(t);
  const file = path.join(target, "skill.md");
  const out = sink();
  assert.equal(await main(["--source", source, "--show", file], out, sink()), 0);
  assert.equal(out.text(), `${file}: 2/3 (66.7 %)\n  = ${REWRITTEN}\n  = ${CURRENT}\ntotal: 2/3 (66.7 %)\n`);
  const json = sink();
  assert.equal(await main(["--source", source, "--json", "--min-length", "70", file], json, sink()), 0);
  assert.deepEqual(JSON.parse(json.text()).total, { long: 0, matched: 0 });
});

test("bad usage exits 2 and an unreadable source exits 1", async (t) => {
  const { target } = setup(t);
  const err = sink();
  assert.equal(await main([target], sink(), err), 2);
  assert.match(err.text(), /--source <git clone> is required/);
  assert.equal(await main(["--source", target, "--min-length", "0", target], sink(), sink()), 2);
  const failure = sink();
  assert.equal(await main(["--source", path.join(target, "missing"), target], sink(), failure), 1);
  assert.match(failure.text(), /git rev-list failed/);
});

// More ids than a pipe buffers: git dies before reading them, and the broken
// pipe must surface as a rejection, not as an unhandled stream error.
test("a git that exits before reading its input rejects instead of crashing", async (t) => {
  const { target } = setup(t);
  const ids = Array.from({ length: 20000 }, (_, index) => index.toString(16).padStart(40, "0"));
  await assert.rejects(findInBlobs(path.join(target, "missing"), ids, new Set(), 30), /git cat-file failed/);
});
