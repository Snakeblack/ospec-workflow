"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  usage,
  parseArgs,
  findCodexBin,
  resolveCodexInvocation,
  copyCodexAgents,
  installCodexHooks,
  copyCodexRuntime,
  syncCodexSkills,
  readCodexMcpDefinitions,
  ensureCodexMcps,
  assertManagedPathSafe,
  gatherCodexOwnedFiles,
  transformLegacyServiceTier,
  repairCodexConfig,
  main,
} = require("./install-codex.js");

function makeTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(__dirname, "..", "..", ...segments), "utf8");
}

function snapshotTree(root) {
  const snapshot = [];
  const walk = (absolute, relative = "") => {
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      const childAbsolute = path.join(absolute, entry.name);
      const stat = fs.lstatSync(childAbsolute);
      if (entry.isDirectory()) {
        snapshot.push(["dir", childRelative, stat.mode & 0o777]);
        walk(childAbsolute, childRelative);
      } else if (entry.isFile()) {
        snapshot.push(["file", childRelative, stat.mode & 0o777, fs.readFileSync(childAbsolute, "hex")]);
      } else {
        snapshot.push(["other", childRelative, stat.mode & 0o777]);
      }
    }
  };
  walk(root);
  return snapshot;
}

function failOnceFs(method, destinationPattern) {
  let failed = false;
  return new Proxy(fs, {
    get(target, property) {
      if (property !== method) return target[property];
      return (...args) => {
        const destination = method === "copyFileSync" ? args[1] : args[0];
        if (!failed && destinationPattern.test(String(destination))) {
          failed = true;
          const error = new Error(`injected ${method} failure`);
          error.code = "EIO";
          throw error;
        }
        return target[property](...args);
      };
    },
  });
}

function writeGeneratedCodexTree(root) {
  fs.mkdirSync(path.join(root, ".codex", "agents"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex", "agents", "apply.toml"), 'name = "apply"\n');
  fs.writeFileSync(path.join(root, ".codex", "agents", "verify.toml"), 'name = "verify"\n');
  fs.writeFileSync(path.join(root, ".codex", "agents", "README.md"), "ignore\n");
  fs.writeFileSync(path.join(root, "AGENTS.md"), "orchestrator instructions\n");
  fs.mkdirSync(path.join(root, "scripts", "hooks"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "apply"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "verify"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "_shared"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "standalone-tool", "references"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "hooks", "session-start.js"), "// runtime\n");
  fs.writeFileSync(path.join(root, "skills", "apply", "SKILL.md"), "# Apply\n");
  fs.writeFileSync(path.join(root, "skills", "verify", "SKILL.md"), "# Verify\n");
  fs.writeFileSync(path.join(root, "skills", "_shared", "shared.md"), "shared\n");
  fs.writeFileSync(path.join(root, "skills", "standalone-tool", "SKILL.md"), "# Standalone\n");
  fs.writeFileSync(path.join(root, "skills", "standalone-tool", "references", "nested.txt"), "nested\n");
  fs.writeFileSync(
    path.join(root, "hooks.json"),
    JSON.stringify({
      hooks: {
        SessionStart: [{ matcher: ".*", hooks: [{ type: "command", command: 'OSPEC_TARGET=codex OSPEC_CODEX_WRAPPER=1 node "__OSPEC_RUNTIME__/scripts/hooks/session-start.js"', commandWindows: 'set OSPEC_TARGET=codex&& set OSPEC_CODEX_WRAPPER=1&& node "__OSPEC_RUNTIME__\\scripts\\hooks\\session-start.js"', timeout: 10 }] }],
      },
    }, null, 2),
  );
}

test("parseArgs parses global setup defaults and repo install flags", () => {
  assert.deepEqual(parseArgs([]), {
    dryRun: false,
    repairConfig: false,
    validate: true,
    source: undefined,
    destRepo: undefined,
  });

  assert.deepEqual(parseArgs(["../repo", "--dry-run", "--no-validate", "--source", "../src"]), {
    dryRun: true,
    repairConfig: false,
    validate: false,
    source: "../src",
    destRepo: "../repo",
  });

  assert.equal(parseArgs(["--repair-config"]).repairConfig, true);
  assert.match(parseArgs(["--unknown"]).error, /unknown option.*--unknown/i);
  assert.match(parseArgs(["repo-a", "repo-b"]).error, /only one destination/i);
  assert.match(usage(), /--repair-config/);
});

test("legacy service tier transformation is allowlisted, top-level only, and byte preserving otherwise", () => {
  const valid = Buffer.from('model = "gpt-5"\r\nservice_tier = "fast"\r\n');
  const nested = Buffer.from('[profile]\nservice_tier = "default"\n');
  const lookalikes = Buffer.from('service_tier="default" # comment\nservice_tier = \'default\'\n');

  assert.deepEqual(transformLegacyServiceTier(valid), { matched: false, bytes: valid });
  assert.deepEqual(transformLegacyServiceTier(nested), { matched: false, bytes: nested });
  assert.deepEqual(transformLegacyServiceTier(lookalikes), { matched: false, bytes: lookalikes });
});

test("legacy service tier transformation ignores assignments embedded in multiline TOML strings", () => {
  const input = Buffer.from([
    "literal = '''",
    '# this is string content, not a TOML comment',
    'service_tier = "default"',
    "'''",
    'basic = """prefix \\""" still string',
    '# still string content',
    'service_tier = "default"',
    '"""',
    '# actual top-level legacy assignment follows',
    'service_tier = "default"',
    'model = "gpt-5"',
    "",
  ].join("\r\n"));
  const expected = Buffer.from([
    "literal = '''",
    '# this is string content, not a TOML comment',
    'service_tier = "default"',
    "'''",
    'basic = """prefix \\""" still string',
    '# still string content',
    'service_tier = "default"',
    '"""',
    '# actual top-level legacy assignment follows',
    'model = "gpt-5"',
    "",
  ].join("\r\n"));

  const transformed = transformLegacyServiceTier(input);

  assert.equal(transformed.matched, true);
  assert.deepEqual(transformed.bytes, expected);
});

test("legacy service tier transformation fails closed when a multiline TOML string is unterminated", () => {
  const ambiguous = Buffer.from([
    'description = """',
    'service_tier = "default"',
    "",
  ].join("\n"));

  assert.deepEqual(transformLegacyServiceTier(ambiguous), { matched: false, bytes: ambiguous });
});

test("repairCodexConfig removes only the exact top-level legacy assignment and preserves BOM, CRLF, comments, mode, auth, and MCP state", (t) => {
  const homeDir = makeTempDir(t, "codex-config-repair-");
  const codexRoot = path.join(homeDir, ".codex");
  const configPath = path.join(codexRoot, "config.toml");
  const authPath = path.join(codexRoot, "auth.json");
  fs.mkdirSync(codexRoot, { recursive: true });
  const before = Buffer.from('\uFEFF# user comment\r\nservice_tier = "default"\r\nmodel = "gpt-5"\r\n');
  const expected = Buffer.from('\uFEFF# user comment\r\nmodel = "gpt-5"\r\n');
  fs.writeFileSync(configPath, before);
  fs.chmodSync(configPath, 0o600);
  const originalMode = fs.statSync(configPath).mode & 0o777;
  fs.writeFileSync(authPath, '{"token":"user-owned"}\n');
  const mcpState = [{ name: "user-owned" }];
  const calls = [];

  const result = repairCodexConfig(configPath, "codex", {
    fs,
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      return { status: 0, stdout: JSON.stringify(mcpState), stderr: "" };
    },
  });

  assert.equal(result.status, "repaired");
  assert.deepEqual(fs.readFileSync(configPath), expected);
  assert.equal(fs.statSync(configPath).mode & 0o777, originalMode);
  assert.deepEqual(fs.readFileSync(result.backupPath), before);
  assert.equal(fs.statSync(result.backupPath).mode & 0o777, originalMode);
  assert.equal(fs.readFileSync(authPath, "utf8"), '{"token":"user-owned"}\n');
  assert.deepEqual(mcpState, [{ name: "user-owned" }]);
  assert.deepEqual(calls, [["codex", "mcp", "list", "--json"]]);
});

test("repairCodexConfig is a no-op for no-match, dry-run, and a second idempotent run", (t) => {
  const root = makeTempDir(t, "codex-config-noop-");
  const configPath = path.join(root, "config.toml");
  const valid = Buffer.from('service_tier = "fast"\n');
  fs.writeFileSync(configPath, valid);
  let validationCalls = 0;
  assert.equal(repairCodexConfig(configPath, "codex", {
    runCodexCommand() { validationCalls += 1; },
  }).status, "no-match");
  assert.deepEqual(fs.readFileSync(configPath), valid);

  const legacy = Buffer.from('service_tier = "default"\nmodel = "gpt-5"\n');
  fs.writeFileSync(configPath, legacy);
  assert.equal(repairCodexConfig(configPath, "codex", {
    dryRun: true,
    runCodexCommand() { validationCalls += 1; },
  }).status, "would-repair");
  assert.deepEqual(fs.readFileSync(configPath), legacy);
  assert.equal(fs.readdirSync(root).length, 1);

  const first = repairCodexConfig(configPath, "codex", {
    runCodexCommand() { validationCalls += 1; return { status: 0, stdout: "[]", stderr: "" }; },
  });
  const second = repairCodexConfig(configPath, "codex", {
    runCodexCommand() { validationCalls += 1; return { status: 0, stdout: "[]", stderr: "" }; },
  });
  assert.equal(first.status, "repaired");
  assert.equal(second.status, "no-match");
  assert.equal(validationCalls, 1);
});

test("repairCodexConfig allocates a unique backup without overwriting a collision", (t) => {
  const root = makeTempDir(t, "codex-config-backup-collision-");
  const configPath = path.join(root, "config.toml");
  const collision = `${configPath}.ospec-backup`;
  fs.writeFileSync(configPath, 'service_tier = "default"\n');
  fs.writeFileSync(collision, "keep-existing\n");

  const result = repairCodexConfig(configPath, "codex", {
    runCodexCommand() { return { status: 0, stdout: "[]", stderr: "" }; },
  });

  assert.equal(result.status, "repaired");
  assert.notEqual(result.backupPath, collision);
  assert.equal(fs.readFileSync(collision, "utf8"), "keep-existing\n");
  assert.equal(fs.readFileSync(result.backupPath, "utf8"), 'service_tier = "default"\n');
});

test("repairCodexConfig restores original bytes and mode when write, rename, or Codex validation fails", (t) => {
  for (const failure of ["write", "rename", "validation"]) {
    const root = makeTempDir(t, `codex-config-rollback-${failure}-`);
    const configPath = path.join(root, "config.toml");
    const before = Buffer.from('# keep\nservice_tier = "default"\n');
    fs.writeFileSync(configPath, before);
    fs.chmodSync(configPath, 0o600);
    const originalMode = fs.statSync(configPath).mode & 0o777;
    let failed = false;
    const failingFs = new Proxy(fs, {
      get(target, property) {
        if (failure === "write" && property === "writeFileSync") {
          return (targetPath, ...args) => {
            if (!failed && String(targetPath).includes("ospec-repair")) {
              failed = true;
              const error = new Error("injected write failure"); error.code = "EIO"; throw error;
            }
            return target.writeFileSync(targetPath, ...args);
          };
        }
        if (failure === "rename" && property === "renameSync") {
          return (from, to) => {
            if (!failed && String(from).includes("ospec-repair") && to === configPath) {
              failed = true;
              const error = new Error("injected rename failure"); error.code = "EIO"; throw error;
            }
            return target.renameSync(from, to);
          };
        }
        return target[property];
      },
    });

    assert.throws(() => repairCodexConfig(configPath, "codex", {
      fs: failingFs,
      runCodexCommand() {
        return failure === "validation"
          ? { status: 1, stdout: "", stderr: "invalid config" }
          : { status: 0, stdout: "[]", stderr: "" };
      },
    }), new RegExp(failure === "validation" ? "validation" : failure, "i"));
    assert.deepEqual(fs.readFileSync(configPath), before, failure);
    assert.equal(fs.statSync(configPath).mode & 0o777, originalMode, failure);
    assert.ok(fs.readdirSync(root).some(name => name.includes("ospec-backup")), failure);
    assert.ok(!fs.readdirSync(root).some(name => name.includes("ospec-repair")), failure);
  }
});

test("repairCodexConfig retries transient publish renames with deterministic backoff and converges", (t) => {
  const root = makeTempDir(t, "codex-config-publish-retry-");
  const configPath = path.join(root, "config.toml");
  fs.writeFileSync(configPath, 'service_tier = "default"\nmodel = "gpt-5"\n');
  let publishAttempts = 0;
  const delays = [];
  const transientFs = new Proxy(fs, {
    get(target, property) {
      if (property !== "renameSync") return target[property];
      return (from, to) => {
        if (String(from).includes("ospec-repair") && to === configPath && publishAttempts++ < 2) {
          const error = new Error("publish locked"); error.code = "EPERM"; throw error;
        }
        return target.renameSync(from, to);
      };
    },
  });

  const result = repairCodexConfig(configPath, "codex", {
    fs: transientFs,
    retryOptions: { sleep: delay => delays.push(delay) },
    runCodexCommand() { return { status: 0, stdout: "[]", stderr: "" }; },
  });

  assert.equal(result.status, "repaired");
  assert.equal(publishAttempts, 3);
  assert.deepEqual(delays, [10, 20]);
  assert.equal(fs.readFileSync(configPath, "utf8"), 'model = "gpt-5"\n');
});

test("repairCodexConfig exhausts transient publish retries, then restores the original", (t) => {
  const root = makeTempDir(t, "codex-config-publish-exhaust-");
  const configPath = path.join(root, "config.toml");
  const before = Buffer.from('service_tier = "default"\nmodel = "gpt-5"\n');
  fs.writeFileSync(configPath, before);
  let publishAttempts = 0;
  const delays = [];
  const transientFs = new Proxy(fs, {
    get(target, property) {
      if (property !== "renameSync") return target[property];
      return (from, to) => {
        if (String(from).includes("ospec-repair") && to === configPath) {
          publishAttempts += 1;
          const error = new Error("publish still locked"); error.code = "EBUSY"; throw error;
        }
        return target.renameSync(from, to);
      };
    },
  });

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    fs: transientFs,
    retryOptions: { sleep: delay => delays.push(delay) },
    runCodexCommand() { throw new Error("validation must not run"); },
  }), error => error.code === "EBUSY");

  assert.equal(publishAttempts, 4);
  assert.deepEqual(delays, [10, 20, 30]);
  assert.deepEqual(fs.readFileSync(configPath), before);
  assert.ok(fs.readdirSync(root).some(name => name.includes("ospec-backup")));
});

