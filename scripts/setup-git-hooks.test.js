"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { setup, main } = require("./setup-git-hooks.js");

// The repositories below must not read the machine's git configuration: a
// global core.hooksPath would change where git looks for hooks.
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-git-config-"));
fs.writeFileSync(path.join(isolated, "gitconfig"), "");
process.env.GIT_CONFIG_GLOBAL = path.join(isolated, "gitconfig");
process.env.GIT_CONFIG_NOSYSTEM = "1";
test.after(() => fs.rmSync(isolated, { recursive: true, force: true }));

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "user.name=ospec", "-c", "user.email=ospec@example.dev", ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function repository(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ospec-git-hooks-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  return root;
}

function silenced(t) {
  for (const method of ["log", "warn", "error"]) t.mock.method(console, method, () => {});
}

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");

test("setup installs pre-commit and commit-msg once in the repository's hooks", (t) => {
  silenced(t);
  const root = repository(t);
  assert.equal(setup(root).installed, true);
  assert.equal(setup(root).installed, true);
  const preCommit = read(path.join(root, ".git", "hooks", "pre-commit"));
  const commitMsg = read(path.join(root, ".git", "hooks", "commit-msg"));
  assert.equal(preCommit.match(/pre-commit-hook\.js/g)?.length, 1);
  assert.equal(commitMsg.match(/commit-msg-hook\.js" "\$1"/g)?.length, 1);
});

// npm runs setup on every install (prepare): hooks the previous setup wrote,
// and another tool's hook, stay as they are.
test("setup keeps an installation from the previous setup and another tool's hook", (t) => {
  silenced(t);
  const root = repository(t);
  const hooks = path.join(root, ".git", "hooks");
  const previous = '#!/bin/sh\nnode "$(git rev-parse --show-toplevel)/scripts/hooks/commit-msg-hook.js" "$1"\n';
  const foreign = "#!/bin/sh\nnpx lint-staged\n";
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, "commit-msg"), previous);
  fs.writeFileSync(path.join(hooks, "pre-commit"), foreign);

  assert.equal(setup(root).installed, true);
  assert.equal(read(path.join(hooks, "commit-msg")), previous);
  assert.equal(
    read(path.join(hooks, "pre-commit")),
    '#!/bin/sh\nnpx lint-staged\nnode "$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit-hook.js"\n',
  );
});

// attribution-guard-gaps / PR3b finding 4: in a linked worktree .git is a file, so <root>/.git/hooks
// failed with ENOTDIR. A worktree shares the main repository's hooks.
test("setup from a linked worktree installs in the hooks the main repository shares", (t) => {
  silenced(t);
  const root = repository(t);
  git(root, "commit", "-q", "--allow-empty", "-m", "init");
  const worktree = path.join(root, "..", `${path.basename(root)}-wt`);
  t.after(() => fs.rmSync(worktree, { recursive: true, force: true }));
  git(root, "worktree", "add", "-q", worktree);

  const result = setup(worktree);
  assert.equal(result.installed, true);
  assert.equal(result.hooksDir, path.join(root, ".git", "hooks"));
  assert.match(read(path.join(root, ".git", "hooks", "commit-msg")), /commit-msg-hook\.js/);
});

test("setup does not write a core.hooksPath folder and says which lines to add", (t) => {
  silenced(t);
  const root = repository(t);
  git(root, "config", "core.hooksPath", ".githooks");

  const result = setup(root);
  assert.equal(result.installed, false);
  assert.equal(fs.existsSync(path.join(root, ".githooks")), false);
  assert.equal(fs.existsSync(path.join(root, ".git", "hooks", "commit-msg")), false);
  assert.match(result.message, /core\.hooksPath/);
  assert.ok(result.message.includes(path.join(root, ".githooks")), result.message);
  assert.match(result.message, /pre-commit-hook\.js/);
  assert.match(result.message, /commit-msg-hook\.js" "\$1"/);
  assert.match(read(path.join(root, ".gitignore")), /^\.ospec\/$/m);
});

test("outside a git repository setup installs nothing", (t) => {
  silenced(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-no-git-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = setup(root);
  assert.equal(result.installed, false);
  assert.match(result.message, /repositorio git/);
});

test("a failed install fails the direct run and only warns under npm's prepare", (t) => {
  silenced(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-no-git-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(main({ root, env: {} }), 1);
  assert.equal(main({ root, env: { npm_lifecycle_event: "prepare" } }), 0);
  assert.equal(main({ root: repository(t), env: {} }), 0);
});

test("npm install installs the git hooks through the prepare script", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.equal(manifest.scripts.prepare, "node scripts/setup-git-hooks.js");
});
