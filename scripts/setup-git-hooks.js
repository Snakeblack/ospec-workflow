"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { gitHooksDir, GIT_HOOK_LINES } = require("./lib/git-hooks-dir.js");
const { ensureOspecGitignore } = require("./lib/ospec-gitignore.js");

function installHook(hooksDir, hookName, scriptRelPath) {
  const hookPath = path.join(hooksDir, hookName);

  let existingContent = "";
  if (fs.existsSync(hookPath)) {
    existingContent = fs.readFileSync(hookPath, "utf8");
  }

  const scriptBasename = path.basename(scriptRelPath);
  if (existingContent.includes(scriptBasename)) {
    console.log(`Git Hook: El hook ${hookName} ya está instalado.`);
    return;
  }

  let newContent = existingContent;
  if (!newContent.startsWith("#!")) {
    newContent = "#!/bin/sh\n" + newContent;
  }

  // For commit-msg, Git passes the message file path as $1
  newContent = newContent.trimEnd() + `\n${GIT_HOOK_LINES[hookName]}\n`;

  fs.writeFileSync(hookPath, newContent, { mode: 0o755, encoding: "utf8" });
  console.log(`Git Hook: Hook ${hookName} instalado exitosamente.`);

  // Asegurar permisos de ejecución en entornos no Windows
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch (err) {
    // Ignorar fallos de chmod en sistemas sin soporte (ej. Windows)
  }
}

// Installs the ospec pre-commit and commit-msg hooks in the folder git runs
// them from (a linked worktree shares the main repository's). A core.hooksPath
// folder belongs to the user or to another tool, often shared by every
// repository: setup leaves it alone and says which lines to add there.
function setup(repoRoot = path.resolve(__dirname, ".."), { spawn = spawnSync } = {}) {
  const hooks = gitHooksDir(repoRoot, spawn);
  if (!hooks) {
    return {
      installed: false,
      message: `Git Hook: ${repoRoot} no es un repositorio git (o git no está instalado): no se instaló ningún hook.`,
    };
  }

  // .ospec/ is derived session data. Ignore it when the repository does not already.
  ensureOspecGitignore(repoRoot);

  if (hooks.custom) {
    const lines = Object.entries(GIT_HOOK_LINES).map(([name, line]) => `  ${path.join(hooks.dir, name)}: ${line}`);
    return {
      installed: false,
      hooksDir: hooks.dir,
      message: [
        `Git Hook: core.hooksPath apunta a ${hooks.dir}, una carpeta que ospec no escribe. Añade estas líneas para activar los hooks de ospec:`,
        ...lines,
      ].join("\n"),
    };
  }

  fs.mkdirSync(hooks.dir, { recursive: true });
  // 1. Pre-commit hook: workspace validation + strict TDD
  installHook(hooks.dir, "pre-commit", "scripts/hooks/pre-commit-hook.js");
  // 2. Commit-msg hook: blocks AI/model attribution in commit messages
  installHook(hooks.dir, "commit-msg", "scripts/hooks/commit-msg-hook.js");
  return { installed: true, hooksDir: hooks.dir };
}

// npm runs this script as `prepare` on every `npm install`: there a hook that
// cannot be installed only warns, so the install itself never fails.
function main({ root, env = process.env } = {}) {
  const result = setup(root);
  if (result.installed) return 0;
  console.error(result.message);
  return env.npm_lifecycle_event === "prepare" ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  setup,
  main,
  installHook,
};
