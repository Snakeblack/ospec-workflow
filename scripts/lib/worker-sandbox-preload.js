"use strict";

const fs = require("node:fs");
const path = require("node:path");

const workspaceRootEnv = process.env.OSPEC_SANDBOX_WORKSPACE_ROOT;
const rawAllowedPaths = process.env.OSPEC_SANDBOX_ALLOWED_PATHS;

if (workspaceRootEnv) {
  let allowedPaths = ["**"];
  try {
    if (rawAllowedPaths) {
      const parsed = JSON.parse(rawAllowedPaths);
      if (Array.isArray(parsed)) {
        allowedPaths = parsed;
      }
    }
  } catch {}

  const normWorkspaceRoot = path.normalize(path.resolve(workspaceRootEnv));
  let realWorkspaceRoot = normWorkspaceRoot;
  try {
    realWorkspaceRoot = fs.realpathSync(normWorkspaceRoot);
  } catch {}

  function normalizeRelativePath(p) {
    if (typeof p !== "string" || !p.trim() || p.includes("\0")) {
      return null;
    }
    const posix = p.replace(/\\/g, "/");
    if (posix.startsWith("/") || /^[a-zA-Z]:/.test(posix)) {
      return null;
    }
    const parts = posix.split("/");
    const normalizedParts = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") return null;
      normalizedParts.push(part);
    }
    if (normalizedParts.length === 0) return null;
    return normalizedParts.join("/");
  }

  function isPathAllowed(relPosix, allowedList) {
    if (!Array.isArray(allowedList) || allowedList.length === 0) return false;
    if (relPosix === "" || relPosix === ".") return true;
    for (const allowed of allowedList) {
      if (typeof allowed !== "string" || !allowed) continue;
      if (allowed.includes("..")) continue;
      const normAllowed = allowed.replace(/\\/g, "/").replace(/^\.\//, "");
      if (normAllowed === "**" || normAllowed === "*") return true;
      if (normAllowed.endsWith("/**")) {
        const prefix = normAllowed.slice(0, -3);
        if (relPosix === prefix || relPosix.startsWith(prefix + "/")) return true;
      } else if (normAllowed.endsWith("/*")) {
        const prefix = normAllowed.slice(0, -2);
        if (relPosix.startsWith(prefix + "/")) {
          const rest = relPosix.slice(prefix.length + 1);
          if (!rest.includes("/")) return true;
        }
      } else if (normAllowed.endsWith("/")) {
        const prefix = normAllowed.slice(0, -1);
        if (relPosix === prefix || relPosix.startsWith(prefix + "/")) return true;
      } else if (normAllowed === relPosix) {
        return true;
      }
    }
    return false;
  }

  function assertWriteAllowed(rawPath, opName) {
    if (rawPath === undefined || rawPath === null) return;
    let targetStr = rawPath;
    if (typeof rawPath === "object" && rawPath !== null) {
      if (typeof rawPath.href === "string" && rawPath.protocol === "file:") {
        try {
          const { fileURLToPath } = require("node:url");
          targetStr = fileURLToPath(rawPath);
        } catch {}
      } else if (Buffer.isBuffer(rawPath)) {
        targetStr = rawPath.toString("utf8");
      }
    }
    if (typeof targetStr !== "string") return;

    const absTarget = path.normalize(path.resolve(process.cwd(), targetStr));
    let realTarget = absTarget;
    try {
      if (fs.existsSync(absTarget)) {
        realTarget = fs.realpathSync(absTarget);
      } else {
        const parent = path.dirname(absTarget);
        if (fs.existsSync(parent)) {
          realTarget = path.join(fs.realpathSync(parent), path.basename(absTarget));
        }
      }
    } catch {}

    const relNorm = path.relative(normWorkspaceRoot, absTarget);
    const isOutsideNorm = relNorm.startsWith("..") || path.isAbsolute(relNorm);

    const relReal = path.relative(realWorkspaceRoot, realTarget);
    const isOutsideReal = relReal.startsWith("..") || path.isAbsolute(relReal);

    const isOutside = isOutsideNorm && isOutsideReal;

    if (isOutside) {
      const err = new Error(`EACCES: permission denied by worker sandbox (external write blocked): ${targetStr} [operation: ${opName || "write"}]`);
      err.code = "EACCES";
      err.errno = -13;
      err.syscall = opName || "write";
      err.path = targetStr;
      throw err;
    }

    const activeRel = !isOutsideNorm ? relNorm : relReal;
    const relPosix = activeRel.replace(/\\/g, "/");
    if (!isPathAllowed(relPosix, allowedPaths)) {
      const err = new Error(`EACCES: permission denied by worker sandbox (undeclared write blocked): ${targetStr} -> ${relPosix} [operation: ${opName || "write"}]`);
      err.code = "EACCES";
      err.errno = -13;
      err.syscall = opName || "write";
      err.path = targetStr;
      throw err;
    }
  }

  function isWriteFlag(flags) {
    if (flags === undefined || flags === null) return true;
    if (typeof flags === "number") {
      const O_RDONLY = fs.constants?.O_RDONLY ?? 0;
      if (flags === O_RDONLY) return false;
      return true;
    }
    if (typeof flags === "string") {
      if (flags === "r" || flags === "r+" || flags === "rs" || flags === "rs+") {
        return flags.includes("+");
      }
      return true;
    }
    return true;
  }

  // Patch sync fs methods
  const origWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function (file, data, options) {
    if (typeof file !== "number") assertWriteAllowed(file, "writeFileSync");
    return origWriteFileSync.apply(this, arguments);
  };

  const origAppendFileSync = fs.appendFileSync;
  fs.appendFileSync = function (file, data, options) {
    if (typeof file !== "number") assertWriteAllowed(file, "appendFileSync");
    return origAppendFileSync.apply(this, arguments);
  };

  const origMkdirSync = fs.mkdirSync;
  fs.mkdirSync = function (dirPath, options) {
    assertWriteAllowed(dirPath, "mkdirSync");
    return origMkdirSync.apply(this, arguments);
  };

  const origOpenSync = fs.openSync;
  fs.openSync = function (filePath, flags, mode) {
    if (typeof filePath !== "number" && isWriteFlag(flags)) {
      assertWriteAllowed(filePath, "openSync");
    }
    return origOpenSync.apply(this, arguments);
  };

  const origCreateWriteStream = fs.createWriteStream;
  fs.createWriteStream = function (filePath, options) {
    if (typeof filePath !== "number") {
      assertWriteAllowed(filePath, "createWriteStream");
    }
    return origCreateWriteStream.apply(this, arguments);
  };

  const origCopyFileSync = fs.copyFileSync;
  fs.copyFileSync = function (src, dest, mode) {
    assertWriteAllowed(dest, "copyFileSync");
    return origCopyFileSync.apply(this, arguments);
  };

  const origRenameSync = fs.renameSync;
  fs.renameSync = function (oldPath, newPath) {
    assertWriteAllowed(oldPath, "renameSync:src");
    assertWriteAllowed(newPath, "renameSync:dest");
    return origRenameSync.apply(this, arguments);
  };

  const origRmSync = fs.rmSync;
  if (origRmSync) {
    fs.rmSync = function (p, options) {
      assertWriteAllowed(p, "rmSync");
      return origRmSync.apply(this, arguments);
    };
  }

  const origRmdirSync = fs.rmdirSync;
  fs.rmdirSync = function (p, options) {
    assertWriteAllowed(p, "rmdirSync");
    return origRmdirSync.apply(this, arguments);
  };

  const origUnlinkSync = fs.unlinkSync;
  fs.unlinkSync = function (p) {
    assertWriteAllowed(p, "unlinkSync");
    return origUnlinkSync.apply(this, arguments);
  };

  const origTruncateSync = fs.truncateSync;
  fs.truncateSync = function (p, len) {
    if (typeof p !== "number") assertWriteAllowed(p, "truncateSync");
    return origTruncateSync.apply(this, arguments);
  };

  if (fs.cpSync) {
    const origCpSync = fs.cpSync;
    fs.cpSync = function (src, dest, options) {
      assertWriteAllowed(dest, "cpSync");
      return origCpSync.apply(this, arguments);
    };
  }

  // Patch async callback fs methods
  const origWriteFile = fs.writeFile;
  fs.writeFile = function (file, data, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    if (typeof file !== "number") {
      try {
        assertWriteAllowed(file, "writeFile");
      } catch (err) {
        if (typeof cb === "function") return process.nextTick(() => cb(err));
        throw err;
      }
    }
    return origWriteFile.apply(this, arguments);
  };

  const origAppendFile = fs.appendFile;
  fs.appendFile = function (file, data, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    if (typeof file !== "number") {
      try {
        assertWriteAllowed(file, "appendFile");
      } catch (err) {
        if (typeof cb === "function") return process.nextTick(() => cb(err));
        throw err;
      }
    }
    return origAppendFile.apply(this, arguments);
  };

  const origMkdir = fs.mkdir;
  fs.mkdir = function (dirPath, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    try {
      assertWriteAllowed(dirPath, "mkdir");
    } catch (err) {
      if (typeof cb === "function") return process.nextTick(() => cb(err));
      throw err;
    }
    return origMkdir.apply(this, arguments);
  };

  const origOpen = fs.open;
  fs.open = function (filePath, flags, mode, callback) {
    let cb = callback;
    if (typeof mode === "function") cb = mode;
    else if (typeof flags === "function") cb = flags;
    if (typeof filePath !== "number" && isWriteFlag(flags)) {
      try {
        assertWriteAllowed(filePath, "open");
      } catch (err) {
        if (typeof cb === "function") return process.nextTick(() => cb(err));
        throw err;
      }
    }
    return origOpen.apply(this, arguments);
  };

  const origCopyFile = fs.copyFile;
  fs.copyFile = function (src, dest, mode, callback) {
    const cb = typeof mode === "function" ? mode : callback;
    try {
      assertWriteAllowed(dest, "copyFile");
    } catch (err) {
      if (typeof cb === "function") return process.nextTick(() => cb(err));
      throw err;
    }
    return origCopyFile.apply(this, arguments);
  };

  const origRename = fs.rename;
  fs.rename = function (oldPath, newPath, callback) {
    try {
      assertWriteAllowed(oldPath, "rename:src");
      assertWriteAllowed(newPath, "rename:dest");
    } catch (err) {
      if (typeof callback === "function") return process.nextTick(() => callback(err));
      throw err;
    }
    return origRename.apply(this, arguments);
  };

  const origRm = fs.rm;
  if (origRm) {
    fs.rm = function (p, options, callback) {
      const cb = typeof options === "function" ? options : callback;
      try {
        assertWriteAllowed(p, "rm");
      } catch (err) {
        if (typeof cb === "function") return process.nextTick(() => cb(err));
        throw err;
      }
      return origRm.apply(this, arguments);
    };
  }

  const origRmdir = fs.rmdir;
  fs.rmdir = function (p, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    try {
      assertWriteAllowed(p, "rmdir");
    } catch (err) {
      if (typeof cb === "function") return process.nextTick(() => cb(err));
      throw err;
    }
    return origRmdir.apply(this, arguments);
  };

  const origUnlink = fs.unlink;
  fs.unlink = function (p, callback) {
    try {
      assertWriteAllowed(p, "unlink");
    } catch (err) {
      if (typeof callback === "function") return process.nextTick(() => callback(err));
      throw err;
    }
    return origUnlink.apply(this, arguments);
  };

  // Patch fs.promises
  if (fs.promises) {
    const origPromWriteFile = fs.promises.writeFile;
    fs.promises.writeFile = async function (file, data, options) {
      if (typeof file !== "number") assertWriteAllowed(file, "promises.writeFile");
      return origPromWriteFile.apply(this, arguments);
    };

    const origPromAppendFile = fs.promises.appendFile;
    fs.promises.appendFile = async function (file, data, options) {
      if (typeof file !== "number") assertWriteAllowed(file, "promises.appendFile");
      return origPromAppendFile.apply(this, arguments);
    };

    const origPromMkdir = fs.promises.mkdir;
    fs.promises.mkdir = async function (dirPath, options) {
      assertWriteAllowed(dirPath, "promises.mkdir");
      return origPromMkdir.apply(this, arguments);
    };

    const origPromOpen = fs.promises.open;
    fs.promises.open = async function (filePath, flags, mode) {
      if (typeof filePath !== "number" && isWriteFlag(flags)) {
        assertWriteAllowed(filePath, "promises.open");
      }
      return origPromOpen.apply(this, arguments);
    };

    const origPromCopyFile = fs.promises.copyFile;
    fs.promises.copyFile = async function (src, dest, mode) {
      assertWriteAllowed(dest, "promises.copyFile");
      return origPromCopyFile.apply(this, arguments);
    };

    const origPromRename = fs.promises.rename;
    fs.promises.rename = async function (oldPath, newPath) {
      assertWriteAllowed(oldPath, "promises.rename:src");
      assertWriteAllowed(newPath, "promises.rename:dest");
      return origPromRename.apply(this, arguments);
    };

    const origPromRm = fs.promises.rm;
    if (origPromRm) {
      fs.promises.rm = async function (p, options) {
        assertWriteAllowed(p, "promises.rm");
        return origPromRm.apply(this, arguments);
      };
    }

    const origPromRmdir = fs.promises.rmdir;
    if (origPromRmdir) {
      fs.promises.rmdir = async function (p, options) {
        assertWriteAllowed(p, "promises.rmdir");
        return origPromRmdir.apply(this, arguments);
      };
    }

    const origPromUnlink = fs.promises.unlink;
    fs.promises.unlink = async function (p) {
      assertWriteAllowed(p, "promises.unlink");
      return origPromUnlink.apply(this, arguments);
    };

    const origPromTruncate = fs.promises.truncate;
    if (origPromTruncate) {
      fs.promises.truncate = async function (p, len) {
        if (typeof p !== "number") assertWriteAllowed(p, "promises.truncate");
        return origPromTruncate.apply(this, arguments);
      };
    }

    if (fs.promises.cp) {
      const origPromCp = fs.promises.cp;
      fs.promises.cp = async function (src, dest, options) {
        assertWriteAllowed(dest, "promises.cp");
        return origPromCp.apply(this, arguments);
      };
    }
  }
}
