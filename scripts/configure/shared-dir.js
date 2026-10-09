"use strict";

// Roadmap E0.4 (b): the generated orchestrator names its on-demand `_shared`
// handlers through SHARED_DIR_MARKER, because only the installer knows where
// `skills/_shared/` ends up (a home root, a custom --dest, a WSL Windows root,
// the VS Code dist tree, or a repository). Installers render the marker in the
// generated tree just before syncing it and restore it afterwards, so `dist/`
// stays deterministic and one build can serve several roots.

const fs = require("node:fs");
const path = require("node:path");
const { RUNTIME_DIR_MARKER, SHARED_DIR_MARKER } = require("../lib/target-transform.js");

// The `_shared` directory under an installed skills directory. A repository
// install keeps it relative to the repository root (the files are committed
// and shared); a global install gets an absolute path.
function sharedDirValue(skillsDir, { relative = false } = {}) {
  const dir = relative ? path.posix.join(String(skillsDir).split(path.sep).join("/"), "_shared") : path.resolve(skillsDir, "_shared");
  return dir.split(path.sep).join("/");
}

function renderSharedDir(rootDir, value, fsImpl = fs) {
  return renderMarker(rootDir, SHARED_DIR_MARKER, value, "shared directory", fsImpl);
}

// E1.6 (a): the IDD protocol runs the installed `ospec` CLI, so it names the
// directory that holds the runtime `scripts/` (the install root, except for
// Codex, which keeps it under ~/.codex/ospec-workflow). A Codex repository
// install (E1.14) names its own copy relative to the repository root, where
// the protocol runs `ospec`, so the committed files work on every clone.
function runtimeDirValue(dir, { relative = false } = {}) {
  return (relative ? String(dir) : path.resolve(dir)).split(path.sep).join("/");
}

function renderRuntimeDir(rootDir, value, fsImpl = fs) {
  return renderMarker(rootDir, RUNTIME_DIR_MARKER, value, "runtime directory", fsImpl);
}

function renderMarker(rootDir, marker, value, label, fsImpl) {
  if (typeof value !== "string" || value === "" || value.includes(marker)) {
    throw new Error(`invalid ${label} for ${marker}: ${JSON.stringify(value)}`);
  }
  const originals = [];
  for (const file of markerFiles(rootDir, marker, fsImpl)) {
    const content = fsImpl.readFileSync(file, "utf8");
    originals.push({ file, content });
    fsImpl.writeFileSync(file, content.split(marker).join(value));
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
function markerFiles(rootDir, marker, fsImpl) {
  const found = [];
  const visit = (dir) => {
    for (const entry of fsImpl.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.(md|toml)$/.test(entry.name) && fsImpl.readFileSync(absolute, "utf8").includes(marker)) {
        found.push(absolute);
      }
    }
  };
  if (fsImpl.existsSync(rootDir)) visit(rootDir);
  return found.sort();
}

module.exports = { RUNTIME_DIR_MARKER, SHARED_DIR_MARKER, renderRuntimeDir, renderSharedDir, runtimeDirValue, sharedDirValue };
