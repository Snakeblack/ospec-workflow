"use strict";

// Roadmap E0.4 (b): the generated orchestrator names its on-demand `_shared`
// handlers through SHARED_DIR_MARKER, because only the installer knows where
// `skills/_shared/` ends up (a home root, a custom --dest, a WSL Windows root,
// the VS Code dist tree, or a repository). Installers render the marker in the
// generated tree just before syncing it and restore it afterwards, so `dist/`
// stays deterministic and one build can serve several roots.

const fs = require("node:fs");
const path = require("node:path");
const { SHARED_DIR_MARKER } = require("../lib/target-transform.js");

// The `_shared` directory under an installed skills directory. A repository
// install keeps it relative to the repository root (the files are committed
// and shared); a global install gets an absolute path.
function sharedDirValue(skillsDir, { relative = false } = {}) {
  const dir = relative ? path.posix.join(String(skillsDir).split(path.sep).join("/"), "_shared") : path.resolve(skillsDir, "_shared");
  return dir.split(path.sep).join("/");
}

function renderSharedDir(rootDir, value, fsImpl = fs) {
  if (typeof value !== "string" || value === "" || value.includes(SHARED_DIR_MARKER)) {
    throw new Error(`invalid shared directory for ${SHARED_DIR_MARKER}: ${JSON.stringify(value)}`);
  }
  const originals = [];
  for (const file of markerFiles(rootDir, fsImpl)) {
    const content = fsImpl.readFileSync(file, "utf8");
    originals.push({ file, content });
    fsImpl.writeFileSync(file, content.split(SHARED_DIR_MARKER).join(value));
  }
  return {
    files: originals.map(({ file }) => file),
    restore() {
      for (const { file, content } of originals) fsImpl.writeFileSync(file, content);
    },
  };
}

// Text files only: the marker lives in Markdown and TOML agent files, never in
// the hook binaries the tree also carries.
function markerFiles(rootDir, fsImpl) {
  const found = [];
  const visit = (dir) => {
    for (const entry of fsImpl.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.(md|toml)$/.test(entry.name) && fsImpl.readFileSync(absolute, "utf8").includes(SHARED_DIR_MARKER)) {
        found.push(absolute);
      }
    }
  };
  if (fsImpl.existsSync(rootDir)) visit(rootDir);
  return found.sort();
}

module.exports = { SHARED_DIR_MARKER, renderSharedDir, sharedDirValue };
