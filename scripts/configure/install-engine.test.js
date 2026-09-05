"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  MANIFEST_FILENAME,
  assertPathSafe,
  createRollbackJournal,
  readOwnershipManifest,
  writeOwnershipManifest,
  pruneStaleFiles,
  safeParseJson,
  safeParseJsonc,
  mergeJsonFile,
  mergeJsoncFile,
  mergeHooksDoc,
  syncTargetTree,
  withTransientFsRetries,
} = require("./install-engine.js");

for (const code of ["EPERM", "EACCES", "EBUSY"]) {
  test(`withTransientFsRetries recovers from ${code} with deterministic backoff`, () => {
    const delays = [];
    let calls = 0;
    const result = withTransientFsRetries(() => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error("locked"), { code });
      return "ok";
    }, { target: "test", operation: "write", path: "/tmp/hooks.json", maxRetries: 3, retryDelay: 5, sleep: delay => delays.push(delay) });
    assert.equal(result, "ok");
    assert.equal(calls, 3);
    assert.deepEqual(delays, [5, 10]);
  });
}

test("withTransientFsRetries enriches exhaustion and preserves code and cause", () => {
  const original = Object.assign(new Error("locked"), { code: "EPERM" });
  assert.throws(
    () => withTransientFsRetries(() => { throw original; }, {
      target: "antigravity", operation: "write", path: "C:/x/hooks.json", maxRetries: 1, sleep: () => {},
    }),
    error => error.code === "EPERM" && error.cause === original && error.attempts === 2 &&
      /antigravity/.test(error.message) && /close the application/i.test(error.message),
  );
});

test("withTransientFsRetries fails permanent errors immediately", () => {
  let calls = 0;
  const original = Object.assign(new Error("missing"), { code: "ENOENT" });
  assert.throws(() => withTransientFsRetries(() => { calls += 1; throw original; }, { sleep: () => {} }), error => error === original);
  assert.equal(calls, 1);
});

