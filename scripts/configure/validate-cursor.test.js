"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { validate } = require("./validate-cursor.js");

function tmpRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-cursor-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

function cleanTree(root) {
  write(
    root,
    "agents/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: Apply phase\nmodel: composer-2.5[fast=false]\n---\n\nUse `Write` and `Grep`.\n",
  );
  write(
    root,
    "agents/review-change.md",
    "---\nname: review-change\ndescription: Review\nmodel: composer-2.5[fast=false]\nreadonly: true\n---\n\nRead-only review.\n",
  );
  write(
    root,
    "commands/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: Run apply\nagent: sdd-orchestrator\n---\n\nRun apply for ${input:changeName}.\n",
  );
  write(
    root,
    "rules/sdd-common.mdc",
    '---\ndescription: "Shared protocol"\nglobs: ["*"]\nalwaysApply: true\n---\n\nbody\n',
  );
  write(
    root,
    "rules/agents-protocol.mdc",
    '---\ndescription: "Post-archive release flow and bounded review lifecycle rules."\nglobs: ["*"]\nalwaysApply: true\n---\n\nprotocol\n',
  );
  write(root, "skills/sdd-apply/SKILL.md", "---\nname: sdd-apply\n---\n\nskill\n");
  write(root, "scripts/hooks/ospec-hooks-launch.js", "module.exports = {};\n");
  write(
    root,
    "hooks.json",
    JSON.stringify(
      {
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            { command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js session-start" },
          ],
          beforeShellExecution: [
            { command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js pre-tool-use" },
          ],
          stop: [{ command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js stop" }],
        },
      },
      null,
      2,
    ),
  );
}

test("validate-cursor accepts a clean tree with zero errors", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  const result = validate(root);
  assert.deepEqual(result.errors, []);
});

test("validate-cursor reports missing required structure paths", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  fs.rmSync(path.join(root, "agents"), { recursive: true, force: true });
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("missing required path: agents")));
});

test("validate-cursor requires agent frontmatter name/description/model and review readonly", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(root, "agents/sdd-apply.md", "---\nname: sdd-apply\n---\n\nbody\n");
  write(root, "agents/review-change.md", "---\nname: review-change\ndescription: d\nmodel: x\n---\n\nbody\n");
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("agents/sdd-apply.md") && e.includes("description")));
  assert.ok(result.errors.some((e) => e.includes("agents/sdd-apply.md") && e.includes("model")));
  assert.ok(result.errors.some((e) => e.includes("agents/review-change.md") && e.includes("readonly")));
});

test("validate-cursor requires mdc frontmatter and agents-protocol.mdc", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(root, "rules/sdd-common.mdc", "---\ndescription: only\n---\n\nbody\n");
  fs.rmSync(path.join(root, "rules/agents-protocol.mdc"), { force: true });
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("rules/sdd-common.mdc") && (e.includes("globs") || e.includes("alwaysApply"))));
  assert.ok(result.errors.some((e) => e.includes("agents-protocol.mdc")));
});

test("validate-cursor rejects bad hooks shape, SubagentStop, and missing placeholder", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "hooks.json",
    JSON.stringify({
      version: 2,
      hooks: {
        SubagentStop: [{ command: "node x.js" }],
        beforeSubmitPrompt: [{ command: "node /tmp/x.js session-start" }],
      },
    }),
  );
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("version")));
  assert.ok(result.errors.some((e) => /SubagentStop/i.test(e)));
  assert.ok(result.errors.some((e) => e.includes("__OSPEC_CURSOR_ROOT__")));
});

test("validate-cursor fails on agent vscode/AskUserQuestion/abstract residue", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "agents/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: d\nmodel: x\n---\n\nAsk via vscode/askQuestions or AskUserQuestion. Use `edit`.\n",
  );
  const result = validate(root);
  assert.ok(result.errors.some((e) => /vscode\//i.test(e)));
  assert.ok(result.errors.some((e) => e.includes("AskUserQuestion")));
  assert.ok(result.errors.some((e) => e.includes("`edit`") || e.includes("abstract tool")));
});

test("validate-cursor does NOT fail solely because commands retain ${input:} or agent:", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "commands/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: d\nagent: sdd-orchestrator\n---\n\nRun for ${input:changeName} and ${input}.\n",
  );
  const result = validate(root);
  assert.deepEqual(result.errors, [], `unexpected errors: ${result.errors.join("; ")}`);
});

test("validate-cursor triangulation: stray vscode/ in agent body fails; commands with input do not", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "agents/sdd-propose.md",
    "---\nname: sdd-propose\ndescription: d\nmodel: x\n---\n\nCall vscode/askQuestions.\n",
  );
  write(
    root,
    "commands/sdd-propose.md",
    "---\nname: sdd-propose\nagent: sdd-orchestrator\n---\n\n${input:name}\n",
  );
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("agents/sdd-propose.md")));
  assert.ok(!result.errors.some((e) => e.includes("commands/sdd-propose.md")));
});

test("validate-cursor triangulation: unmapped abstract tool token in agent fails", (t) => {
  const root = tmpRoot(t);
  cleanTree(root);
  write(
    root,
    "agents/sdd-apply.md",
    "---\nname: sdd-apply\ndescription: d\nmodel: x\n---\n\nPrefer `search` over Glob.\n",
  );
  const result = validate(root);
  assert.ok(result.errors.some((e) => e.includes("agents/sdd-apply.md") && (e.includes("`search`") || e.includes("abstract"))));
});