test("repairCodexConfig retries transient rollback renames and restores after validation failure", (t) => {
  const root = makeTempDir(t, "codex-config-restore-retry-");
  const configPath = path.join(root, "config.toml");
  const before = Buffer.from('service_tier = "default"\nmodel = "gpt-5"\n');
  fs.writeFileSync(configPath, before);
  let restoreAttempts = 0;
  const delays = [];
  const transientFs = new Proxy(fs, {
    get(target, property) {
      if (property !== "renameSync") return target[property];
      return (from, to) => {
        if (String(from).includes("ospec-original") && to === configPath && restoreAttempts++ < 2) {
          const error = new Error("restore locked"); error.code = "EACCES"; throw error;
        }
        return target.renameSync(from, to);
      };
    },
  });

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    fs: transientFs,
    retryOptions: { sleep: delay => delays.push(delay) },
    runCodexCommand() { return { status: 1, stdout: "", stderr: "invalid" }; },
  }), /validation failed/i);

  assert.equal(restoreAttempts, 3);
  assert.deepEqual(delays, [10, 20]);
  assert.deepEqual(fs.readFileSync(configPath), before);
});

test("repairCodexConfig reports sanitized Codex validation diagnostics", (t) => {
  const root = makeTempDir(t, "codex-config-diagnostics-");
  const configPath = path.join(root, "config.toml");
  fs.writeFileSync(configPath, 'service_tier = "default"\n');

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    runCodexCommand() {
      return {
        status: 7,
        stdout: "  validation context\u0000  \n",
        stderr: "  invalid config at line 6\r\n  ",
      };
    },
  }), (error) => {
    assert.match(error.message, /stderr: invalid config at line 6/i);
    assert.match(error.message, /stdout: validation context/i);
    assert.doesNotMatch(error.message, /\u0000/);
    return true;
  });
});

test("repairCodexConfig fails closed without overwriting a concurrent config change", (t) => {
  const root = makeTempDir(t, "codex-config-concurrent-");
  const configPath = path.join(root, "config.toml");
  const initial = 'service_tier = "default"\nmodel = "gpt-5"\n';
  const concurrent = 'service_tier = "flex"\nmodel = "gpt-5.1"\n';
  fs.writeFileSync(configPath, initial);
  let mutated = false;
  const concurrentFs = new Proxy(fs, {
    get(target, property) {
      if (property !== "writeFileSync") return target[property];
      return (targetPath, ...args) => {
        const result = target.writeFileSync(targetPath, ...args);
        if (!mutated && String(targetPath).includes("ospec-repair")) {
          mutated = true;
          target.writeFileSync(configPath, concurrent);
        }
        return result;
      };
    },
  });
  let validations = 0;

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    fs: concurrentFs,
    runCodexCommand() { validations += 1; return { status: 0, stdout: "[]", stderr: "" }; },
  }), /changed concurrently/i);

  assert.equal(validations, 0);
  assert.equal(fs.readFileSync(configPath, "utf8"), concurrent);
  assert.ok(fs.readdirSync(root).some(name => name.includes("ospec-backup")));
  assert.ok(!fs.readdirSync(root).some(name => name.includes("ospec-repair")));
});

test("repairCodexConfig detects bytes changed inside the config-to-recovery rename and restores them without publishing", (t) => {
  const root = makeTempDir(t, "codex-config-rename-race-");
  const configPath = path.join(root, "config.toml");
  const initial = Buffer.from('service_tier = "default"\nmodel = "gpt-5"\n');
  const concurrent = Buffer.from('service_tier = "flex"\nmodel = "gpt-5.2"\n');
  fs.writeFileSync(configPath, initial);
  let injected = false;
  let validations = 0;
  const concurrentFs = new Proxy(fs, {
    get(target, property) {
      if (property !== "renameSync") return target[property];
      return (from, to) => {
        if (!injected && from === configPath && String(to).includes("ospec-original")) {
          injected = true;
          target.writeFileSync(configPath, concurrent);
        }
        return target.renameSync(from, to);
      };
    },
  });

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    fs: concurrentFs,
    runCodexCommand() { validations += 1; return { status: 0, stdout: "[]", stderr: "" }; },
  }), /changed concurrently/i);

  assert.equal(injected, true);
  assert.equal(validations, 0);
  assert.deepEqual(fs.readFileSync(configPath), concurrent);
  assert.ok(fs.readdirSync(root).some(name => name.includes("ospec-backup")));
});

