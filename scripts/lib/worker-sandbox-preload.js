"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  confineChildEnv,
  createSandboxDenial,
  normalizeSpawnArgs,
  normalizeExecFileArgs,
  assertAuthorizedNodeOrThrow,
  assertNoShellOrThrow,
} = require("./worker-sandbox-confine.js");

const PRELOAD_SCRIPT_PATH = path.resolve(__dirname, "worker-sandbox-preload.js");

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

  function resolveRealTargetPath(absTarget) {
    let curr = absTarget;
    const suffix = [];
    while (curr && curr !== path.dirname(curr)) {
      try {
        if (fs.existsSync(curr) || fs.lstatSync(curr)) {
          const realCurr = fs.realpathSync(curr);
          return suffix.length > 0 ? path.join(realCurr, ...suffix) : realCurr;
        }
      } catch {}
      suffix.unshift(path.basename(curr));
      curr = path.dirname(curr);
    }
    return absTarget;
  }

  const capturedPolicy = Object.freeze({
    workspaceRoot: realWorkspaceRoot,
    allowedPaths: Object.freeze(allowedPaths.slice()),
  });

  const fdPathRegistry = new Map();

  function registerFd(fd, rawPath) {
    if (typeof fd !== "number") return;
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
      } else {
        return;
      }
    }
    if (typeof targetStr === "string") {
      fdPathRegistry.set(fd, targetStr);
    }
  }

  function unregisterFd(fd) {
    if (typeof fd === "number") fdPathRegistry.delete(fd);
  }

  function assertFdWriteAllowed(fd, opName) {
    if (typeof fd !== "number") return;
    const mapped = fdPathRegistry.get(fd);
    if (mapped === undefined) {
      const err = new Error(`EACCES: permission denied by worker sandbox (unknown fd blocked): ${fd} [operation: ${opName || "fd"}]`);
      err.code = "EACCES";
      err.errno = -13;
      err.syscall = opName || "fd";
      throw err;
    }
    assertWriteAllowed(mapped, opName);
  }

  function assertMutationTargetAllowed(target, opName) {
    if (target === undefined || target === null) return;
    if (typeof target === "number") {
      assertFdWriteAllowed(target, opName);
      return;
    }
    if (typeof target === "object" && typeof target.fd === "number") {
      assertFdWriteAllowed(target.fd, opName);
      return;
    }
    assertWriteAllowed(target, opName);
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
    const realTarget = resolveRealTargetPath(absTarget);

    const relNorm = path.relative(normWorkspaceRoot, absTarget);
    const isOutsideNorm = relNorm.startsWith("..") || path.isAbsolute(relNorm);

    const relReal = path.relative(realWorkspaceRoot, realTarget);
    const isOutsideReal = relReal.startsWith("..") || path.isAbsolute(relReal);

    // Canonical location is authoritative. String-form aliases such as macOS
    // `/var` → `/private/var` look "outside" via path.relative but realpath
    // stays inside the workspace; blocking on isOutsideNorm would fail closed
    // on every allowed probe write under os.tmpdir().
    if (isOutsideReal) {
      const err = new Error(`EACCES: permission denied by worker sandbox (external write blocked): ${targetStr} [operation: ${opName || "write"}]`);
      err.code = "EACCES";
      err.errno = -13;
      err.syscall = opName || "write";
      err.path = targetStr;
      throw err;
    }

    const relPosixNorm = relNorm.replace(/\\/g, "/");
    const relPosixReal = relReal.replace(/\\/g, "/");

    const realAllowed = isPathAllowed(relPosixReal, allowedPaths);
    const normAllowed = isOutsideNorm ? realAllowed : isPathAllowed(relPosixNorm, allowedPaths);
    if (!realAllowed || !normAllowed) {
      const err = new Error(`EACCES: permission denied by worker sandbox (undeclared write blocked): ${targetStr} -> ${relPosixNorm} [operation: ${opName || "write"}]`);
      err.code = "EACCES";
      err.errno = -13;
      err.syscall = opName || "write";
      err.path = targetStr;
      throw err;
    }
  }

  function assertSymlinkTargetAllowed(targetPath, linkPath, opName) {
    assertWriteAllowed(linkPath, opName || "symlink");
    if (typeof targetPath !== "string") return;
    const absLink = path.normalize(path.resolve(process.cwd(), String(linkPath)));
    const absTarget = path.isAbsolute(targetPath)
      ? path.normalize(targetPath)
      : path.normalize(path.resolve(path.dirname(absLink), targetPath));
    const realTarget = resolveRealTargetPath(absTarget);

    const relNorm = path.relative(normWorkspaceRoot, absTarget);
    const relReal = path.relative(realWorkspaceRoot, realTarget);

    if (relReal.startsWith("..") || path.isAbsolute(relReal)) {
      const err = new Error(`EACCES: permission denied by worker sandbox (symlink destination outside workspace blocked): ${targetPath} -> ${linkPath}`);
      err.code = "EACCES";
      err.errno = -13;
      err.syscall = opName || "symlink";
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

  // Intercept child_process. Fail closed: do not swallow patch errors.
  const cp = require("node:child_process");

  function confinedOptions(options) {
    assertNoShellOrThrow(options, "spawn");
    return {
      ...options,
      env: confineChildEnv(options && options.env, capturedPolicy, PRELOAD_SCRIPT_PATH),
    };
  }

  const origSpawn = cp.spawn;
  cp.spawn = function (file, args, options) {
    const inv = normalizeSpawnArgs(file, args, options);
    assertAuthorizedNodeOrThrow(inv.file, "spawn", inv.options.cwd);
    return origSpawn.call(this, process.execPath, inv.args, confinedOptions(inv.options));
  };

  const origSpawnSync = cp.spawnSync;
  cp.spawnSync = function (file, args, options) {
    const inv = normalizeSpawnArgs(file, args, options);
    assertAuthorizedNodeOrThrow(inv.file, "spawnSync", inv.options.cwd);
    return origSpawnSync.call(this, process.execPath, inv.args, confinedOptions(inv.options));
  };

  const origExecFile = cp.execFile;
  cp.execFile = function (file, args, options, callback) {
    const inv = normalizeExecFileArgs(file, args, options, callback);
    assertAuthorizedNodeOrThrow(inv.file, "execFile", inv.options.cwd);
    const nextOptions = confinedOptions(inv.options);
    if (typeof inv.callback === "function") {
      return origExecFile.call(this, process.execPath, inv.args, nextOptions, inv.callback);
    }
    return origExecFile.call(this, process.execPath, inv.args, nextOptions);
  };

  const origExecFileSync = cp.execFileSync;
  cp.execFileSync = function (file, args, options) {
    const inv = normalizeExecFileArgs(file, args, options);
    assertAuthorizedNodeOrThrow(inv.file, "execFileSync", inv.options.cwd);
    return origExecFileSync.call(this, process.execPath, inv.args, confinedOptions(inv.options));
  };

  const origFork = cp.fork;
  if (typeof origFork === "function") {
    cp.fork = function (modulePath, args, options) {
      const inv = normalizeSpawnArgs(modulePath, args, options);
      const nextOptions = {
        ...confinedOptions(inv.options),
        execPath: process.execPath,
      };
      return origFork.call(this, inv.file, inv.args, nextOptions);
    };
  }

  cp.exec = function (cmd, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    const err = new Error(`EACCES: permission denied by worker sandbox (shell execution blocked): ${cmd} [operation: exec]`);
    err.code = "EACCES";
    err.errno = -13;
    err.syscall = "exec";
    if (typeof cb === "function") {
      process.nextTick(() => cb(err, "", err.message));
      return null;
    }
    throw err;
  };

  cp.execSync = function (cmd) {
    const err = new Error(`EACCES: permission denied by worker sandbox (shell execution blocked): ${cmd} [operation: execSync]`);
    err.code = "EACCES";
    err.errno = -13;
    err.syscall = "execSync";
    throw err;
  };

  // Intercept worker_threads. Fail closed: do not swallow patch errors.
  const wt = require("node:worker_threads");
  const OrigWorker = wt.Worker;
  const SHARE_ENV = wt.SHARE_ENV;

  function confinedWorkerOptions(options) {
    const opts = options && typeof options === "object" && !Array.isArray(options)
      ? { ...options }
      : {};
    if (SHARE_ENV !== undefined && opts.env === SHARE_ENV) {
      throw createSandboxDenial("worker SHARE_ENV blocked; live parent env is not an escape hatch", "Worker");
    }
    opts.env = confineChildEnv(opts.env, capturedPolicy, PRELOAD_SCRIPT_PATH);
    const rest = Array.isArray(opts.execArgv) ? opts.execArgv : [];
    opts.execArgv = ["--require", PRELOAD_SCRIPT_PATH, ...rest];
    return opts;
  }

  class ConfinedWorker extends OrigWorker {
    constructor(filename, options) {
      super(filename, confinedWorkerOptions(options));
    }
  }
  wt.Worker = ConfinedWorker;

  // Patch sync fs methods
  const origWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function (file, data, options) {
    assertMutationTargetAllowed(file, "writeFileSync");
    return origWriteFileSync.apply(this, arguments);
  };

  const origAppendFileSync = fs.appendFileSync;
  fs.appendFileSync = function (file, data, options) {
    assertMutationTargetAllowed(file, "appendFileSync");
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
    const fd = origOpenSync.apply(this, arguments);
    if (typeof filePath !== "number") registerFd(fd, filePath);
    return fd;
  };

  const origCreateWriteStream = fs.createWriteStream;
  fs.createWriteStream = function (filePath, options) {
    if (typeof filePath !== "number") {
      const flags = options && typeof options === "object" ? options.flags : undefined;
      if (isWriteFlag(flags)) {
        assertWriteAllowed(filePath, "createWriteStream");
      }
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
  if (origRmdirSync) {
    fs.rmdirSync = function (p, options) {
      assertWriteAllowed(p, "rmdirSync");
      return origRmdirSync.apply(this, arguments);
    };
  }

  const origUnlinkSync = fs.unlinkSync;
  fs.unlinkSync = function (p) {
    assertWriteAllowed(p, "unlinkSync");
    return origUnlinkSync.apply(this, arguments);
  };

  const origTruncateSync = fs.truncateSync;
  if (origTruncateSync) {
    fs.truncateSync = function (p, len) {
      assertMutationTargetAllowed(p, "truncateSync");
      return origTruncateSync.apply(this, arguments);
    };
  }

  if (fs.cpSync) {
    const origCpSync = fs.cpSync;
    fs.cpSync = function (src, dest, options) {
      assertWriteAllowed(dest, "cpSync");
      return origCpSync.apply(this, arguments);
    };
  }

  const origSymlinkSync = fs.symlinkSync;
  if (origSymlinkSync) {
    fs.symlinkSync = function (target, p, type) {
      assertSymlinkTargetAllowed(target, p, "symlinkSync");
      return origSymlinkSync.apply(this, arguments);
    };
  }

  const origLinkSync = fs.linkSync;
  if (origLinkSync) {
    fs.linkSync = function (existingPath, newPath) {
      assertWriteAllowed(newPath, "linkSync:dest");
      return origLinkSync.apply(this, arguments);
    };
  }

  // Patch async callback fs methods
  const origWriteFile = fs.writeFile;
  fs.writeFile = function (file, data, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    try {
      assertMutationTargetAllowed(file, "writeFile");
    } catch (err) {
      if (typeof cb === "function") {
        return process.nextTick(() => cb(err));
      }
      throw err;
    }
    return origWriteFile.apply(this, arguments);
  };

  const origAppendFile = fs.appendFile;
  fs.appendFile = function (file, data, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    try {
      assertMutationTargetAllowed(file, "appendFile");
    } catch (err) {
      if (typeof cb === "function") {
        return process.nextTick(() => cb(err));
      }
      throw err;
    }
    return origAppendFile.apply(this, arguments);
  };

  const origMkdir = fs.mkdir;
  fs.mkdir = function (dirPath, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    try {
      assertWriteAllowed(dirPath, "mkdir");
    } catch (err) {
      if (typeof cb === "function") {
        return process.nextTick(() => cb(err));
      }
      throw err;
    }
    return origMkdir.apply(this, arguments);
  };

  const origOpen = fs.open;
  fs.open = function (filePath, flags, mode, callback) {
    const cb = typeof mode === "function" ? mode : (typeof flags === "function" ? flags : callback);
    try {
      if (typeof filePath !== "number" && isWriteFlag(flags)) {
        assertWriteAllowed(filePath, "open");
      }
    } catch (err) {
      if (typeof cb === "function") {
        return process.nextTick(() => cb(err));
      }
      throw err;
    }
    if (typeof cb === "function") {
      const args = [...arguments];
      args[args.length - 1] = function (err, fd) {
        if (!err && typeof filePath !== "number") registerFd(fd, filePath);
        return cb(err, fd);
      };
      return origOpen.apply(this, args);
    }
    return origOpen.apply(this, arguments);
  };

  const origCopyFile = fs.copyFile;
  fs.copyFile = function (src, dest, mode, callback) {
    const cb = typeof mode === "function" ? mode : callback;
    try {
      assertWriteAllowed(dest, "copyFile");
    } catch (err) {
      if (typeof cb === "function") {
        return process.nextTick(() => cb(err));
      }
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
      if (typeof callback === "function") {
        return process.nextTick(() => callback(err));
      }
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
        if (typeof cb === "function") {
          return process.nextTick(() => cb(err));
        }
        throw err;
      }
      return origRm.apply(this, arguments);
    };
  }

  const origRmdir = fs.rmdir;
  if (origRmdir) {
    fs.rmdir = function (p, options, callback) {
      const cb = typeof options === "function" ? options : callback;
      try {
        assertWriteAllowed(p, "rmdir");
      } catch (err) {
        if (typeof cb === "function") {
          return process.nextTick(() => cb(err));
        }
        throw err;
      }
      return origRmdir.apply(this, arguments);
    };
  }

  const origUnlink = fs.unlink;
  fs.unlink = function (p, callback) {
    try {
      assertWriteAllowed(p, "unlink");
    } catch (err) {
      if (typeof callback === "function") {
        return process.nextTick(() => callback(err));
      }
      throw err;
    }
    return origUnlink.apply(this, arguments);
  };

  const origTruncate = fs.truncate;
  if (origTruncate) {
    fs.truncate = function (p, len, callback) {
      const cb = typeof len === "function" ? len : callback;
      try {
        assertMutationTargetAllowed(p, "truncate");
      } catch (err) {
        if (typeof cb === "function") {
          return process.nextTick(() => cb(err));
        }
        throw err;
      }
      return origTruncate.apply(this, arguments);
    };
  }

  if (fs.cp) {
    const origCp = fs.cp;
    fs.cp = function (src, dest, options, callback) {
      const cb = typeof options === "function" ? options : callback;
      try {
        assertWriteAllowed(dest, "cp");
      } catch (err) {
        if (typeof cb === "function") {
          return process.nextTick(() => cb(err));
        }
        throw err;
      }
      return origCp.apply(this, arguments);
    };
  }

  const origSymlink = fs.symlink;
  if (origSymlink) {
    fs.symlink = function (target, p, type, callback) {
      const cb = typeof type === "function" ? type : callback;
      try {
        assertSymlinkTargetAllowed(target, p, "symlink");
      } catch (err) {
        if (typeof cb === "function") {
          return process.nextTick(() => cb(err));
        }
        throw err;
      }
      return origSymlink.apply(this, arguments);
    };
  }

  const origLink = fs.link;
  if (origLink) {
    fs.link = function (existingPath, newPath, callback) {
      try {
        assertWriteAllowed(newPath, "link:dest");
      } catch (err) {
        if (typeof callback === "function") {
          return process.nextTick(() => callback(err));
        }
        throw err;
      }
      return origLink.apply(this, arguments);
    };
  }

  // Patch fs.promises methods
  if (fs.promises) {
    const origPromWriteFile = fs.promises.writeFile;
    fs.promises.writeFile = async function (file, data, options) {
      assertMutationTargetAllowed(file, "promises.writeFile");
      return origPromWriteFile.apply(this, arguments);
    };

    const origPromAppendFile = fs.promises.appendFile;
    fs.promises.appendFile = async function (file, data, options) {
      assertMutationTargetAllowed(file, "promises.appendFile");
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
      const handle = await origPromOpen.apply(this, arguments);
      return wrapFileHandle(handle, filePath);
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
        assertMutationTargetAllowed(p, "promises.truncate");
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

    if (fs.promises.symlink) {
      const origPromSymlink = fs.promises.symlink;
      fs.promises.symlink = async function (target, p, type) {
        assertSymlinkTargetAllowed(target, p, "promises.symlink");
        return origPromSymlink.apply(this, arguments);
      };
    }

    if (fs.promises.link) {
      const origPromLink = fs.promises.link;
      fs.promises.link = async function (existingPath, newPath) {
        assertWriteAllowed(newPath, "promises.link");
        return origPromLink.apply(this, arguments);
      };
    }

    wrapPromisePathFn(fs.promises, "mkdtemp", 0);
    wrapPromisePathFn(fs.promises, "chmod", 0);
    wrapPromisePathFn(fs.promises, "lchmod", 0);
    wrapPromisePathFn(fs.promises, "chown", 0);
    wrapPromisePathFn(fs.promises, "lchown", 0);
    wrapPromisePathFn(fs.promises, "utimes", 0);
    wrapPromisePathFn(fs.promises, "lutimes", 0);
    wrapPromisePathFn(fs.promises, "mkdtempDisposable", 0);
  }

  function wrapFileHandle(handle, openedPath) {
    if (!handle || typeof handle !== "object") return handle;
    if (typeof handle.fd === "number" && openedPath != null && typeof openedPath !== "number") {
      registerFd(handle.fd, openedPath);
    }
    const wrapMethod = (name) => {
      const orig = handle[name];
      if (typeof orig !== "function") return;
      try {
        handle[name] = function (...args) {
          assertFdWriteAllowed(handle.fd, `FileHandle.${name}`);
          return orig.apply(handle, args);
        };
      } catch {
        // Non-writable prototype method — fail closed on later fd ops via registry.
      }
    };
    for (const name of ["chmod", "chown", "utimes", "truncate", "write", "writev", "writeFile", "appendFile", "createWriteStream"]) {
      wrapMethod(name);
    }
    if (typeof handle.close === "function") {
      const origClose = handle.close.bind(handle);
      const fd = handle.fd;
      try {
        handle.close = function (...args) {
          return Promise.resolve(origClose(...args)).finally(() => unregisterFd(fd));
        };
      } catch {}
    }
    return handle;
  }

  function wrapSyncPathFn(obj, name, pathIndex) {
    const orig = obj[name];
    if (typeof orig !== "function") return;
    obj[name] = function (...args) {
      assertMutationTargetAllowed(args[pathIndex], name);
      return orig.apply(this, args);
    };
  }

  function wrapCallbackPathFn(obj, name, pathIndex) {
    const orig = obj[name];
    if (typeof orig !== "function") return;
    obj[name] = function (...args) {
      const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : null;
      try {
        assertMutationTargetAllowed(args[pathIndex], name);
      } catch (err) {
        if (cb) return process.nextTick(() => cb(err));
        throw err;
      }
      return orig.apply(this, args);
    };
  }

  function wrapPromisePathFn(obj, name, pathIndex) {
    const orig = obj[name];
    if (typeof orig !== "function") return;
    obj[name] = async function (...args) {
      assertMutationTargetAllowed(args[pathIndex], name);
      return orig.apply(this, args);
    };
  }

  wrapSyncPathFn(fs, "mkdtempSync", 0);
  wrapSyncPathFn(fs, "chmodSync", 0);
  wrapSyncPathFn(fs, "lchmodSync", 0);
  wrapSyncPathFn(fs, "chownSync", 0);
  wrapSyncPathFn(fs, "lchownSync", 0);
  wrapSyncPathFn(fs, "utimesSync", 0);
  wrapSyncPathFn(fs, "lutimesSync", 0);
  wrapSyncPathFn(fs, "mkdtempDisposableSync", 0);
  wrapSyncPathFn(fs, "fchmodSync", 0);
  wrapSyncPathFn(fs, "fchownSync", 0);
  wrapSyncPathFn(fs, "futimesSync", 0);
  wrapSyncPathFn(fs, "ftruncateSync", 0);
  wrapSyncPathFn(fs, "writeSync", 0);
  wrapSyncPathFn(fs, "writevSync", 0);

  wrapCallbackPathFn(fs, "mkdtemp", 0);
  wrapCallbackPathFn(fs, "chmod", 0);
  wrapCallbackPathFn(fs, "lchmod", 0);
  wrapCallbackPathFn(fs, "chown", 0);
  wrapCallbackPathFn(fs, "lchown", 0);
  wrapCallbackPathFn(fs, "utimes", 0);
  wrapCallbackPathFn(fs, "lutimes", 0);
  wrapCallbackPathFn(fs, "fchmod", 0);
  wrapCallbackPathFn(fs, "fchown", 0);
  wrapCallbackPathFn(fs, "futimes", 0);
  wrapCallbackPathFn(fs, "ftruncate", 0);
  wrapCallbackPathFn(fs, "write", 0);
  wrapCallbackPathFn(fs, "writev", 0);

  const origCloseSync = fs.closeSync;
  if (typeof origCloseSync === "function") {
    fs.closeSync = function (fd) {
      const result = origCloseSync.apply(this, arguments);
      unregisterFd(fd);
      return result;
    };
  }
  const origClose = fs.close;
  if (typeof origClose === "function") {
    fs.close = function (fd, callback) {
      const cb = typeof fd === "function" ? fd : callback;
      const realFd = typeof fd === "function" ? undefined : fd;
      if (typeof cb === "function") {
        return origClose.call(this, realFd, function (err) {
          if (!err) unregisterFd(realFd);
          return cb(err);
        });
      }
      const result = origClose.apply(this, arguments);
      unregisterFd(realFd);
      return result;
    };
  }
}
