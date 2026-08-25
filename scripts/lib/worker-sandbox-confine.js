"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createSandboxDenial(message, opName) {
  const err = new Error(`EACCES: permission denied by worker sandbox (${message})`);
  err.code = "EACCES";
  err.errno = -13;
  err.syscall = opName || "spawn";
  return err;
}

function getAuthorizedExecRealpath() {
  try {
    return fs.realpathSync(process.execPath);
  } catch {
    return path.resolve(process.execPath);
  }
}

function isBareNodeAlias(file) {
  if (typeof file !== "string" || file.includes("\0")) return false;
  if (file.includes("/") || file.includes("\\")) return false;
  const base = file.toLowerCase();
  return base === "node" || base === "node.exe";
}

function resolveCommandPath(file, cwd) {
  if (typeof file !== "string" || !file || file.includes("\0")) return null;
  if (isBareNodeAlias(file)) return process.execPath;
  if (path.isAbsolute(file)) return file;
  return path.resolve(cwd || process.cwd(), file);
}

function isAuthorizedNodeRuntime(file, cwd) {
  const resolved = resolveCommandPath(file, cwd);
  if (!resolved) return false;
  let realCandidate;
  try {
    if (!fs.existsSync(resolved)) return false;
    realCandidate = fs.realpathSync(resolved);
  } catch {
    return false;
  }
  return realCandidate === getAuthorizedExecRealpath();
}

function confineChildEnv(userEnv, parentEnv, preloadPath) {
  const parent = parentEnv && typeof parentEnv === "object" ? parentEnv : {};
  if (!parent.OSPEC_SANDBOX_WORKSPACE_ROOT || !parent.OSPEC_SANDBOX_ALLOWED_PATHS) {
    throw createSandboxDenial("sandbox env missing; child spawn rejected fail-closed", "env");
  }
  if (!preloadPath) {
    throw createSandboxDenial("sandbox preload missing; child spawn rejected fail-closed", "env");
  }

  const confined = userEnv && typeof userEnv === "object" && !Array.isArray(userEnv)
    ? { ...userEnv }
    : { ...parent };

  confined.OSPEC_SANDBOX_WORKSPACE_ROOT = parent.OSPEC_SANDBOX_WORKSPACE_ROOT;
  confined.OSPEC_SANDBOX_ALLOWED_PATHS = parent.OSPEC_SANDBOX_ALLOWED_PATHS;
  const safePreload = String(preloadPath).replace(/\\/g, "/");
  confined.NODE_OPTIONS = `--require "${safePreload}"`;
  return confined;
}

function normalizeSpawnArgs(file, args, options) {
  let argv = args;
  let opts = options;
  if (argv == null) {
    argv = [];
    opts = opts && typeof opts === "object" ? opts : {};
  } else if (!Array.isArray(argv)) {
    opts = argv;
    argv = [];
  }
  if (!opts || typeof opts !== "object") {
    opts = {};
  }
  return { file, args: argv, options: opts };
}

function normalizeExecFileArgs(file, args, options, callback) {
  let argv = args;
  let opts = options;
  let cb = callback;
  if (typeof argv === "function") {
    cb = argv;
    argv = [];
    opts = {};
  } else if (argv != null && !Array.isArray(argv) && typeof argv === "object") {
    cb = typeof opts === "function" ? opts : cb;
    opts = argv;
    argv = [];
  } else if (typeof opts === "function") {
    cb = opts;
    opts = {};
  }
  if (!Array.isArray(argv)) argv = [];
  if (!opts || typeof opts !== "object") opts = {};
  return { file, args: argv, options: opts, callback: cb };
}

function assertAuthorizedNodeOrThrow(file, opName, cwd) {
  if (isAuthorizedNodeRuntime(file, cwd)) return;
  throw createSandboxDenial(
    `child_process execution of unconfined binary blocked: ${file} [operation: ${opName}]`,
    opName
  );
}

function assertNoShellOrThrow(options, opName) {
  if (options && options.shell) {
    throw createSandboxDenial(`shell execution blocked: ${opName}`, opName);
  }
}

module.exports = {
  createSandboxDenial,
  getAuthorizedExecRealpath,
  isBareNodeAlias,
  isAuthorizedNodeRuntime,
  confineChildEnv,
  normalizeSpawnArgs,
  normalizeExecFileArgs,
  assertAuthorizedNodeOrThrow,
  assertNoShellOrThrow,
};