test("repairCodexConfig preserves a concurrent config written inside the publish rename", (t) => {
  const root = makeTempDir(t, "codex-config-publish-race-");
  const configPath = path.join(root, "config.toml");
  const initial = Buffer.from('service_tier = "default"\nmodel = "gpt-5"\n');
  const concurrent = Buffer.from('service_tier = "flex"\nmodel = "gpt-5.2"\n');
  fs.writeFileSync(configPath, initial);
  let injected = false;
  let validations = 0;
  const concurrentFs = new Proxy(fs, {
    get(target, property) {
      if (property !== "renameSync") return target[property];
      return (from, to) => {
        const result = target.renameSync(from, to);
        if (!injected && String(from).includes("ospec-repair") && to === configPath) {
          injected = true;
          target.writeFileSync(configPath, concurrent);
        }
        return result;
      };
    },
  });

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    fs: concurrentFs,
    runCodexCommand() { validations += 1; return { status: 0, stdout: "[]", stderr: "" }; },
  }), /changed concurrently|evidence retained/i);

  assert.equal(injected, true);
  assert.equal(validations, 0);
  assert.deepEqual(fs.readFileSync(configPath), concurrent);
  const evidence = fs.readdirSync(root);
  assert.ok(evidence.some(name => name.includes("ospec-backup")));
  assert.ok(evidence.some(name => name.includes("ospec-original")));
});

test("repairCodexConfig preserves a concurrent config written while Codex validates", (t) => {
  const root = makeTempDir(t, "codex-config-validation-race-");
  const configPath = path.join(root, "config.toml");
  const initial = Buffer.from('service_tier = "default"\nmodel = "gpt-5"\n');
  const concurrent = Buffer.from('service_tier = "flex"\nmodel = "gpt-5.2"\n');
  fs.writeFileSync(configPath, initial);

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    runCodexCommand() {
      fs.writeFileSync(configPath, concurrent);
      return { status: 0, stdout: "[]", stderr: "" };
    },
  }), /changed concurrently|evidence retained/i);

  assert.deepEqual(fs.readFileSync(configPath), concurrent);
  const evidence = fs.readdirSync(root);
  assert.ok(evidence.some(name => name.includes("ospec-backup")));
  assert.ok(evidence.some(name => name.includes("ospec-original")));
});

test("repairCodexConfig detects a same-byte config replacement by filesystem identity", (t) => {
  const root = makeTempDir(t, "codex-config-identity-race-");
  const configPath = path.join(root, "config.toml");
  const replacementPath = path.join(root, "concurrent-replacement.toml");
  const initial = Buffer.from('service_tier = "default"\nmodel = "gpt-5"\n');
  const transformed = Buffer.from('model = "gpt-5"\n');
  fs.writeFileSync(configPath, initial);

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    runCodexCommand() {
      fs.writeFileSync(replacementPath, transformed);
      fs.rmSync(configPath);
      fs.renameSync(replacementPath, configPath);
      return { status: 0, stdout: "[]", stderr: "" };
    },
  }), /changed concurrently|evidence retained/i);

  assert.deepEqual(fs.readFileSync(configPath), transformed);
  const evidence = fs.readdirSync(root);
  assert.ok(evidence.some(name => name.includes("ospec-backup")));
  assert.ok(evidence.some(name => name.includes("ospec-original")));
});

test("repairCodexConfig never deletes a recovery changed while Codex validates", (t) => {
  const root = makeTempDir(t, "codex-config-recovery-race-");
  const configPath = path.join(root, "config.toml");
  const initial = Buffer.from('service_tier = "default"\nmodel = "gpt-5"\n');
  const concurrent = Buffer.from('service_tier = "flex"\nmodel = "gpt-5.2"\n');
  fs.writeFileSync(configPath, initial);

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    runCodexCommand() {
      const recoveryName = fs.readdirSync(root).find(name => name.includes("ospec-original"));
      assert.ok(recoveryName);
      fs.writeFileSync(path.join(root, recoveryName), concurrent);
      return { status: 0, stdout: "[]", stderr: "" };
    },
  }), /changed concurrently/i);

  assert.deepEqual(fs.readFileSync(configPath), concurrent);
  assert.ok(fs.readdirSync(root).some(name => name.includes("ospec-backup")));
});

test("repairCodexConfig retains both backup and recovery evidence when rollback itself cannot rename", (t) => {
  const root = makeTempDir(t, "codex-config-retained-evidence-");
  const configPath = path.join(root, "config.toml");
  const before = Buffer.from('service_tier = "default"\nmodel = "gpt-5"\n');
  fs.writeFileSync(configPath, before);
  let restoreAttempts = 0;
  const delays = [];
  const failingFs = new Proxy(fs, {
    get(target, property) {
      if (property !== "renameSync") return target[property];
      return (from, to) => {
        if (String(from).includes("ospec-original") && to === configPath) {
          restoreAttempts += 1;
          const error = new Error("injected restore rename failure"); error.code = "EBUSY"; throw error;
        }
        return target.renameSync(from, to);
      };
    },
  });

  assert.throws(() => repairCodexConfig(configPath, "codex", {
    fs: failingFs,
    retryOptions: { sleep: delay => delays.push(delay) },
    runCodexCommand() { return { status: 1, stdout: "", stderr: "invalid config" }; },
  }), error => error instanceof AggregateError && /recovery evidence retained/i.test(error.message));

  assert.equal(restoreAttempts, 4);
  assert.deepEqual(delays, [10, 20, 30]);
  const evidence = fs.readdirSync(root);
  assert.ok(evidence.some(name => name.includes("ospec-backup")));
  assert.ok(evidence.some(name => name.includes("ospec-original")));
  assert.ok(!fs.existsSync(configPath));
});

test("findCodexBin returns the first working codex executable", () => {
  const calls = [];
  const bin = findCodexBin({
    resolveBinFromPath(binName) {
      return `C:\\path\\to\\safe\\bin\\${binName}.cmd`;
    },
    spawnSync(command) {
      calls.push(command);
      return { error: undefined };
    },
  });

  assert.equal(bin, "C:\\path\\to\\safe\\bin\\codex.cmd");
  assert.deepEqual(calls, ["C:\\path\\to\\safe\\bin\\codex.cmd"]);
});

test("copyCodexAgents copies only TOML agents and preserves unrelated files", (t) => {
  const sourceDir = makeTempDir(t, "codex-source-");
  const destDir = makeTempDir(t, "codex-dest-");
  writeGeneratedCodexTree(sourceDir);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, "notes.txt"), "keep\n");

  copyCodexAgents(sourceDir, destDir);

  assert.ok(fs.existsSync(path.join(destDir, "apply.toml")));
  assert.ok(fs.existsSync(path.join(destDir, "verify.toml")));
  assert.ok(!fs.existsSync(path.join(destDir, "README.md")));
  assert.equal(fs.readFileSync(path.join(destDir, "notes.txt"), "utf8"), "keep\n");
});

test("global native runtime installs hooks and keeps skills outside the runtime", (t) => {
  const outDir = makeTempDir(t, "codex-runtime-source-");
  const codexRoot = makeTempDir(t, "codex-runtime-dest-");
  writeGeneratedCodexTree(outDir);
  fs.writeFileSync(
    path.join(codexRoot, "hooks.json"),
    JSON.stringify({ hooks: { Stop: [{ matcher: "^Bash$", hooks: [{ type: "command", command: "user-hook" }] }] } }),
  );

  const runtimeDir = path.join(codexRoot, "ospec-workflow");
  const skillsRoot = path.join(codexRoot, "..", ".agents", "skills");
  copyCodexRuntime(outDir, runtimeDir);
  syncCodexSkills(outDir, skillsRoot);
  installCodexHooks(outDir, codexRoot, runtimeDir);

  const installed = JSON.parse(fs.readFileSync(path.join(codexRoot, "hooks.json"), "utf8"));
  assert.equal(installed.hooks.Stop[0].hooks[0].command, "user-hook");
  assert.match(installed.hooks.SessionStart[0].hooks[0].command, /ospec-workflow[\\/]scripts[\\/]hooks/);
  assert.doesNotMatch(installed.hooks.SessionStart[0].hooks[0].command, /__OSPEC_RUNTIME__/);
  assert.ok(fs.existsSync(path.join(runtimeDir, "scripts", "hooks", "session-start.js")));
  assert.ok(!fs.existsSync(path.join(runtimeDir, "skills")));
  assert.equal(fs.readFileSync(path.join(skillsRoot, "apply", "SKILL.md"), "utf8"), "# Apply\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "verify", "SKILL.md"), "utf8"), "# Verify\n");
  assert.ok(fs.existsSync(path.join(skillsRoot, "_shared", "shared.md")));
  assert.equal(fs.readFileSync(path.join(skillsRoot, "standalone-tool", "SKILL.md"), "utf8"), "# Standalone\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "standalone-tool", "references", "nested.txt"), "utf8"), "nested\n");
});

test("copyCodexRuntime refreshes changed runtime bytes and is idempotent", (t) => {
  const outDir = makeTempDir(t, "codex-runtime-sync-source-");
  const runtimeDir = makeTempDir(t, "codex-runtime-sync-dest-");
  const sourceHook = path.join(outDir, "scripts", "hooks", "subagent-stop.js");
  const installedHook = path.join(runtimeDir, "scripts", "hooks", "subagent-stop.js");
  fs.mkdirSync(path.dirname(sourceHook), { recursive: true });
  fs.writeFileSync(sourceHook, "runtime-v1\n");

  const first = copyCodexRuntime(outDir, runtimeDir);
  fs.writeFileSync(sourceHook, "runtime-v2\n");
  const second = copyCodexRuntime(outDir, runtimeDir);
  const third = copyCodexRuntime(outDir, runtimeDir);

  assert.equal(fs.readFileSync(installedHook, "utf8"), "runtime-v2\n");
  assert.ok(first.updated.some((file) => file.endsWith(path.join("scripts", "hooks", "subagent-stop.js"))));
  assert.ok(second.updated.some((file) => file.endsWith(path.join("scripts", "hooks", "subagent-stop.js"))));
  assert.equal(third.updated.length, 0);
  assert.ok(third.unchanged.some((file) => file.endsWith(path.join("scripts", "hooks", "subagent-stop.js"))));
});

test("copyCodexRuntime is a no-op when the generated runtime is absent", (t) => {
  const outDir = makeTempDir(t, "codex-runtime-absent-source-");
  const runtimeDir = makeTempDir(t, "codex-runtime-absent-dest-");

  assert.deepEqual(copyCodexRuntime(outDir, runtimeDir, { fs }), { updated: [], unchanged: [] });
  assert.deepEqual(fs.readdirSync(runtimeDir), []);
});

test("syncCodexSkills installs every generated skill recursively, preserves extras, and is idempotent", (t) => {
  const outDir = makeTempDir(t, "codex-skills-source-");
  const skillsRoot = makeTempDir(t, "codex-skills-dest-");
  writeGeneratedCodexTree(outDir);
  fs.mkdirSync(path.join(skillsRoot, "apply"), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, "apply", "SKILL.md"), "old\n");
  fs.mkdirSync(path.join(skillsRoot, "user-extra"), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, "user-extra", "SKILL.md"), "keep\n");
  fs.mkdirSync(path.join(skillsRoot, "stale-ospec"), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, "stale-ospec", "SKILL.md"), "preserve-without-manifest\n");

  const first = syncCodexSkills(outDir, skillsRoot);
  const second = syncCodexSkills(outDir, skillsRoot);

  assert.equal(fs.readFileSync(path.join(skillsRoot, "apply", "SKILL.md"), "utf8"), "# Apply\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "standalone-tool", "SKILL.md"), "utf8"), "# Standalone\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "standalone-tool", "references", "nested.txt"), "utf8"), "nested\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "user-extra", "SKILL.md"), "utf8"), "keep\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "stale-ospec", "SKILL.md"), "utf8"), "preserve-without-manifest\n");
  assert.ok(first.updated.some((file) => file.endsWith(path.join("apply", "SKILL.md"))));
  assert.equal(second.updated.length, 0);
});

