"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

// Load the module that does not exist or has no implementation yet
const { RENAME_ATTEMPTS, writeFileAtomic, recoverOrphanBak, renameWithFallback } = require("./atomic-write.js");

async function createTempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "atomic-write-test-"));
}

// Each writer names its own temporary file <target>.<writer>.tmp (E1.46).
function isTempOf(targetPath, file) {
  return file.startsWith(targetPath + ".") && file.endsWith(".tmp");
}

async function ageFile(file) {
  const past = new Date(Date.now() - 60000);
  await fs.utimes(file, past, past);
}

test("1.1.1 · Normal write — temp file created then renamed", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const content = "members:\n  - id: member-1";

    await writeFileAtomic(targetPath, content);

    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, content);

    // Verify no temp file left behind
    assert.deepStrictEqual(await fs.readdir(tmpDir), ["workspace.yaml"]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.2 · Stale .tmp file of a dead writer removed", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const tempPath = targetPath + ".tmp";

    // Write stale tmp file, older than the lock's stale window
    await fs.writeFile(tempPath, "stale content");
    await ageFile(tempPath);

    const content = "new atomic content";
    await writeFileAtomic(targetPath, content);

    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, content);

    // Temp file should be gone
    await assert.rejects(fs.stat(tempPath), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.3 · Write failure of temp — original preserved, tmp cleaned up", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const originalContent = "original content";
    await fs.writeFile(targetPath, originalContent);

    // Create a file at the place of the parent directory of badTargetPath
    const fileAsDir = path.join(tmpDir, "somefile");
    await fs.writeFile(fileAsDir, "not a directory");
    const badTargetPath = path.join(fileAsDir, "workspace.yaml");

    await assert.rejects(writeFileAtomic(badTargetPath, "new content"));

    // Original target should be untouched
    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, originalContent);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.4 · Windows rename refused once — retried, the target never moved aside", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    await fs.writeFile(targetPath, "original content");

    // Windows refuses, for a moment, to rename over a target another process
    // is replacing (E1.55): the first rename of the temp file fails.
    const originalRename = fs.rename;
    const renames = [];
    fs.rename = async (oldPath, newPath) => {
      renames.push({ oldPath, newPath });
      if (newPath === targetPath && isTempOf(targetPath, oldPath) && renames.length === 1) {
        const err = new Error("EEXIST: file already exists, rename");
        err.code = "EEXIST";
        throw err;
      }
      return originalRename(oldPath, newPath);
    };

    try {
      await writeFileAtomic(targetPath, "new windows content");
    } finally {
      fs.rename = originalRename;
    }

    assert.strictEqual(await fs.readFile(targetPath, "utf8"), "new windows content");
    assert.strictEqual(renames.length, 2);
    assert.ok(renames.every((rename) => rename.oldPath !== targetPath), "the target is never moved aside");
    assert.deepStrictEqual(await fs.readdir(tmpDir), ["workspace.yaml"]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.5 · Orphaned .bak recovery when target is absent", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const bakPath = targetPath + ".bak";
    const bakContent = "orphaned bak content";
    await fs.writeFile(bakPath, bakContent);

    // Prior to writing, recoverOrphanBak should restore it
    await recoverOrphanBak(targetPath);

    const targetActual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(targetActual, bakContent);
    await assert.rejects(fs.stat(bakPath), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.6 · Crash post-tmp before rename — stale .tmp removed in re-run", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "workspace.yaml");
    const tempPath = targetPath + ".4242-crashed.tmp";

    await fs.writeFile(tempPath, "half written content");
    await ageFile(tempPath);

    // Re-run
    await writeFileAtomic(targetPath, "full content");

    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, "full content");
    await assert.rejects(fs.stat(tempPath), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("1.1.7 · writeFileAtomic on federation-baseline-status.yaml", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "federation-baseline-status.yaml");
    const content = "status: pending";

    await writeFileAtomic(targetPath, content);

    const actual = await fs.readFile(targetPath, "utf8");
    assert.strictEqual(actual, content);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("renameWithFallback · file success path", async () => {
  const tmpDir = await createTempDir();
  try {
    const src = path.join(tmpDir, "src.txt");
    const dest = path.join(tmpDir, "dest.txt");
    await fs.writeFile(src, "payload");
    await renameWithFallback(src, dest);
    assert.strictEqual(await fs.readFile(dest, "utf8"), "payload");
    await assert.rejects(fs.stat(src), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("renameWithFallback · directory success path", async () => {
  const tmpDir = await createTempDir();
  try {
    const src = path.join(tmpDir, "src-dir");
    const dest = path.join(tmpDir, "dest-dir");
    await fs.mkdir(src);
    await fs.writeFile(path.join(src, "nested.txt"), "dir-payload");
    await renameWithFallback(src, dest);
    assert.strictEqual(await fs.readFile(path.join(dest, "nested.txt"), "utf8"), "dir-payload");
    await assert.rejects(fs.stat(src), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("renameWithFallback · simulated EPERM then success (file)", async () => {
  const tmpDir = await createTempDir();
  try {
    const src = path.join(tmpDir, "src.txt");
    const dest = path.join(tmpDir, "dest.txt");
    await fs.writeFile(src, "new-bytes");
    await fs.writeFile(dest, "old-bytes");

    const realRename = fs.rename;
    let firstDestAttempt = true;
    const renameSpy = async (oldPath, newPath) => {
      if (firstDestAttempt && oldPath === src && newPath === dest) {
        firstDestAttempt = false;
        const err = new Error("EPERM: operation not permitted, rename");
        err.code = "EPERM";
        throw err;
      }
      return realRename(oldPath, newPath);
    };

    await renameWithFallback(src, dest, {
      fsImpl: { rename: renameSpy, unlink: fs.unlink, rm: fs.rm, stat: fs.stat },
    });
    assert.strictEqual(await fs.readFile(dest, "utf8"), "new-bytes");
    await assert.rejects(fs.stat(src), { code: "ENOENT" });
    await assert.rejects(fs.stat(dest + ".bak"), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("renameWithFallback · simulated EEXIST then success (directory)", async () => {
  const tmpDir = await createTempDir();
  try {
    const src = path.join(tmpDir, "src-dir");
    const dest = path.join(tmpDir, "dest-dir");
    await fs.mkdir(src);
    await fs.writeFile(path.join(src, "a.txt"), "new");
    await fs.mkdir(dest);
    await fs.writeFile(path.join(dest, "a.txt"), "old");

    const realRename = fs.rename;
    let firstDestAttempt = true;
    const renameSpy = async (oldPath, newPath) => {
      if (firstDestAttempt && oldPath === src && newPath === dest) {
        firstDestAttempt = false;
        const err = new Error("EEXIST: file already exists, rename");
        err.code = "EEXIST";
        throw err;
      }
      return realRename(oldPath, newPath);
    };

    await renameWithFallback(src, dest, {
      fsImpl: { rename: renameSpy, unlink: fs.unlink, rm: fs.rm, stat: fs.stat },
    });
    assert.strictEqual(await fs.readFile(path.join(dest, "a.txt"), "utf8"), "new");
    await assert.rejects(fs.stat(src), { code: "ENOENT" });
    await assert.rejects(fs.stat(dest + ".bak"), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// E1.46 state-durability: each writer owns its temporary file, the new content
// reaches the disk before the rename, and a dead writer's leftovers go away.
test("concurrent writers of one file each use their own temporary file", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "state.yaml");
    const contents = Array.from({ length: 20 }, (_, index) => `writer ${index}\n`.repeat(500));

    await Promise.all(contents.map((content) => writeFileAtomic(targetPath, content)));

    assert.ok(contents.includes(await fs.readFile(targetPath, "utf8")), "the file holds one whole write");
    assert.deepStrictEqual(await fs.readdir(tmpDir), ["state.yaml"]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// E1.55 atomic-write-concurrent-rename: Windows refuses, for a moment, to rename
// over a target another writer is replacing. Each writer retries the same
// atomic rename instead of moving the target aside.
function eperm() {
  return Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" });
}

test("two writers refused while the other replaces the target both finish, and the target never leaves", async (t) => {
  const tmpDir = await createTempDir();
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));
  const targetPath = path.join(tmpDir, "state.yaml");
  await fs.writeFile(targetPath, "old content");
  const realRename = fs.rename;
  t.after(() => {
    fs.rename = realRename;
  });

  // Each writer's first rename over the target is refused. A writer that moves
  // the target aside is held until the other has tried to move it too, so the
  // second one always finds it gone, whatever the scheduler does.
  const refused = new Set();
  const movedAside = [];
  let firstMoved;
  const firstMovedAside = new Promise((resolve) => (firstMoved = resolve));
  let secondTried;
  const secondTriedToMove = new Promise((resolve) => (secondTried = resolve));
  fs.rename = async (from, to) => {
    if (to === targetPath && isTempOf(targetPath, from) && !refused.has(from)) {
      refused.add(from);
      throw eperm();
    }
    if (from !== targetPath) return realRename(from, to);
    movedAside.push(to);
    if (movedAside.length === 1) {
      await realRename(from, to);
      firstMoved();
      await secondTriedToMove;
      return;
    }
    await firstMovedAside;
    try {
      return await realRename(from, to);
    } finally {
      secondTried();
    }
  };

  const contents = ["writer A\n", "writer B\n"];
  await Promise.all(contents.map((content) => writeFileAtomic(targetPath, content)));
  fs.rename = realRename;

  assert.ok(contents.includes(await fs.readFile(targetPath, "utf8")), "the target holds one whole write");
  assert.deepStrictEqual(movedAside, [], "the target is never moved aside");
  assert.deepStrictEqual(await fs.readdir(tmpDir), ["state.yaml"]);
});

test("a rename refused every time fails the write and keeps the old content, without leftovers", async (t) => {
  const tmpDir = await createTempDir();
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));
  const targetPath = path.join(tmpDir, "state.yaml");
  await fs.writeFile(targetPath, "old content");
  const realRename = fs.rename;
  t.after(() => {
    fs.rename = realRename;
  });
  let attempts = 0;
  fs.rename = async (from, to) => {
    if (to === targetPath && isTempOf(targetPath, from)) {
      attempts += 1;
      throw eperm();
    }
    return realRename(from, to);
  };

  await assert.rejects(writeFileAtomic(targetPath, "new content"), { code: "EPERM" });
  fs.rename = realRename;

  assert.strictEqual(attempts, RENAME_ATTEMPTS);
  assert.strictEqual(await fs.readFile(targetPath, "utf8"), "old content");
  assert.deepStrictEqual(await fs.readdir(tmpDir), ["state.yaml"]);
});

test("a failed fsync of the new content fails the write and keeps the old file", async (t) => {
  const tmpDir = await createTempDir();
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));
  const targetPath = path.join(tmpDir, "state.yaml");
  await fs.writeFile(targetPath, "old content");
  const originalOpen = fs.open;
  fs.open = async function openWithFailingSync(file, ...rest) {
    const handle = await originalOpen.call(this, file, ...rest);
    if (String(file).endsWith(".tmp")) {
      handle.sync = async () => {
        throw Object.assign(new Error("EIO: i/o error, fsync"), { code: "EIO" });
      };
    }
    return handle;
  };
  t.after(() => {
    fs.open = originalOpen;
  });

  await assert.rejects(writeFileAtomic(targetPath, "new content"), { code: "EIO" });

  fs.open = originalOpen;
  assert.strictEqual(await fs.readFile(targetPath, "utf8"), "old content");
  assert.deepStrictEqual(await fs.readdir(tmpDir), ["state.yaml"]);
});

test("a write removes the temporary files of its target older than 5 s, and only those", async () => {
  const tmpDir = await createTempDir();
  try {
    const targetPath = path.join(tmpDir, "state.yaml");
    const past = new Date(Date.now() - 60000);
    const stale = [`${targetPath}.tmp`, `${targetPath}.999-dead.tmp`];
    const kept = [`${targetPath}.1000-live.tmp`, path.join(tmpDir, "other.yaml.999-dead.tmp")];
    for (const file of [...stale, ...kept]) await fs.writeFile(file, "half written");
    for (const file of [...stale, kept[1]]) await fs.utimes(file, past, past);

    await writeFileAtomic(targetPath, "new content");

    assert.strictEqual(await fs.readFile(targetPath, "utf8"), "new content");
    for (const file of stale) await assert.rejects(fs.stat(file), { code: "ENOENT" }, file);
    for (const file of kept) await fs.stat(file);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
