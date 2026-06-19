"use strict";

const fs = require("node:fs");
const path = require("node:path");

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

  const preCommitPath = path.join(hooksDir, "pre-commit");
  const hookCommand = '\nnode "$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit-hook.js"';
  
  let existingContent = "";
  if (fs.existsSync(preCommitPath)) {
    existingContent = fs.readFileSync(preCommitPath, "utf8");
  }

  if (existingContent.includes("pre-commit-hook.js")) {
    console.log("Git Hook: El hook pre-commit ya está instalado.");
  } else {
    // Si ya existe contenido, lo preservamos y añadimos nuestro script al final.
    let newContent = existingContent;
    if (!newContent.startsWith("#!")) {
      newContent = "#!/bin/sh\n" + newContent;
    }
    newContent = newContent.trimEnd() + "\n" + hookCommand + "\n";
    
    fs.writeFileSync(preCommitPath, newContent, { mode: 0o755, encoding: "utf8" });
    console.log("Git Hook: Hook pre-commit instalado exitosamente.");
  }

  // Asegurar permisos de ejecución en entornos no Windows
  try {
    fs.chmodSync(preCommitPath, 0o755);
  } catch (err) {
    // Ignorar fallos de chmod en sistemas sin soporte (ej. Windows)
  }
}

if (require.main === module) {
  setup();
}