test("syncCodexSkills fails closed before a nested destination symlink can escape", (t) => {
  const outDir = makeTempDir(t, "codex-skills-symlink-source-");
  const homeDir = makeTempDir(t, "codex-skills-symlink-home-");
  const outsideDir = makeTempDir(t, "codex-skills-symlink-outside-");
  const skillsRoot = path.join(homeDir, ".agents", "skills");
  writeGeneratedCodexTree(outDir);
  fs.mkdirSync(skillsRoot, { recursive: true });

  try {
    fs.symlinkSync(outsideDir, path.join(skillsRoot, "standalone-tool"), "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => syncCodexSkills(outDir, skillsRoot, { approvedRoot: homeDir }),
    /redirects through a symlinked or canonicalized path/i,
  );
  assert.ok(!fs.existsSync(path.join(outsideDir, "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(skillsRoot, "apply", "SKILL.md")), "preflight must prevent partial skill writes");
});

test("syncCodexSkills fails closed when the generated skills root is missing or redirected", (t) => {
  const outDir = makeTempDir(t, "codex-skills-invalid-source-");
  const skillsRoot = makeTempDir(t, "codex-skills-invalid-dest-");

  assert.throws(
    () => syncCodexSkills(outDir, skillsRoot, { fs }),
    /generated Codex skills root must be a real directory/i,
  );

  const outsideDir = makeTempDir(t, "codex-skills-source-outside-");
  fs.writeFileSync(path.join(outsideDir, "SKILL.md"), "outside\n");
  try {
    fs.symlinkSync(outsideDir, path.join(outDir, "skills"), "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => syncCodexSkills(outDir, skillsRoot, { fs }),
    /generated Codex skills root must be a real directory/i,
  );
  assert.deepEqual(fs.readdirSync(skillsRoot), []);
});

test("syncCodexSkills rejects non-file entries in the generated skill tree", (t) => {
  const outDir = makeTempDir(t, "codex-skills-special-source-");
  const skillsRoot = makeTempDir(t, "codex-skills-special-dest-");
  const outsideDir = makeTempDir(t, "codex-skills-special-outside-");
  fs.mkdirSync(path.join(outDir, "skills"), { recursive: true });
  try {
    fs.symlinkSync(outsideDir, path.join(outDir, "skills", "redirected"), "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => syncCodexSkills(outDir, skillsRoot, { fs }),
    /must be a regular file or directory/i,
  );
  assert.deepEqual(fs.readdirSync(skillsRoot), []);
});



test("resolveCodexInvocation runs the npm Windows shim through node without a shell", (t) => {
  const root = makeTempDir(t, "codex-npm-shim-");
  const shim = path.join(root, "codex.cmd");
  const cli = path.join(root, "node_modules", "@openai", "codex", "bin", "codex.js");
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(shim, "@echo off\n");
  fs.writeFileSync(cli, "// fixture\n");

  const invocation = resolveCodexInvocation(shim, ["mcp", "list", "--json"], {
    platform: "win32",
    execPath: "C:\\node\\node.exe",
  });

  assert.deepEqual(invocation, {
    command: "C:\\node\\node.exe",
    args: [cli, "mcp", "list", "--json"],
  });
});

test("ensureCodexMcps skips equivalent pre-existing servers and adds only missing definitions", () => {
  const calls = [];
  const stdout = [];
  const definitions = [
    { name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"] },
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
  ];

  const exitCode = ensureCodexMcps("codex", definitions, {
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write() {} },
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      if (args.join(" ") === "mcp list --json") {
        return {
          status: 0,
          stdout: JSON.stringify([
            {
              name: "my-existing-doc-converter",
              transport: {
                type: "stdio",
                command: "uvx",
                args: ["markitdown-mcp@0.0.1a4"],
              },
            },
          ]),
          stderr: "",
        };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    ["codex", "mcp", "list", "--json"],
    ["codex", "mcp", "add", "context7", "--", "npx", "@upstash/context7-mcp@1.0.31"],
  ]);
  assert.match(stdout.join(""), /reusing existing MCP.*my-existing-doc-converter/i);
});

test("readCodexMcpDefinitions normalizes legacy slash-qualified names for Codex", (t) => {
  const sourceDir = makeTempDir(t, "codex-legacy-mcp-");
  fs.writeFileSync(
    path.join(sourceDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "io.github.upstash/context7": {
          command: "npx",
          args: ["@upstash/context7-mcp@1.0.31"],
        },
        "microsoft/markitdown": {
          command: "uvx",
          args: ["markitdown-mcp@0.0.1a4"],
        },
      },
    }),
  );

  assert.deepEqual(readCodexMcpDefinitions(sourceDir), [
    { name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"], env: {} },
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"], env: {} },
  ]);
});

test("readCodexMcpDefinitions rejects malformed MCP definitions without echoing untrusted values", (t) => {
  const sourceDir = makeTempDir(t, "codex-untrusted-mcp-");
  const cases = [
    { "bad-command": { command: 123, args: ["secret-arg"] } },
    { "bad-entry": "string-entry" },
  ];

  for (const mcpServers of cases) {
    fs.writeFileSync(path.join(sourceDir, ".mcp.json"), JSON.stringify({ mcpServers }));
    assert.throws(
      () => readCodexMcpDefinitions(sourceDir),
      (error) => {
        assert.match(error.message, /unsupported Codex MCP definition/i);
        assert.doesNotMatch(error.message, /secret/i);
        return true;
      },
    );
  }
});

test("ensureCodexMcps is idempotent when all required identities already exist", () => {
  const calls = [];
  const definitions = [
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
  ];

  const exitCode = ensureCodexMcps("codex", definitions, {
    stdout: { write() {} },
    stderr: { write() {} },
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      return {
        status: 0,
        stdout: JSON.stringify([
          {
            name: "markitdown",
            transport: { type: "stdio", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
          },
        ]),
        stderr: "",
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [["codex", "mcp", "list", "--json"]]);
});

test("ensureCodexMcps removes only additions from the current attempt when a later add fails", () => {
  const calls = [];
  const definitions = [
    { name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"] },
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
  ];
  const exitCode = ensureCodexMcps("codex", definitions, {
    stdout: { write() {} },
    stderr: { write() {} },
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      if (args.join(" ") === "mcp list --json") {
        return {
          status: 0,
          stdout: JSON.stringify([{
            name: "user-owned",
            transport: { type: "stdio", command: "user-command", args: [] },
          }]),
          stderr: "",
        };
      }
      if (args.slice(0, 3).join(" ") === "mcp add markitdown") {
        return { status: 9, stdout: "", stderr: "add failed\n" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(exitCode, 9);
  assert.deepEqual(calls, [
    ["codex", "mcp", "list", "--json"],
    ["codex", "mcp", "add", "context7", "--", "npx", "@upstash/context7-mcp@1.0.31"],
    ["codex", "mcp", "add", "markitdown", "--", "uvx", "markitdown-mcp@0.0.1a4"],
    ["codex", "mcp", "remove", "context7"],
  ]);
  assert.ok(!calls.some((call) => call.slice(1).join(" ") === "mcp remove user-owned"));
});

test("ensureCodexMcps compensates prior additions when a later CLI invocation throws", () => {
  const calls = [];
  assert.equal(ensureCodexMcps("codex", [
    { name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"] },
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
  ], {
    stdout: { write() {} },
    stderr: { write() {} },
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      if (args.join(" ") === "mcp list --json") return { status: 0, stdout: "[]", stderr: "" };
      if (args.slice(0, 3).join(" ") === "mcp add markitdown") throw new Error("runner failed");
      return { status: 0, stdout: "", stderr: "" };
    },
  }), 1);
  assert.deepEqual(calls.at(-1), ["codex", "mcp", "remove", "context7"]);
});

test("ensureCodexMcps rejects invalid direct definitions before invoking the CLI", () => {
  const stderr = [];
  let calls = 0;
  const exitCode = ensureCodexMcps("codex", [{
    name: "invalid-name",
    command: 123,
    args: "invalid-arg",
  }], {
    stderr: { write: (chunk) => stderr.push(chunk) },
    runCodexCommand() {
      calls += 1;
      return { status: 0, stdout: "[]", stderr: "" };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(calls, 0);
  assert.match(stderr.join(""), /unsupported Codex MCP definition/i);
});

test("ensureCodexMcps fails closed on unusable list responses", () => {
  const definition = [{ name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"] }];
  const stderr = [];
  const responses = [
    { status: null, stdout: "[]", stderr: "list failed\n" },
    { status: 0, stdout: "not-json", stderr: "" },
    { status: 0, stdout: "{}", stderr: "" },
  ];

  assert.equal(ensureCodexMcps("codex", [], { runCodexCommand() { throw new Error("must not run"); } }), 0);
  for (const response of responses) {
    assert.equal(ensureCodexMcps("codex", definition, {
      stderr: { write: (chunk) => stderr.push(chunk) },
      stdout: { write() {} },
      runCodexCommand: () => response,
    }), 1);
  }
  assert.match(stderr.join(""), /failed while listing|invalid JSON|unexpected JSON shape/);
});

test("installCodexHooks rejects malformed generated and existing hook maps without overwriting", (t) => {
  const outDir = makeTempDir(t, "codex-hooks-invalid-source-");
  const codexRoot = makeTempDir(t, "codex-hooks-invalid-dest-");
  const runtimeDir = path.join(codexRoot, "ospec-workflow");

  assert.equal(installCodexHooks(outDir, codexRoot, runtimeDir, { fs }), undefined);
  fs.writeFileSync(path.join(outDir, "hooks.json"), "{}\n");
  assert.throws(
    () => installCodexHooks(outDir, codexRoot, runtimeDir, { fs }),
    /generated Codex hooks\.json must contain a hooks object/i,
  );

  fs.writeFileSync(path.join(outDir, "hooks.json"), JSON.stringify({ hooks: { Stop: [] } }));
  fs.writeFileSync(path.join(codexRoot, "hooks.json"), JSON.stringify({ hooks: [] }));
  const before = fs.readFileSync(path.join(codexRoot, "hooks.json"), "utf8");
  assert.throws(
    () => installCodexHooks(outDir, codexRoot, runtimeDir, { fs }),
    /existing Codex hooks\.json must contain a hooks object/i,
  );
  assert.equal(fs.readFileSync(path.join(codexRoot, "hooks.json"), "utf8"), before);
});

test("main falls back to manual Codex commands when the CLI is unavailable", (t) => {
  const sourceDir = makeTempDir(t, "codex-main-source-");
  const homeDir = makeTempDir(t, "codex-home-");
  const stdout = [];
  const stderr = [];

  fs.writeFileSync(
    path.join(sourceDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        markitdown: { command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
      },
    }),
  );

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir, validate }) {
      assert.equal(validate, true);
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => null,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.join(""), "");
  assert.ok(fs.existsSync(path.join(homeDir, ".codex", "agents", "apply.toml")));
  assert.ok(fs.existsSync(path.join(homeDir, ".codex", "AGENTS.md")));
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "config.toml")));
  assert.match(stdout.join(""), /codex mcp add/i);
});

test("main installs repo-local agents without changing an existing config or copying the plugin bundle", (t) => {
  const sourceDir = makeTempDir(t, "codex-repo-source-");
  const destRepo = makeTempDir(t, "codex-repo-dest-");
  const stdout = [];
  fs.writeFileSync(path.join(destRepo, "README.md"), "keep\n");
  fs.mkdirSync(path.join(destRepo, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(destRepo, ".codex", "config.toml"), "model = \"user-choice\"\n");

  const exitCode = main([destRepo, "--no-validate"], {
    cwd: sourceDir,
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write() {} },
    runConfigure({ outDir, validate }) {
      assert.equal(validate, false);
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand() {
      throw new Error("repo install must not register marketplace commands");
    },
  });

  assert.equal(exitCode, 0);
  assert.ok(fs.existsSync(path.join(destRepo, ".codex", "agents", "apply.toml")));
  assert.ok(fs.existsSync(path.join(destRepo, "AGENTS.md")));
  assert.equal(fs.readFileSync(path.join(destRepo, ".codex", "config.toml"), "utf8"), "model = \"user-choice\"\n");
  assert.ok(!fs.existsSync(path.join(destRepo, ".codex-plugin", "plugin.json")));
  assert.equal(fs.readFileSync(path.join(destRepo, "README.md"), "utf8"), "keep\n");
  assert.match(stdout.join(""), /Done\./);
});

test("main dry-run previews actions without writing files or invoking codex", (t) => {
  const sourceDir = makeTempDir(t, "codex-dry-source-");
  const homeDir = makeTempDir(t, "codex-dry-home-");
  let codexInvocations = 0;

  const exitCode = main(["--dry-run"], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write() {} },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand() {
      codexInvocations += 1;
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(codexInvocations, 0);
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "agents", "apply.toml")));
});

test("main dry-run with --repair-config previews the global repair without writing or validating", (t) => {
  const sourceDir = makeTempDir(t, "codex-repair-dry-source-");
  const homeDir = makeTempDir(t, "codex-repair-dry-home-");
  const configPath = path.join(homeDir, ".codex", "config.toml");
  const stdout = [];
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, 'service_tier = "default"\n');
  const before = snapshotTree(homeDir);
  let codexInvocations = 0;
  let builds = 0;

  const exitCode = main(["--dry-run", "--repair-config"], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write: chunk => stdout.push(chunk) },
    stderr: { write() {} },
    runConfigure() { builds += 1; throw new Error("preview must not build or publish dist"); },
    findCodexBin: () => "codex",
    runCodexCommand() { codexInvocations += 1; return { status: 0, stdout: "[]", stderr: "" }; },
  });

  assert.equal(exitCode, 0);
  assert.equal(builds, 0);
  assert.equal(codexInvocations, 0);
  assert.deepEqual(snapshotTree(homeDir), before);
  assert.equal(fs.readFileSync(configPath, "utf8"), 'service_tier = "default"\n');
  assert.match(stdout.join(""), /would remove.*service_tier/i);
});

test("main global --repair-config repairs before installation and retains user-owned auth", (t) => {
  const sourceDir = makeTempDir(t, "codex-repair-main-source-");
  const homeDir = makeTempDir(t, "codex-repair-main-home-");
  const codexRoot = path.join(homeDir, ".codex");
  const configPath = path.join(codexRoot, "config.toml");
  const authPath = path.join(codexRoot, "auth.json");
  fs.mkdirSync(codexRoot, { recursive: true });
  fs.writeFileSync(configPath, 'service_tier = "default"\nmodel = "gpt-5"\n');
  fs.writeFileSync(authPath, '{"token":"user-owned"}\n');
  const calls = [];
  const stdout = [];

  const exitCode = main(["--repair-config"], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write: chunk => stdout.push(chunk) },
    stderr: { write() {} },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      return { status: 0, stdout: "[]", stderr: "" };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(fs.readFileSync(configPath, "utf8"), 'model = "gpt-5"\n');
  assert.equal(fs.readFileSync(authPath, "utf8"), '{"token":"user-owned"}\n');
  assert.ok(fs.readdirSync(codexRoot).some(name => name.startsWith("config.toml.ospec-backup")));
  assert.deepEqual(calls, [["codex", "mcp", "list", "--json"]]);
  assert.match(stdout.join(""), /backup retained/i);
});

test("main rejects --repair-config for repo-local installation before any global or repo mutation", (t) => {
  const sourceDir = makeTempDir(t, "codex-repair-repo-source-");
  const destRepo = makeTempDir(t, "codex-repair-repo-dest-");
  const homeDir = makeTempDir(t, "codex-repair-repo-home-");
  const globalConfig = path.join(homeDir, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(globalConfig), { recursive: true });
  fs.writeFileSync(globalConfig, 'service_tier = "default"\n');
  let builds = 0;
  const stderr = [];

  const exitCode = main([destRepo, "--repair-config"], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write: chunk => stderr.push(chunk) },
    runConfigure() { builds += 1; throw new Error("must not build"); },
  });

  assert.equal(exitCode, 2);
  assert.equal(builds, 0);
  assert.equal(fs.readFileSync(globalConfig, "utf8"), 'service_tier = "default"\n');
  assert.ok(!fs.existsSync(path.join(destRepo, ".codex")));
  assert.match(stderr.join(""), /only.*global/i);
});

test("main advises explicit --repair-config when Codex rejects legacy service_tier without mutating config, auth, or MCPs", (t) => {
  const sourceDir = makeTempDir(t, "codex-repair-advice-source-");
  const homeDir = makeTempDir(t, "codex-repair-advice-home-");
  const codexRoot = path.join(homeDir, ".codex");
  const configPath = path.join(codexRoot, "config.toml");
  const authPath = path.join(codexRoot, "auth.json");
  fs.mkdirSync(codexRoot, { recursive: true });
  fs.writeFileSync(configPath, 'service_tier = "default"\n');
  fs.writeFileSync(authPath, '{"token":"user-owned"}\n');
  fs.writeFileSync(path.join(sourceDir, ".mcp.json"), JSON.stringify({
    mcpServers: { context7: { command: "npx", args: ["context7"] } },
  }));
  const stderr = [];
  const calls = [];

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write: chunk => stderr.push(chunk) },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      return {
        status: 1,
        stdout: "",
        stderr: 'unknown variant `default`, expected `fast` or `flex` in `service_tier`\n',
      };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [["codex", "mcp", "list", "--json"]]);
  assert.equal(fs.readFileSync(configPath, "utf8"), 'service_tier = "default"\n');
  assert.equal(fs.readFileSync(authPath, "utf8"), '{"token":"user-owned"}\n');
  assert.match(stderr.join(""), /npm run setup:codex:repair/i);
  assert.doesNotMatch(stderr.join(""), /npm run setup:codex -- --repair-config/i);
});

test("main rejects incomplete --source usage before build side effects", () => {
  const stderr = [];
  let runConfigureCalls = 0;

  const exitCode = main(["--source"], {
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure() {
      runConfigureCalls += 1;
      throw new Error("should not build");
    },
  });

  assert.equal(exitCode, 2);
  assert.equal(runConfigureCalls, 0);
  assert.match(stderr.join(""), /usage: install-codex/i);
});

test("main rejects invalid repo destinations before build side effects", (t) => {
  const sourceDir = makeTempDir(t, "codex-invalid-dest-source-");
  const missingRepo = path.join(sourceDir, "..", "missing-repo");
  const stderr = [];
  let runConfigureCalls = 0;

  const exitCode = main([missingRepo], {
    cwd: sourceDir,
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure() {
      runConfigureCalls += 1;
      throw new Error("should not build");
    },
  });

  assert.equal(exitCode, 2);
  assert.equal(runConfigureCalls, 0);
  assert.match(stderr.join(""), /destination is not an existing directory/i);
});



test("main rejects redirected global .codex roots before writing managed files", (t) => {
  const sourceDir = makeTempDir(t, "codex-global-link-source-");
  const homeDir = makeTempDir(t, "codex-global-link-home-");
  const redirectDir = makeTempDir(t, "codex-global-link-redirect-");
  const codexRoot = path.join(homeDir, ".codex");
  const stderr = [];

  try {
    fs.symlinkSync(redirectDir, codexRoot, "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => null,
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /symlink|canonical|redirect/i);
  assert.deepEqual(fs.readdirSync(redirectDir), []);
});

test("main rejects redirected repo-local .codex roots before writing managed files", (t) => {
  const sourceDir = makeTempDir(t, "codex-repo-link-source-");
  const destRepo = makeTempDir(t, "codex-repo-link-dest-");
  const redirectDir = makeTempDir(t, "codex-repo-link-redirect-");
  const stderr = [];
  const codexRoot = path.join(destRepo, ".codex");

  try {
    fs.symlinkSync(redirectDir, codexRoot, "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  const exitCode = main([destRepo], {
    cwd: sourceDir,
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /symlink|canonical|redirect/i);
  assert.deepEqual(fs.readdirSync(redirectDir), []);
});

test("package.json exposes Codex build and install scripts", () => {
  const pkg = JSON.parse(readRepoFile("package.json"));

  assert.equal(pkg.scripts["build:codex"], "node scripts/configure/cli.js --target codex --out dist/codex");
  assert.equal(pkg.scripts["setup:codex"], "node scripts/configure/install-codex.js");
  assert.equal(pkg.scripts["setup:codex:repair"], "node scripts/configure/install-codex.js --repair-config");
  assert.equal(pkg.scripts["install:codex"], "node scripts/configure/install-codex.js");
});

test("README documents the native global Codex installation", () => {
  const readme = readRepoFile("README.md");

  assert.match(readme, /`codex` \|/);
  assert.match(readme, /npm run setup:codex/);
  assert.match(readme, /npm run install:codex --/);
  assert.match(readme, /hooks\.json/);
  assert.match(readme, /ospec-workflow/);
  assert.doesNotMatch(readme, /codex plugin marketplace add/i);
  assert.doesNotMatch(readme, /fusiona `.codex\/config\.toml`/);
  assert.match(readme, /claves no compatibles|incompatible keys/i);
  assert.match(readme, /--repair-config/i);
  assert.match(readme, /npm run setup:codex:repair/i);
  assert.doesNotMatch(readme, /npm run setup:codex -- --repair-config/i);
  assert.match(readme, /backup/i);
  assert.match(readme, /opt-in|explícit/i);
});

test("plugin-installation guide documents native global Codex hooks and runtime", () => {
  const doc = readRepoFile("docs", "plugin-installation.md");

  assert.match(doc, /Instalación global nativa|Native global installation/i);
  assert.match(doc, /hooks\.json/);
  assert.match(doc, /ospec-workflow/);
  assert.doesNotMatch(doc, /fusiona.*\.codex\/config\.toml/i);
  assert.match(doc, /claves no compatibles|unsupported keys/i);
  assert.match(doc, /--repair-config/i);
  assert.match(doc, /npm run setup:codex:repair/i);
  assert.doesNotMatch(doc, /npm run setup:codex -- --repair-config/i);
  assert.match(doc, /backup/i);
  assert.match(doc, /rollback|rolls back|restaur/i);
});

test("Codex maintenance guide documents scoped opt-in config repair", () => {
  const doc = readRepoFile("docs", "codex", "README.md");

  assert.match(doc, /--repair-config/i);
  assert.match(doc, /npm run setup:codex:repair/i);
  assert.doesNotMatch(doc, /npm run setup:codex -- --repair-config/i);
  assert.match(doc, /service_tier = ["`]*default/i);
  assert.match(doc, /backup/i);
  assert.match(doc, /no.*auth\.json|auth\.json.*no/i);
  assert.match(doc, /local.*no.*config|config.*local.*no/i);
});

test("install baseline specifies the native global Codex contract", () => {
  const spec = readRepoFile("openspec", "specs", "install", "spec.md");

  assert.match(spec, /hooks\.json/);
  assert.match(spec, /without a plugin or marketplace/i);
  assert.match(spec, /MUST NOT modify the destination project's `\.codex\/config\.toml`/i);
  assert.match(spec, /codex mcp add/i);
  assert.match(spec, /command plus ordered arguments/i);
  assert.match(spec, /runtime placeholder/i);
});

test("assertManagedPathSafe: accepts valid paths inside the root", (t) => {
  const root = makeTempDir(t, "codex-safe-root-");
  const managed = path.join(root, "agents", "apply.toml");
  fs.mkdirSync(path.dirname(managed), { recursive: true });
  fs.writeFileSync(managed, "");

  assert.doesNotThrow(() => assertManagedPathSafe(root, managed));
});

test("assertManagedPathSafe: accepts a legitimate destination when an existing ancestor canonicalizes through an OS alias", () => {
  const lexicalParent = path.resolve("virtual-volume", "tmp");
  const canonicalParent = path.resolve("canonical-volume", "tmp");
  const root = path.join(lexicalParent, "codex-root");
  const managedParent = path.join(root, "skills", "apply");
  const managed = path.join(managedParent, "SKILL.md");
  const missing = () => {
    const error = new Error("missing fixture path");
    error.code = "ENOENT";
    throw error;
  };
  const fsWithAncestorAlias = {
    lstatSync: missing,
    realpathSync(target) {
      if (target === root) return missing();
      if (target === lexicalParent) return canonicalParent;
      if (target === managedParent) {
        return path.join(canonicalParent, "codex-root", "skills", "apply");
      }
      throw new Error(`unexpected fixture path: ${target}`);
    },
  };

  assert.doesNotThrow(() =>
    assertManagedPathSafe(root, managed, "Codex skill destination", fsWithAncestorAlias),
  );
});

test("assertManagedPathSafe: rejects when managedPath itself is a symlink", (t) => {
  const root = makeTempDir(t, "codex-symlink-root-");
  const managed = path.join(root, "config.toml");
  const linkDest = path.join(root, "target.toml");
  fs.writeFileSync(linkDest, "");

  try {
    fs.symlinkSync(linkDest, managed, "file");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => assertManagedPathSafe(root, managed),
    /redirects through a symlinked or canonicalized path/i
  );
});

test("assertManagedPathSafe: rejects when rootPath is a symlink", (t) => {
  const realRoot = makeTempDir(t, "codex-real-root-");
  const linkRoot = path.join(os.tmpdir(), `codex-link-root-${Date.now()}`);
  const managed = path.join(linkRoot, "config.toml");

  try {
    fs.symlinkSync(realRoot, linkRoot, "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  t.after(() => {
    try {
      fs.unlinkSync(linkRoot);
    } catch {}
  });

  assert.throws(
    () => assertManagedPathSafe(linkRoot, managed),
    /redirects through a symlinked or canonicalized root/i
  );
});

test("assertManagedPathSafe: rejects when path escapes the root via traversal", (t) => {
  const root = makeTempDir(t, "codex-traversal-root-");
  const managedOutside = path.join(root, "..", "escaped.toml");

  assert.throws(
    () => assertManagedPathSafe(root, managedOutside),
    /escapes the approved Codex root/i
  );
});

test("main repo install is idempotent: re-running twice converges without duplicating TOML entries or touching config.toml", (t) => {
  const sourceDir = makeTempDir(t, "codex-idempotent-source-");
  const destRepo = makeTempDir(t, "codex-idempotent-dest-");
  fs.mkdirSync(path.join(destRepo, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(destRepo, ".codex", "config.toml"), "model = \"user-choice\"\n");

  const runOnce = () =>
    main([destRepo, "--no-validate"], {
      cwd: sourceDir,
      stdout: { write() {} },
      stderr: { write() {} },
      runConfigure({ outDir, validate }) {
        assert.equal(validate, false);
        writeGeneratedCodexTree(outDir);
        return { exitCode: 0, validation: null };
      },
      findCodexBin: () => "codex",
      runCodexCommand() {
        throw new Error("repo install must not register marketplace commands");
      },
    });

  const firstExit = runOnce();
  const agentsDir = path.join(destRepo, ".codex", "agents");
  const firstListing = fs.readdirSync(agentsDir).sort();
  const firstContent = fs.readFileSync(path.join(agentsDir, "apply.toml"), "utf8");

  const secondExit = runOnce();
  const secondListing = fs.readdirSync(agentsDir).sort();
  const secondContent = fs.readFileSync(path.join(agentsDir, "apply.toml"), "utf8");

  assert.equal(firstExit, 0);
  assert.equal(secondExit, 0);
  assert.deepEqual(secondListing, firstListing);
  assert.equal(secondContent, firstContent);
  assert.equal(
    fs.readFileSync(path.join(destRepo, ".codex", "config.toml"), "utf8"),
    "model = \"user-choice\"\n",
  );
  assert.ok(!fs.existsSync(path.join(destRepo, ".codex-plugin", "plugin.json")));
});

test("main global install is idempotent across the plugin channel and the agent channel independently", (t) => {
  const sourceDir = makeTempDir(t, "codex-idempotent-global-source-");
  const homeDir = makeTempDir(t, "codex-idempotent-global-home-");
  const codexCalls = [];
  const configuredMcps = [];
  fs.mkdirSync(path.join(homeDir, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".codex", "config.toml"), "model = \"user-choice\"\n");
  fs.writeFileSync(path.join(homeDir, ".codex", "auth.json"), "{\"token\":\"user-owned\"}\n");
  fs.mkdirSync(path.join(homeDir, ".agents", "skills", "user-extra"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".agents", "skills", "user-extra", "SKILL.md"), "keep\n");
  fs.writeFileSync(
    path.join(sourceDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        markitdown: { command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
      },
    }),
  );

  const runOnce = () =>
    main([], {
      cwd: sourceDir,
      homedir: () => homeDir,
      stdout: { write() {} },
      stderr: { write() {} },
      runConfigure({ outDir, validate }) {
        assert.equal(validate, true);
        writeGeneratedCodexTree(outDir);
        return { exitCode: 0, validation: null };
      },
      findCodexBin: () => "codex",
      runCodexCommand(bin, args) {
        codexCalls.push([bin, ...args]);
        if (args.join(" ") === "mcp list --json") {
          return { status: 0, stdout: JSON.stringify(configuredMcps), stderr: "" };
        }
        if (args.slice(0, 3).join(" ") === "mcp add markitdown") {
          configuredMcps.push({
            name: "markitdown",
            transport: { type: "stdio", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
          });
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });

  const firstExit = runOnce();
  const agentsDir = path.join(homeDir, ".codex", "agents");
  const firstAgents = fs.readdirSync(agentsDir).sort();
  const firstAgentMd = fs.readFileSync(path.join(homeDir, ".codex", "AGENTS.md"), "utf8");

  const secondExit = runOnce();
  const secondAgents = fs.readdirSync(agentsDir).sort();
  const secondAgentMd = fs.readFileSync(path.join(homeDir, ".codex", "AGENTS.md"), "utf8");

  assert.equal(firstExit, 0);
  assert.equal(secondExit, 0);
  assert.deepEqual(secondAgents, firstAgents);
  assert.equal(secondAgentMd, firstAgentMd);
  assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "config.toml"), "utf8"), "model = \"user-choice\"\n");
  assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "auth.json"), "utf8"), "{\"token\":\"user-owned\"}\n");
  assert.equal(fs.readFileSync(path.join(homeDir, ".agents", "skills", "user-extra", "SKILL.md"), "utf8"), "keep\n");
  assert.ok(fs.existsSync(path.join(homeDir, ".agents", "skills", "standalone-tool", "references", "nested.txt")));
  assert.equal(codexCalls.filter((call) => call.slice(1, 4).join(" ") === "mcp add markitdown").length, 1);
  assert.equal(codexCalls.filter((call) => call.slice(1).join(" ") === "mcp list --json").length, 2);
});

test("main rolls back managed filesystem bytes and modes after failures at every install stage", (t) => {
  const failures = [
    ["copyFileSync", /[\\/]\.codex[\\/]agents[\\/]apply\.toml$/],
    ["copyFileSync", /[\\/]\.codex[\\/]ospec-workflow[\\/]scripts[\\/]hooks[\\/]session-start\.js$/],
    ["copyFileSync", /[\\/]\.agents[\\/]skills[\\/]standalone-tool[\\/]SKILL\.md$/],
    ["writeFileSync", /[\\/]\.codex[\\/]hooks\.json$/],
    ["rmSync", /[\\/]\.codex[\\/]ospec-workflow[\\/]skills$/],
  ];

  for (const [method, pattern] of failures) {
    const sourceDir = makeTempDir(t, `codex-rollback-source-${method}-`);
    const homeDir = makeTempDir(t, `codex-rollback-home-${method}-`);
    fs.mkdirSync(path.join(homeDir, ".codex", "agents"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".codex", "ospec-workflow", "scripts", "hooks"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".codex", "ospec-workflow", "skills", "legacy"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".agents", "skills", "apply"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".agents", "skills", "user-extra"), { recursive: true });
    fs.writeFileSync(path.join(homeDir, ".codex", "AGENTS.md"), "old-agent\n");
    fs.writeFileSync(path.join(homeDir, ".codex", "agents", "apply.toml"), "old-apply\n");
    fs.chmodSync(path.join(homeDir, ".codex", "agents", "apply.toml"), 0o600);
    fs.writeFileSync(path.join(homeDir, ".codex", "ospec-workflow", "scripts", "hooks", "session-start.js"), "old-runtime\n");
    fs.writeFileSync(path.join(homeDir, ".codex", "ospec-workflow", "skills", "legacy", "SKILL.md"), "old-legacy\n");
    fs.writeFileSync(path.join(homeDir, ".agents", "skills", "apply", "SKILL.md"), "old-skill\n");
    fs.writeFileSync(path.join(homeDir, ".agents", "skills", "user-extra", "SKILL.md"), "keep-extra\n");
    fs.writeFileSync(path.join(homeDir, ".codex", "hooks.json"), JSON.stringify({ hooks: { Stop: [{ matcher: ".*", hooks: [{ command: "user-hook" }] }] } }));
    fs.writeFileSync(path.join(homeDir, ".codex", "config.toml"), "model = \"user-choice\"\n");
    fs.writeFileSync(path.join(homeDir, ".codex", "auth.json"), "{\"token\":\"user-owned\"}\n");
    const before = snapshotTree(homeDir);

    const runInstall = (fsImpl) => main([], {
      cwd: sourceDir,
      homedir: () => homeDir,
      fs: fsImpl,
      stdout: { write() {} },
      stderr: { write() {} },
      findCodexBin: () => null,
      runConfigure({ outDir }) {
        writeGeneratedCodexTree(outDir);
        return { exitCode: 0, validation: null };
      },
    });

    assert.equal(runInstall(failOnceFs(method, pattern)), 1, `${method} ${pattern} must fail the install`);
    assert.deepEqual(snapshotTree(homeDir), before, `${method} ${pattern} must restore the exact prior tree`);
    assert.equal(runInstall(fs), 0, `${method} ${pattern} must allow a clean second run`);
    assert.equal(fs.readFileSync(path.join(homeDir, ".agents", "skills", "user-extra", "SKILL.md"), "utf8"), "keep-extra\n");
    assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "config.toml"), "utf8"), "model = \"user-choice\"\n");
    assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "auth.json"), "utf8"), "{\"token\":\"user-owned\"}\n");
  }
});

test("main compensates allowlisted MCP additions when later install stages fail", (t) => {
  const failures = [
    ["lstatSync", /[\\/]\.codex[\\/]ospec-workflow$/],
    ["copyFileSync", /[\\/]\.codex[\\/]agents[\\/]apply\.toml$/],
    ["copyFileSync", /[\\/]\.codex[\\/]ospec-workflow[\\/]scripts[\\/]hooks[\\/]session-start\.js$/],
    ["copyFileSync", /[\\/]\.agents[\\/]skills[\\/]standalone-tool[\\/]SKILL\.md$/],
    ["writeFileSync", /[\\/]\.codex[\\/]hooks\.json$/],
  ];

  for (const [method, pattern] of failures) {
    const sourceDir = makeTempDir(t, `codex-mcp-file-rollback-source-${method}-`);
    const homeDir = makeTempDir(t, `codex-mcp-file-rollback-home-${method}-`);
    fs.writeFileSync(path.join(sourceDir, ".mcp.json"), JSON.stringify({
      mcpServers: {
        context7: { command: "npx", args: ["@upstash/context7-mcp@1.0.31"] },
        markitdown: { command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
      },
    }));
    const calls = [];
    const configured = [{
      name: "user-owned",
      transport: { type: "stdio", command: "user-command", args: [] },
    }];
    const stderr = [];

    const exitCode = main([], {
      cwd: sourceDir,
      homedir: () => homeDir,
      fs: failOnceFs(method, pattern),
      stdout: { write() {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      findCodexBin: () => "codex",
      runConfigure({ outDir }) {
        writeGeneratedCodexTree(outDir);
        return { exitCode: 0, validation: null };
      },
      runCodexCommand(bin, args) {
        calls.push([bin, ...args]);
        if (args.join(" ") === "mcp list --json") {
          return { status: 0, stdout: JSON.stringify(configured), stderr: "" };
        }
        if (args[1] === "add") {
          configured.push({
            name: args[2],
            transport: { type: "stdio", command: args[4], args: args.slice(5) },
          });
        } else if (args[1] === "remove") {
          const index = configured.findIndex((server) => server.name === args[2]);
          if (index >= 0) configured.splice(index, 1);
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    assert.equal(exitCode, 1, `${method} ${pattern} must preserve the original install failure`);
    assert.deepEqual(calls.filter((call) => call[2] === "remove"), [
      ["codex", "mcp", "remove", "markitdown"],
      ["codex", "mcp", "remove", "context7"],
    ]);
    assert.deepEqual(configured.map((server) => server.name), ["user-owned"]);
    assert.ok(!calls.some((call) => call.slice(1).join(" ") === "mcp remove user-owned"));
    assert.doesNotMatch(stderr.join(""), /user-command/);
  }
});

test("main reports MCP compensation failure generically without replacing the install failure", (t) => {
  const sourceDir = makeTempDir(t, "codex-mcp-remove-failure-source-");
  const homeDir = makeTempDir(t, "codex-mcp-remove-failure-home-");
  fs.writeFileSync(path.join(sourceDir, ".mcp.json"), JSON.stringify({
    mcpServers: { context7: { command: "npx", args: ["@upstash/context7-mcp@1.0.31"] } },
  }));
  const stderr = [];
  let removeCalls = 0;
  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    fs: failOnceFs("copyFileSync", /[\\/]\.codex[\\/]agents[\\/]apply\.toml$/),
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    findCodexBin: () => "codex",
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    runCodexCommand(bin, args) {
      if (args.join(" ") === "mcp list --json") return { status: 0, stdout: "[]", stderr: "" };
      if (args[1] === "remove") {
        removeCalls += 1;
        return { status: 7, stdout: "", stderr: "secret-remove-detail" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(removeCalls, 1);
  assert.match(stderr.join(""), /failed to roll back a newly added Codex MCP server/i);
  assert.doesNotMatch(stderr.join(""), /secret-remove-detail/);
});

test("copyCodexAgents: validates each target file individual paths with assertManagedPathSafe", (t) => {
  const outDir = makeTempDir(t, "codex-agent-out-");
  const destDir = makeTempDir(t, "codex-agent-dest-");

  fs.mkdirSync(path.join(outDir, ".codex", "agents"), { recursive: true });
  fs.writeFileSync(path.join(outDir, ".codex", "agents", "sdd-apply.toml"), "name = 'test'");

  // Create a symlinked destination file
  const linkDest = path.join(destDir, "sdd-apply.toml");
  const realTarget = path.join(destDir, "real-target.toml");
  fs.writeFileSync(realTarget, "");

  try {
    fs.symlinkSync(realTarget, linkDest, "file");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => copyCodexAgents(outDir, destDir, { fs }),
    /redirects through a symlinked or canonicalized path/i
  );
});

test("main persists .ospec-workflow-install.json and prunes stale agents/scripts", (t) => {
  const sandbox = makeTempDir(t, "codex-manifest-");
  const home = path.join(sandbox, "home");
  const codexRoot = path.join(home, ".codex");
  const source = path.join(sandbox, "source");
  const outDir = path.join(source, "dist", "codex");

  fs.mkdirSync(codexRoot, { recursive: true });
  fs.mkdirSync(path.join(codexRoot, "agents"), { recursive: true });
  fs.mkdirSync(path.join(codexRoot, "ospec-workflow", "scripts"), { recursive: true });
  fs.mkdirSync(path.join(outDir, ".codex", "agents"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "skills"), { recursive: true });

  // Simulate previous installation with old-agent.toml and old-script.js
  fs.writeFileSync(path.join(codexRoot, "agents", "old-agent.toml"), "name = 'old'");
  fs.writeFileSync(path.join(codexRoot, "agents", "user-custom.toml"), "name = 'user-custom'");
  fs.writeFileSync(path.join(codexRoot, "ospec-workflow", "scripts", "old-script.js"), "// old");

  const prevManifest = {
    version: "2.43.0",
    target: "codex",
    installedAt: "2026-08-01T00:00:00.000Z",
    files: [
      "AGENTS.md",
      "hooks.json",
      "agents/old-agent.toml",
      "ospec-workflow/scripts/old-script.js",
    ],
  };
  fs.writeFileSync(path.join(codexRoot, ".ospec-workflow-install.json"), JSON.stringify(prevManifest, null, 2));

  // Current build contains sdd-apply.toml and new-script.js
  fs.writeFileSync(path.join(outDir, "AGENTS.md"), "# Codex Agents\n");
  fs.writeFileSync(path.join(outDir, ".codex", "agents", "sdd-apply.toml"), "name = 'sdd-apply'");
  fs.writeFileSync(path.join(outDir, "scripts", "new-script.js"), "// new");
  fs.writeFileSync(
    path.join(outDir, "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ command: "node test.js" }] } })
  );

  const stdout = [];
  const stderr = [];
  const exitCode = main(["--source", source, "--no-validate"], {
    fs,
    homedir: () => home,
    outDir,
    runConfigure: () => ({ exitCode: 0 }),
    findCodexBin: () => null,
    stdout: { write: (msg) => stdout.push(msg) },
    stderr: { write: (msg) => stderr.push(msg) },
  });

  assert.equal(exitCode, 0);

  // Assert stale files were pruned
  assert.equal(fs.existsSync(path.join(codexRoot, "agents", "old-agent.toml")), false);
  assert.equal(fs.existsSync(path.join(codexRoot, "ospec-workflow", "scripts", "old-script.js")), false);

  // Assert user-created file was preserved
  assert.equal(fs.existsSync(path.join(codexRoot, "agents", "user-custom.toml")), true);

  // Assert new files were installed
  assert.equal(fs.existsSync(path.join(codexRoot, "agents", "sdd-apply.toml")), true);
  assert.equal(fs.existsSync(path.join(codexRoot, "ospec-workflow", "scripts", "new-script.js")), true);

  // Assert manifest was written
  const manifest = JSON.parse(fs.readFileSync(path.join(codexRoot, ".ospec-workflow-install.json"), "utf8"));
  assert.equal(manifest.target, "codex");
  assert.ok(manifest.files.includes("agents/sdd-apply.toml"));
  assert.ok(manifest.files.includes("ospec-workflow/scripts/new-script.js"));
  assert.ok(!manifest.files.includes("agents/old-agent.toml"));
});

test("setup:codex maintains skills ownership manifest and prunes stale skills", (t) => {
  const home = makeTempDir(t, "codex-skills-ownership-home-");
  const codexRoot = path.join(home, ".codex");
  const skillsRoot = path.join(home, ".agents", "skills");
  const source = makeTempDir(t, "codex-skills-source-");
  const outDir = makeTempDir(t, "codex-skills-out-");

  fs.mkdirSync(codexRoot, { recursive: true });
  fs.mkdirSync(skillsRoot, { recursive: true });

  // Setup previous skills state
  const oldSkillDir = path.join(skillsRoot, "old-skill");
  const userCustomSkillDir = path.join(skillsRoot, "user-custom-skill");
  fs.mkdirSync(oldSkillDir, { recursive: true });
  fs.mkdirSync(userCustomSkillDir, { recursive: true });
  fs.writeFileSync(path.join(oldSkillDir, "SKILL.md"), "# Old Skill");
  fs.writeFileSync(path.join(userCustomSkillDir, "SKILL.md"), "# User Custom Skill");

  // Previous skills manifest
  fs.writeFileSync(
    path.join(skillsRoot, ".ospec-workflow-install.json"),
    JSON.stringify({
      version: "2.44.0",
      target: "codex-skills",
      installedAt: "2026-08-14T00:00:00.000Z",
      files: ["old-skill/SKILL.md"],
    }),
  );

  // New source output
  fs.writeFileSync(path.join(outDir, "AGENTS.md"), "# Codex Agents\n");
  fs.mkdirSync(path.join(outDir, ".codex", "agents"), { recursive: true });
  fs.writeFileSync(path.join(outDir, ".codex", "agents", "sdd-apply.toml"), "name = 'sdd-apply'");
  fs.mkdirSync(path.join(outDir, "skills", "sdd-apply"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "skills", "sdd-apply", "SKILL.md"), "# SDD Apply Skill");
  fs.mkdirSync(path.join(outDir, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "hooks.json"),
    JSON.stringify({ hooks: {} }),
  );

  const stdout = [];
  const stderr = [];
  const exitCode = main(["--source", source, "--no-validate"], {
    fs,
    homedir: () => home,
    outDir,
    runConfigure: () => ({ exitCode: 0 }),
    findCodexBin: () => null,
    stdout: { write: (msg) => stdout.push(msg) },
    stderr: { write: (msg) => stderr.push(msg) },
  });

  if (exitCode !== 0) {
    console.error("Test failed with stderr:", stderr.join("\n"), "stdout:", stdout.join("\n"));
  }
  assert.equal(exitCode, 0);

  // Assert stale skill was pruned
  assert.equal(fs.existsSync(path.join(oldSkillDir, "SKILL.md")), false);

  // Assert user custom skill was preserved
  assert.equal(fs.existsSync(path.join(userCustomSkillDir, "SKILL.md")), true);

  // Assert new skill was installed
  assert.equal(fs.existsSync(path.join(skillsRoot, "sdd-apply", "SKILL.md")), true);

  // Assert skills manifest was updated
  const skillsManifest = JSON.parse(
    fs.readFileSync(path.join(skillsRoot, ".ospec-workflow-install.json"), "utf8"),
  );
  assert.equal(skillsManifest.target, "codex-skills");
  assert.ok(skillsManifest.files.includes("sdd-apply/SKILL.md"));
  assert.ok(!skillsManifest.files.includes("old-skill/SKILL.md"));
});


