"use strict";

// E1.4 (a): the CLI runs check and test commands itself, so their outcome is
// observed, never asserted (openspec/specs/idd/spec.md, REQ-idd-007, REQ-idd-014).

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { OUTPUT_TAIL_LINES, runCommand } = require("./idd-exec.js");

const node = JSON.stringify(process.execPath);

test("a command reports its exit code and the digest of its output", () => {
  const ok = runCommand(`${node} -e "process.stdout.write('hello')"`, { cwd: process.cwd() });
  assert.strictEqual(ok.exit_code, 0);
  assert.strictEqual(ok.output_sha256, `sha256:${crypto.createHash("sha256").update("hello").digest("hex")}`);
  assert.deepStrictEqual(ok.output_tail, ["hello"]);

  const failing = runCommand(`${node} -e "console.error('boom'); process.exit(3)"`, { cwd: process.cwd() });
  assert.strictEqual(failing.exit_code, 3);
  assert.deepStrictEqual(failing.output_tail, ["boom"]);
});

test("the command runs in the project root and only the tail of a long output is kept", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idd-exec-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "marker.txt"), "here");
  const script = "const fs=require('fs');for(let i=1;i<=50;i++)console.log(i);console.log(fs.readFileSync('marker.txt','utf8'))";
  const result = runCommand(`${node} -e "${script}"`, { cwd: root });
  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.output_tail.length, OUTPUT_TAIL_LINES);
  assert.strictEqual(result.output_tail.at(-1), "here");
});

test("a command that cannot start fails instead of passing", () => {
  const result = runCommand("ospec-no-such-command-xyz", { cwd: process.cwd() });
  assert.notStrictEqual(result.exit_code, 0);
});
