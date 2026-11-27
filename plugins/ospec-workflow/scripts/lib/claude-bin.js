"use strict";

// Where the claude CLI is: the first `claude` on the PATH that is not a
// Windows binary reached through WSL, else the WinGet install on Windows. The
// generator, the checks and the automatic run of `ospec auto` share it, and it
// ships in the runtime of every target.

const fs = require("node:fs");
const path = require("node:path");

function resolveWinGetClaudeBin(packagesDir) {
  try {
    for (const entry of fs.readdirSync(packagesDir)) {
      if (entry.startsWith("Anthropic.ClaudeCode")) {
        const fullPath = path.join(packagesDir, entry, "claude.exe");
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
  } catch {
    // ignore read/access errors
  }
  return null;
}

function resolveBinFromPath(binName) {
  const pathEnv = process.env.PATH || "";
  const delimiter = process.platform === "win32" ? ";" : ":";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const fullPath = path.join(dir, binName + ext);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          return fullPath;
        }
      } catch {
        // ignore access/existence errors
      }
    }
  }
  return null;
}

// A /mnt/<drive>/ path on linux is a Windows binary reached through the WSL
// interop mount. It may start, but it reinterprets POSIX paths (a /tmp/...
// argument becomes a path on a Windows drive), so it can never consume the
// POSIX output dirs we generate. Treat it as unusable.
function isWindowsInteropPath(p) {
  return process.platform === "linux" && /^\/mnt\/[a-z]\//.test(p);
}

function resolveClaudeBin() {
  const resolved = resolveBinFromPath("claude");
  if (resolved && !isWindowsInteropPath(resolved)) {
    return resolved;
  }

  // Fallback: check WinGet packages folder in LocalAppData on Windows
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const packagesDir = path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(packagesDir)) {
      return resolveWinGetClaudeBin(packagesDir);
    }
  }

  return null;
}

module.exports = { isWindowsInteropPath, resolveBinFromPath, resolveClaudeBin, resolveWinGetClaudeBin };
