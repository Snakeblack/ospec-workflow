"use strict";

// `.ospec/` is derived session data (summaries, costs, cache). Installers that
// write into a repository add the ignore entry when it is missing. A symlink
// is left untouched: writeFileSync would follow it and create or rewrite the
// file outside the repository.

const fs = require("node:fs");
const path = require("node:path");

const OSPEC_IGNORE_LINE = ".ospec/";
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

function ignoresOspec(text) {
  return String(text).split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed === ".ospec" || trimmed === ".ospec/" || trimmed === ".ospec/**"
      || trimmed === "/.ospec" || trimmed === "/.ospec/" || trimmed === "/.ospec/**";
  });
}

function lstatOrNull(fsImpl, file) {
  try {
    return fsImpl.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function readRegularFile(fsImpl, file) {
  const fd = fsImpl.openSync(file, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    if (!fsImpl.fstatSync(fd).isFile()) return null;
    return fsImpl.readFileSync(fd, "utf8");
  } finally {
    fsImpl.closeSync(fd);
  }
}

function ensureOspecGitignore(repoRoot, fsImpl = fs) {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  const stat = lstatOrNull(fsImpl, gitignorePath);
  if (stat && (stat.isSymbolicLink() || !stat.isFile())) return { changed: false, path: gitignorePath };

  const existing = stat ? readRegularFile(fsImpl, gitignorePath) : "";
  if (existing == null || ignoresOspec(existing)) return { changed: false, path: gitignorePath };
  const body = existing.length === 0 || existing.endsWith("\n") ? existing : `${existing}\n`;
  const payload = `${body}${OSPEC_IGNORE_LINE}\n`;
  if (!stat) {
    try {
      fsImpl.writeFileSync(gitignorePath, payload, { flag: "wx" });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      return { changed: false, path: gitignorePath };
    }
  } else {
    fsImpl.writeFileSync(gitignorePath, payload);
  }
  return { changed: true, path: gitignorePath };
}

module.exports = {
  OSPEC_IGNORE_LINE,
  ensureOspecGitignore,
  ignoresOspec,
};
