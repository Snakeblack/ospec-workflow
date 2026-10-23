"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { armFor, hasClosedIddChange, hasIddDelivery, hasOddDelivery, iddOpenFacts } = require("./arms.js");

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

test("the idd arm receives the brief on every host, and sdd is not available on agy", () => {
  const brief = { brief: "Quiero prioridades." };
  assert.equal(armFor("idd").changePrompt(brief), "Quiero prioridades.");
  assert.equal(armFor("idd", { host: "agy" }).changePrompt(brief), "Quiero prioridades.");
  assert.equal(armFor("gentle-ai", { host: "agy" }), armFor("gentle-ai"));
  assert.throws(() => armFor("sdd", { host: "agy" }), /not available on agy/);
});

test("an IDD delivery needs the new archive committed and a clean tree", () => {
  const { root, base } = workspace();
  write(root, "idd/archive/2026-10-13-prioridades/change.md", "# prioridades\n");
  assert.equal(hasIddDelivery(root, base), false, "an uncommitted archive is not a delivery");
  commit(root, "feat: prioridades");
  assert.equal(hasIddDelivery(root, base), true);
  write(root, "index.js", "module.exports = 2;\n");
  assert.equal(hasIddDelivery(root, base), false, "an uncommitted edit is still pending work");
});

test("only an IDD change archived after setup closes the requested change", () => {
  const { root } = workspace();
  write(root, "idd/archive/2026-10-13-setup-config/change.md", "# setup\n");
  commit(root, "setup with an archived change");
  const base = git(root, ["rev-parse", "HEAD"]);
  assert.equal(hasClosedIddChange(root, base), false, "the change closed during setup is not the requested one");
  write(root, "idd/archive/2026-10-13-todo-spa/change.md", "# todo\n");
  assert.equal(hasClosedIddChange(root, base), true);
  const fresh = workspace();
  assert.equal(hasClosedIddChange(fresh.root, fresh.base), false);
  write(fresh.root, "idd/archive/2026-10-13-x/change.md", "# x\n");
  assert.equal(hasClosedIddChange(fresh.root, fresh.base), true);
});

// E4.6 (OSP-027): the record keeps how the delivered IDD change closed its
// open facts, read from the state.yaml `ospec close` archived.
test("iddOpenFacts reads how the change archived after setup closed its open facts", () => {
  const { root, base } = workspace();
  assert.equal(iddOpenFacts(root, base), null, "no archive");
  write(root, "idd/archive/2026-10-01-old/state.yaml", JSON.stringify({ intent: { kind: "bug" }, facts: { open: ["¿a?"] } }));
  commit(root, "setup archive");
  const after = git(root, ["rev-parse", "HEAD"]);
  assert.equal(iddOpenFacts(root, after), null, "an archive the setup commit holds is not the change");
  write(root, "idd/archive/2026-10-02-bug/state.yaml", JSON.stringify({ intent: { kind: "bug" }, facts: { open: ["¿Qué límite, «200»?", "¿Qué formato, «ISO»?"] } }));
  assert.deepEqual(iddOpenFacts(root, after), { kind: "bug", categories: null, questions: 2, user_gates: [] });
  write(root, "idd/archive/2026-10-03-docs/state.yaml", JSON.stringify({ intent: { kind: "docs" }, facts: { basis: "the request fixes it" } }));
  assert.deepEqual(iddOpenFacts(root, after), { kind: "docs", categories: null, questions: 0, user_gates: [] }, "the latest new archive");
  write(root, "idd/archive/2026-10-04-broken/state.yaml", "{");
  assert.equal(iddOpenFacts(root, after), null, "an unreadable state says nothing");
  write(root, "idd/archive/2026-10-05-odd/state.yaml", JSON.stringify({ intent: { kind: "feature" }, facts: { coverage: [{ category: "inputs", cite: { kind: "url" } }] } }));
  assert.equal(iddOpenFacts(root, after), null, "an unknown cite kind is not guessed");
  assert.equal(armFor("idd").openFacts, iddOpenFacts);
  assert.equal(armFor("gentle-ai").openFacts, undefined);
});

// #399: the record keeps which gates the change resolved as answered by the
// user, so the driver can mark the ones no persona turn answered.
test("iddOpenFacts lists the gates resolved with source user", () => {
  const { root, base } = workspace();
  const gates = [
    { id: "open-facts", status: "resolved", answer: "User Skipped", source: "user" },
    { id: "irreversible-operation", status: "open" },
    { id: "review-limit", status: "resolved", answer: "sí", source: "user-unverified" },
    { id: "adr-amend-or-contradict", status: "resolved", answer: "adelante", source: "user" },
  ];
  write(root, "idd/archive/2026-10-02-bug/state.yaml", JSON.stringify({ intent: { kind: "bug" }, facts: { open: ["¿a?"] }, gates }));
  assert.deepEqual(iddOpenFacts(root, base).user_gates, ["open-facts", "adr-amend-or-contradict"]);
});

// #390: the record keeps what each cite said, so the gate can be judged on the
// lines a run cited. The line comes from the setup commit, the tree `record
// intent` resolved it against, even when the change edits it later.
test("iddOpenFacts keeps the cited line as the setup commit held it and the quoted fragment", () => {
  const { root } = workspace();
  write(root, "README.md", `# x\n  Los códigos no distinguen mayúsculas.  \n${"a".repeat(250)}\n`);
  commit(root, "setup readme");
  const base = git(root, ["rev-parse", "HEAD"]);
  write(root, "README.md", "# x\nOtra cosa.\n");
  write(root, "NEW.md", "nuevo\n");
  const quote = `el formato por defecto no cambia ${"b".repeat(200)}`;
  const coverage = [
    { category: "inputs", question: "¿Qué límite, «200»?" },
    { category: "uniqueness", cite: { kind: "path", path: "README.md", line: 2 } },
    { category: "persistence", cite: { kind: "path", path: "README.md", line: 3 } },
    { category: "copy", cite: { kind: "request", text: quote } },
    { category: "url-state", cite: { kind: "path", path: "NEW.md", line: 1 } },
    { category: "errors", cite: { kind: "path", path: "GONE.md", line: 1 } },
  ];
  write(root, "idd/archive/2026-10-22-feature/state.yaml", JSON.stringify({ intent: { kind: "feature" }, facts: { coverage } }));
  assert.deepEqual(iddOpenFacts(root, base).cites, [
    { category: "uniqueness", path: "README.md", line: 2, text: "Los códigos no distinguen mayúsculas." },
    { category: "persistence", path: "README.md", line: 3, text: "a".repeat(200) },
    { category: "copy", quote: quote.slice(0, 200) },
    { category: "url-state", path: "NEW.md", line: 1, text: "nuevo" },
    { category: "errors", path: "GONE.md", line: 1, text: null },
  ]);
});
