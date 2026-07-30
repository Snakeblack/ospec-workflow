"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const RECEIPT_PATH = "openspec/changes/example/evidence/receipts/example.stdout";

function runGit(cwd, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: options.encoding === null ? null : "utf8",
    shell: false,
  });
  if (!options.allowFailure && (result.error || result.status !== 0)) {
    throw result.error || new Error(`git ${args.join(" ")} exited ${result.status}: ${result.stderr}`);
  }
  return result;
}

test("receipt paths disable text conversion and only their whitespace diagnostics", () => {
  const attributes = runGit(ROOT, ["check-attr", "text", "whitespace", "--", RECEIPT_PATH]).stdout;

  assert.match(attributes, /: text: unset\r?\n/);
  assert.match(attributes, /: whitespace: unset\r?\n/);
});

test("receipt bytes survive a Windows-style checkout while Markdown whitespace stays visible", t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-receipt-attrs-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));

  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "core.autocrlf", "true"]);
  runGit(repo, ["config", "user.name", "Receipt Attribute Test"]);
  runGit(repo, ["config", "user.email", "receipt-attribute-test@example.invalid"]);
  runGit(repo, ["config", "commit.gpgsign", "false"]);

  fs.copyFileSync(path.join(ROOT, ".gitattributes"), path.join(repo, ".gitattributes"));

  const receiptRoot = path.join(repo, "openspec", "changes", "example", "evidence", "receipts");
  const reportPath = path.join(repo, "openspec", "changes", "example", "verify-report.md");
  fs.mkdirSync(receiptRoot, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const expected = new Map([
    [path.join(receiptRoot, "example.json"), Buffer.from('{"ok":true}  \n')],
    [path.join(receiptRoot, "example.stdout"), Buffer.from("line one  \nline two\n")],
    [path.join(receiptRoot, "example.stderr"), Buffer.from("diagnostic  \n")],
  ]);
  for (const [file, bytes] of expected) fs.writeFileSync(file, bytes);
  fs.writeFileSync(reportPath, "Markdown must still fail here  \n");

  runGit(repo, ["add", "."]);
  const whitespace = runGit(repo, ["diff", "--cached", "--check"], { allowFailure: true });
  assert.notEqual(whitespace.status, 0);
  assert.match(whitespace.stdout, /verify-report\.md:1: trailing whitespace\./);
  assert.doesNotMatch(whitespace.stdout, /evidence\/receipts/);

  runGit(repo, ["commit", "-q", "-m", "test fixture"]);
  fs.rmSync(receiptRoot, { recursive: true });
  runGit(repo, ["restore", "--source=HEAD", "--worktree", "--", "openspec/changes/example/evidence/receipts"]);

  for (const [file, bytes] of expected) {
    assert.deepEqual(fs.readFileSync(file), bytes, `${path.basename(file)} changed bytes during checkout`);
  }
});
