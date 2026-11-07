"use strict";

const path = require("node:path");

// The folder whose hooks git runs for the work tree at `root`, as git itself
// resolves it: in a linked worktree, the main repository's shared .git/hooks;
// with core.hooksPath, that folder (`custom`). Null outside a git repository
// or without git. `spawn` is spawnSync's signature.
function gitHooksDir(root, spawn) {
  const result = spawn("git", ["rev-parse", "--git-common-dir", "--git-path", "hooks"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
    shell: false,
  }) || {};
  if (result.error || result.status !== 0) return null;
  const [common, hooks] = String(result.stdout || "").split(/\r?\n/);
  if (!common || !hooks) return null;
  const dir = path.resolve(root, hooks);
  return { dir, custom: dir !== path.resolve(root, common, "hooks") };
}

// The line each ospec git hook adds to its hook file.
const GIT_HOOK_LINES = {
  "pre-commit": 'node "$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit-hook.js"',
  "commit-msg": 'node "$(git rev-parse --show-toplevel)/scripts/hooks/commit-msg-hook.js" "$1"',
};

module.exports = { gitHooksDir, GIT_HOOK_LINES };