function createMemoryFs(initialFiles = {}) {
  const files = new Map();
  const dirs = new Set();

  for (const [rawPath, content] of Object.entries(initialFiles)) {
    const norm = path.resolve(rawPath);
    files.set(norm, Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"));
    let parent = path.dirname(norm);
    while (parent && parent !== path.dirname(parent)) {
      dirs.add(parent);
      parent = path.dirname(parent);
    }
  }

  return {
    _files: files,
    _dirs: dirs,
    existsSync(targetPath) {
      const norm = path.resolve(targetPath);
      return files.has(norm) || dirs.has(norm);
    },
    readFileSync(targetPath, encoding) {
      const norm = path.resolve(targetPath);
      const buf = files.get(norm);
      if (!buf) {
        const err = new Error(`ENOENT: no such file: ${targetPath}`);
        err.code = "ENOENT";
        throw err;
      }
      return encoding ? buf.toString(encoding) : buf;
    },
    writeFileSync(targetPath, content) {
      const norm = path.resolve(targetPath);
      const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
      files.set(norm, buf);
      let parent = path.dirname(norm);
      while (parent && parent !== path.dirname(parent)) {
        dirs.add(parent);
        parent = path.dirname(parent);
      }
    },
    mkdirSync(targetPath) {
      const norm = path.resolve(targetPath);
      dirs.add(norm);
      let parent = path.dirname(norm);
      while (parent && parent !== path.dirname(parent)) {
        dirs.add(parent);
        parent = path.dirname(parent);
      }
    },
    rmSync(targetPath) {
      const norm = path.resolve(targetPath);
      files.delete(norm);
      dirs.delete(norm);
    },
    rmdirSync(targetPath) {
      const norm = path.resolve(targetPath);
      dirs.delete(norm);
    },
    readdirSync(targetPath, options = {}) {
      const norm = path.resolve(targetPath);
      const entries = [];
      const withTypes = options && options.withFileTypes;
      const childNames = new Set();

      for (const filePath of files.keys()) {
        if (filePath.startsWith(norm + path.sep)) {
          const rest = filePath.slice((norm + path.sep).length);
          const segment = rest.split(path.sep)[0];
          if (!childNames.has(segment)) {
            childNames.add(segment);
            const isDir = rest.includes(path.sep);
            entries.push(
              withTypes
                ? {
                    name: segment,
                    isFile: () => !isDir,
                    isDirectory: () => isDir,
                    isSymbolicLink: () => false,
                  }
                : segment,
            );
          }
        }
      }
      return entries;
    },
    copyFileSync(src, dest) {
      const buf = this.readFileSync(src);
      this.writeFileSync(dest, buf);
    },
    lstatSync(targetPath) {
      const norm = path.resolve(targetPath);
      if (files.has(norm)) {
        return { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, mode: 0o644 };
      }
      if (dirs.has(norm)) {
        return { isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false, mode: 0o755 };
      }
      const err = new Error(`ENOENT: ${targetPath}`);
      err.code = "ENOENT";
      throw err;
    },
    realpathSync(targetPath) {
      return path.resolve(targetPath);
    },
    chmodSync() {},
  };
}

test("rollback retries each transient restore mutation", () => {
  const root = path.resolve("/tmp/rollback-retry");
  const managed = path.join(root, "hooks.json");
  const base = createMemoryFs({ [managed]: "before" });
  let writes = 0;
  const fsImpl = new Proxy(base, {
    get(target, property) {
      if (property !== "writeFileSync") return target[property];
      return (targetPath, ...args) => {
        writes += 1;
        if (writes === 1) throw Object.assign(new Error("busy"), { code: "EBUSY" });
        return target.writeFileSync(targetPath, ...args);
      };
    },
  });
  const journal = createRollbackJournal(root, fsImpl, { target: "test", sleep: () => {} });
  journal.capture(managed);
  base.writeFileSync(managed, "after");
  journal.rollback();
  assert.equal(base.readFileSync(managed, "utf8"), "before");
  assert.equal(writes, 2);
});

test("safeParseJson throws informative error on invalid JSON", () => {
  assert.throws(
    () => safeParseJson("{ invalid: json }", "opencode.json"),
    /Failed to parse opencode.json/,
  );
  assert.deepEqual(safeParseJson('{"foo":"bar"}'), { foo: "bar" });
  assert.deepEqual(safeParseJson(""), {});
});

test("safeParseJsonc strips comments and trailing commas", () => {
  const jsonc = `
  {
    // Comment line
    "name": "vscode-settings",
    /* Block comment */
    "chat.pluginLocations": [
      "/path/to/plugin",
    ],
  }
  `;
  const parsed = safeParseJsonc(jsonc, "settings.json");
  assert.equal(parsed.name, "vscode-settings");
  assert.deepEqual(parsed["chat.pluginLocations"], ["/path/to/plugin"]);
});

test("mergeJsonFile aborts on invalid JSON without writing", () => {
  const root = path.resolve("/home/user/.copilot");
  const configPath = path.join(root, "mcp-config.json");
  const fakeFs = createMemoryFs({
    [configPath]: "{ malformed json...",
  });

  assert.throws(
    () => mergeJsonFile(configPath, (doc) => ({ ...doc, added: true }), { fs: fakeFs }),
    /Failed to parse/,
  );

  // File remains untouched
  assert.equal(fakeFs.readFileSync(configPath, "utf8"), "{ malformed json...");
});

test("mergeJsonFile updates existing valid JSON cleanly", () => {
  const root = path.resolve("/home/user/.copilot");
  const configPath = path.join(root, "mcp-config.json");
  const fakeFs = createMemoryFs({
    [configPath]: '{\n  "userSetting": "custom"\n}',
  });

  const updated = mergeJsonFile(
    configPath,
    (doc) => ({
      ...doc,
      mcpServers: { ospec: { command: "npx" } },
    }),
    { fs: fakeFs },
  );

  assert.equal(updated.userSetting, "custom");
  assert.equal(updated.mcpServers.ospec.command, "npx");
  const onDisk = JSON.parse(fakeFs.readFileSync(configPath, "utf8"));
  assert.equal(onDisk.userSetting, "custom");
});

test("ownership manifest and stale pruning", () => {
  const targetRoot = path.resolve("/home/user/.cursor");
  const oldAgent = path.join(targetRoot, "agents", "old-agent.md");
  const userAgent = path.join(targetRoot, "agents", "my-custom.md");
  const keepAgent = path.join(targetRoot, "agents", "sdd-apply.md");

  const fakeFs = createMemoryFs({
    [oldAgent]: "old agent",
    [userAgent]: "user custom agent",
    [keepAgent]: "keep agent",
  });

  const previousManifest = {
    version: "2.43.0",
    target: "cursor",
    files: ["agents/old-agent.md", "agents/sdd-apply.md"],
  };

  const currentFiles = ["agents/sdd-apply.md", "agents/sdd-verify.md"];

  const pruneResult = pruneStaleFiles(targetRoot, previousManifest, currentFiles, fakeFs);
  assert.deepEqual(pruneResult.deleted, ["agents/old-agent.md"]);

  // Stale agent is removed
  assert.equal(fakeFs.existsSync(oldAgent), false);
  // User agent is preserved
  assert.equal(fakeFs.existsSync(userAgent), true);
  // Current agent is preserved
  assert.equal(fakeFs.existsSync(keepAgent), true);
});

test("mergeHooksDoc merges OSpec hooks without deleting foreign hooks", () => {
  const existingCursorHooks = {
    version: 1,
    hooks: {
      beforeShellExecution: [
        { command: "my-custom-linter.sh" },
        { command: "node /old/path/ospec-hooks-launch.js pre-tool-use" },
      ],
    },
  };

  const generatedCursorHooks = {
    version: 1,
    hooks: {
      beforeShellExecution: [{ command: "node /new/path/ospec-hooks-launch.js pre-tool-use" }],
      stop: [{ command: "node /new/path/ospec-hooks-launch.js stop" }],
    },
  };

  const merged = mergeHooksDoc(existingCursorHooks, generatedCursorHooks, "cursor");
  assert.equal(merged.hooks.beforeShellExecution.length, 2);
  assert.equal(merged.hooks.beforeShellExecution[0].command, "my-custom-linter.sh");
  assert.equal(merged.hooks.beforeShellExecution[1].command, "node /new/path/ospec-hooks-launch.js pre-tool-use");
  assert.equal(merged.hooks.stop.length, 1);
});

test("mergeHooksDoc retires removed Cursor events while preserving user commands", () => {
  const existing = {
    version: 1,
    hooks: {
      beforeShellExecution: [
        { command: "node /old/ospec-hooks-launch.js pre-tool-use" },
        { command: "my-custom-linter.sh" },
      ],
      stop: [{ command: "node /old/ospec-hooks-launch.js stop" }],
      afterFileEdit: [{ command: "format.sh" }],
    },
  };
  const generated = { version: 1, hooks: { sessionStart: [{ command: "ospec-hooks session-start" }] } };
  const original = structuredClone(existing);

  const merged = mergeHooksDoc(existing, generated, "cursor");

  assert.deepEqual(merged.hooks, {
    beforeShellExecution: [{ command: "my-custom-linter.sh" }],
    afterFileEdit: [{ command: "format.sh" }],
    sessionStart: generated.hooks.sessionStart,
  });
  assert.deepEqual(existing, original);
  assert.deepEqual(mergeHooksDoc(merged, generated, "cursor"), merged);
});

test("safeParseJsonc parses complex JSONC without corrupting string literals", () => {
  const jsonc = `// Leading file comment
{
  /* Block comment */
  "url": "https://example.com/api//endpoint",
  "commentLike": "/* this is not a comment */",
  "escapedQuotes": "hello \\" // still inside string \\" world",
  "nested": {
    "array": [
      "item1",
      "item2", // Trailing line comment
    ],
  },
}
`;
  const parsed = safeParseJsonc(jsonc);
  assert.equal(parsed.url, "https://example.com/api//endpoint");
  assert.equal(parsed.commentLike, "/* this is not a comment */");
  assert.equal(parsed.escapedQuotes, 'hello " // still inside string " world');
  assert.deepEqual(parsed.nested.array, ["item1", "item2"]);
});

test("safeParseJsonc preserves string literals containing comma and closing brace", () => {
  const jsonc = `{\n  "template": "function() { return { a: 1, }; }",\n  "arrayInString": "[\\n    1,\\n  ]"\n}`;
  const parsed = safeParseJsonc(jsonc);
  assert.equal(parsed.template, "function() { return { a: 1, }; }");
  assert.equal(parsed.arrayInString, "[\n    1,\n  ]");
});


