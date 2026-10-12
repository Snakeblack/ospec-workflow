"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { armFor, hasOddDelivery } = require("./arms.js");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

// A workspace as the driver leaves it before the change: base and setup commits.
function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bench-arm-"));
  fs.writeFileSync(path.join(root, "index.js"), "module.exports = 1;\n");
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.name", "bench"]);
  git(root, ["config", "user.email", "bench@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", "setup"]);
  return { root, base: git(root, ["rev-parse", "HEAD"]) };
}

function write(root, file, content) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message]);
}

const tasks = (...lines) => `# feature\n\n## Tasks\n\n${lines.join("\n")}\n\n## Log\n`;

test("the gentle-ai arm needs no setup and requests the brief as is", () => {
  const arm = armFor("gentle-ai");
  assert.deepEqual(arm.setupPrompts, []);
  assert.equal(arm.isSetupDone("/anywhere"), true);
  assert.equal(arm.changePrompt({ brief: "Quiero prioridades." }), "Quiero prioridades.");
});

test("small work without a feature document is finished once committed with a clean tree", () => {
  const { root, base } = workspace();
  assert.equal(hasOddDelivery(root, base), false, "nothing done yet");
  write(root, "index.js", "module.exports = 2;\n");
  assert.equal(hasOddDelivery(root, base), false, "an uncommitted edit is not a delivery");
  commit(root, "fix: dos");
  assert.equal(hasOddDelivery(root, base), true);
  write(root, "test/new.test.js", "");
  assert.equal(hasOddDelivery(root, base), false, "an untracked file outside odd/ is still pending work");
});

test("a commit on a feature branch counts", () => {
  const { root, base } = workspace();
  git(root, ["checkout", "-q", "-b", "feat/prioridades"]);
  write(root, "index.js", "module.exports = 2;\n");
  commit(root, "feat: prioridades");
  assert.equal(hasOddDelivery(root, base), true);
});

test("a feature document may stay uncommitted but every task must be checked", () => {
  const { root, base } = workspace();
  write(root, "index.js", "module.exports = 2;\n");
  commit(root, "feat: T1");
  write(root, "odd/tasks/prioridades.md", tasks("- [x] T1 S1 — commit: abc123", "- [ ] T2 S2"));
  assert.equal(hasOddDelivery(root, base), false, "T2 is still open");
  write(root, "odd/tasks/prioridades.md", tasks("- [x] T1 S1 — commit: abc123", "- [x] T2 S2 — commit: def456"));
  assert.equal(hasOddDelivery(root, base), true, "the document records commits after them, so it stays uncommitted");
  write(root, "odd/tasks/otra.md", tasks("* [ ] T1"));
  assert.equal(hasOddDelivery(root, base), false, "an open task in any feature document");
});

test("gentle-ai's skill registry in .atl/ is runtime state, not pending work", () => {
  const { root, base } = workspace();
  write(root, ".atl/skill-registry.md", "# Skill Registry");
  write(root, "index.js", "module.exports = 2;\n");
  commit(root, "fix: dos");
  write(root, ".atl/skill-registry.md", "# Skill Registry, refreshed");
  write(root, ".atl/.skill-registry.cache.json", "{}");
  assert.equal(hasOddDelivery(root, base), true);
  write(root, ".atlas/notes.md", "");
  assert.equal(hasOddDelivery(root, base), false, "only the .atl/ directory itself");
});

test("a renamed file outside odd/ is pending work", () => {
  const { root, base } = workspace();
  write(root, "index.js", "module.exports = 2;\n");
  commit(root, "feat: dos");
  git(root, ["mv", "index.js", "main.js"]);
  assert.equal(hasOddDelivery(root, base), false);
});
