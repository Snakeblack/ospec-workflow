"use strict";

// Roadmap E1.6 (d2): the SDD package installs only on request (`--with-sdd`),
// and a reinstall keeps it when the previous install held it, so nobody loses
// an SDD change in flight by updating; `--no-sdd` removes it (REQ-install-036).
// The previous install is read from the ownership manifest where the target
// keeps one, and from the installed agents directory where it does not.

const fs = require("node:fs");
const { readOwnershipManifest } = require("./install-engine.js");

// An installed `sdd-*` agent, skill, command or rule. Runtime scripts and the
// shared modules (`skills/_shared/sdd-phase-common.md`) are not the package.
const SDD_ENTRY = /^sdd-[a-z0-9-]+(\.|$)/;
const NOT_PACKAGE = new Set(["scripts", "_shared"]);

function hasSddPath(file) {
  const segments = String(file).replace(/\\/g, "/").split("/");
  return !segments.some((segment) => NOT_PACKAGE.has(segment)) && segments.some((segment) => SDD_ENTRY.test(segment));
}

function previousInstallHasSdd({ manifestRoots = [], agentDirs = [], fs: fsImpl = fs } = {}) {
  for (const root of manifestRoots) {
    let manifest = null;
    try {
      manifest = readOwnershipManifest(root, fsImpl);
    } catch {
      manifest = null; // an unreadable manifest holds nothing; the install reports it later
    }
    if (manifest && Array.isArray(manifest.files) && manifest.files.some(hasSddPath)) return true;
  }
  for (const dir of agentDirs) {
    try {
      if (fsImpl.readdirSync(dir).some((name) => SDD_ENTRY.test(name))) return true;
    } catch {
      // no agents directory: nothing installed there
    }
  }
  return false;
}

// Applies `--with-sdd` / `--no-sdd` to parsed args. Returns true when `arg`
// was one of them; both together leave a usage error in `args.error`.
function parseSddFlag(arg, args) {
  if (arg !== "--with-sdd" && arg !== "--no-sdd") return false;
  if (arg === "--with-sdd") args.withSdd = true;
  else args.noSdd = true;
  if (args.withSdd && args.noSdd) args.error = "--with-sdd and --no-sdd cannot be combined";
  return true;
}

// `--no-sdd` wins over a previous install, `--with-sdd` installs it, and with
// neither the previous install decides. `previous` is called only then.
function resolveWithSdd(args, previous) {
  if (args.noSdd) return false;
  if (args.withSdd) return true;
  return Boolean(previous());
}

// What an installer prints when it keeps SDD without being asked.
function sddKeptNote(args, withSdd) {
  return withSdd && !args.withSdd ? "keeping the SDD package of the previous install (--no-sdd removes it)\n" : "";
}

module.exports = { hasSddPath, parseSddFlag, previousInstallHasSdd, resolveWithSdd, sddKeptNote };
