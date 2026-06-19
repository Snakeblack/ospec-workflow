"use strict";

const fs = require("node:fs");
const path = require("node:path");

function installHook(hooksDir, hookName, scriptRelPath) {
  const hookPath = path.join(hooksDir, hookName);
  const hookCommand = `\nnode "$(git rev-parse --show-toplevel)/${scriptRelPath}"`;

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
  if (hookName === "commit-msg") {
    newContent = newContent.trimEnd() + `\nnode "$(git rev-parse --show-toplevel)/${scriptRelPath}" "$1"\n`;
  } else {
    newContent = newContent.trimEnd() + hookCommand + "\n";
  }

  fs.writeFileSync(hookPath, newContent, { mode: 0o755, encoding: "utf8" });
  console.log(`Git Hook: Hook ${hookName} instalado exitosamente.`);

  // Asegurar permisos de ejecución en entornos no Windows
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch (err) {
    // Ignorar fallos de chmod en sistemas sin soporte (ej. Windows)
  }
}

function setup() {
  const repoRoot = path.resolve(__dirname, "..");
  const gitDir = path.join(repoRoot, ".git");

  if (!fs.existsSync(gitDir)) {
    console.error("Error: No se encontró la carpeta .git. Asegúrate de estar en la raíz del repositorio.");
    process.exit(1);
  }

  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // 1. Pre-commit hook: workspace validation + strict TDD
  installHook(hooksDir, "pre-commit", "scripts/hooks/pre-commit-hook.js");

  // 2. Commit-msg hook: blocks AI/model attribution in commit messages
  installHook(hooksDir, "commit-msg", "scripts/hooks/commit-msg-hook.js");
}

if (require.main === module) {
  setup();
}
