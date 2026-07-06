"use strict";

// Runtime integration test for the materialized sync-openwiki.mjs template
// asset (skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs).
//
// This is the transform engine for Option D of sdd-document: it copies the
// template script into a throwaway temp project (mkdtemp), seeds a fixture
// openwiki/ directory, optionally initializes a git repo (+ origin remote),
// executes the script as a real subprocess, and asserts the materialized
// web-doc/src/content/docs/ output. Self-generates entirely under the OS temp
// dir — never reads the gitignored dist/ directory.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SYNC_SCRIPT_SRC = path.join(
  ROOT,
  "skills",
  "sdd-document",
  "assets",
  "web-doc-template",
  "scripts",
  "sync-openwiki.mjs"
);

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

// Builds a temp project root with:
//   <root>/openwiki/**        (fixture wiki source)
//   <root>/web-doc/scripts/sync-openwiki.mjs   (copied template script)
// and optionally initializes git with a `main` branch and an `origin` remote.
function setupProject(t, { pages, withGit = true, originUrl = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-sync-openwiki-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const openwikiDir = path.join(root, "openwiki");
  fs.mkdirSync(openwikiDir, { recursive: true });
  for (const [relPath, content] of Object.entries(pages)) {
    const abs = path.join(openwikiDir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }

  const webDocDir = path.join(root, "web-doc");
  fs.mkdirSync(path.join(webDocDir, "scripts"), { recursive: true });
  fs.copyFileSync(SYNC_SCRIPT_SRC, path.join(webDocDir, "scripts", "sync-openwiki.mjs"));

  if (withGit) {
    runGit(["init", "-q", "-b", "main"], root);
    runGit(["config", "user.email", "test@example.com"], root);
    runGit(["config", "user.name", "Test"], root);
    fs.writeFileSync(path.join(root, ".gitkeep"), "");
    runGit(["add", "."], root);
    runGit(["commit", "-q", "-m", "seed"], root);
    if (originUrl) {
      runGit(["remote", "add", "origin", originUrl], root);
    }
  }

  return { root, openwikiDir, webDocDir };
}

function runSync(webDocDir) {
  const result = spawnSync(process.execPath, [path.join("scripts", "sync-openwiki.mjs")], {
    cwd: webDocDir,
    encoding: "utf8",
  });
  return result;
}

function readOut(webDocDir, relPath) {
  return fs.readFileSync(path.join(webDocDir, "src", "content", "docs", relPath), "utf8");
}

function outExists(webDocDir, relPath) {
  return fs.existsSync(path.join(webDocDir, "src", "content", "docs", relPath));
}

test("injects title frontmatter from the page's first heading", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: { "architecture.md": "# Architecture Overview\n\nSome content.\n" },
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, result.stderr);

  const out = readOut(webDocDir, "architecture.md");
  assert.match(out, /^---[\s\S]*title:\s*"?Architecture Overview"?[\s\S]*---/, "title must be derived from the first heading");
});

test("falls back to a humanized filename when the page has no heading", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: { "runtime-hooks.md": "No heading here, just prose.\n" },
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, result.stderr);

  const out = readOut(webDocDir, "runtime-hooks.md");
  assert.match(out, /title:\s*"?Runtime Hooks"?/i, "title must be derived from the humanized filename");
});

test("does not overwrite an existing title in source frontmatter", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: {
      "custom.md": '---\ntitle: "Custom Preserved Title"\n---\n\n# A different heading\n',
    },
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, result.stderr);

  const out = readOut(webDocDir, "custom.md");
  assert.match(out, /title:\s*"Custom Preserved Title"/, "pre-existing title must be preserved, not overwritten");
});

test("rewrites a source-file link to the remote repository on the default branch", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: { "guide.md": "# Guide\n\nSee [the cache module](/scripts/lib/cache.js) for details.\n" },
    originUrl: "https://github.com/acme/repo.git",
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, result.stderr);

  const out = readOut(webDocDir, "guide.md");
  assert.match(
    out,
    /\[the cache module\]\(https:\/\/github\.com\/acme\/repo\/blob\/main\/scripts\/lib\/cache\.js\)/,
    "source-file link must be rewritten to {origin}/blob/{branch}/path"
  );
});

test("normalizes a git@ SSH-form origin to an https URL before rewriting links", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: { "guide.md": "# Guide\n\nSee [cache](/scripts/lib/cache.js).\n" },
    originUrl: "git@github.com:acme/repo.git",
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, result.stderr);

  const out = readOut(webDocDir, "guide.md");
  assert.match(
    out,
    /\[cache\]\(https:\/\/github\.com\/acme\/repo\/blob\/main\/scripts\/lib\/cache\.js\)/,
    "git@ SSH origin must be normalized to an https:// URL"
  );
});

test("leaves the link untouched and warns (exit 0) when no origin remote is configured", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: { "guide.md": "# Guide\n\nSee [cache](/scripts/lib/cache.js).\n" },
    originUrl: null,
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, "sync must exit 0 even with no origin configured");

  const out = readOut(webDocDir, "guide.md");
  assert.match(
    out,
    /\[cache\]\(\/scripts\/lib\/cache\.js\)/,
    "link must remain the original relative/local path when no origin is configured"
  );
  assert.match(result.stderr + result.stdout, /warn/i, "sync must emit a warning noting the skipped rewrite");
});

test("leaves a wiki-internal link untouched", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: {
      "architecture.md": "# Architecture\n\nSee [testing](./testing.md) too.\n",
      "testing.md": "# Testing\n\nContent.\n",
    },
    originUrl: "https://github.com/acme/repo.git",
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, result.stderr);

  const out = readOut(webDocDir, "architecture.md");
  assert.match(out, /\[testing\]\(\.\/testing\.md\)/, "wiki-internal relative link must not be rewritten to a remote URL");
});

test("maintains 1:1 parity between openwiki pages and web-doc output pages", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: {
      "one.md": "# One\n\nContent one.\n",
      "two.md": "# Two\n\nContent two.\n",
    },
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, result.stderr);

  assert.ok(outExists(webDocDir, "one.md"), "one.md must be transformed");
  assert.ok(outExists(webDocDir, "two.md"), "two.md must be transformed");

  const outDir = path.join(webDocDir, "src", "content", "docs");
  const producedFiles = fs.readdirSync(outDir).filter((f) => f.endsWith(".md"));
  assert.equal(producedFiles.length, 2, "exactly 2 output pages must exist for 2 source pages");
});

test("skips re-transforming an unchanged page on a second incremental run", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: { "stable.md": "# Stable\n\nContent.\n" },
  });

  const first = runSync(webDocDir);
  assert.equal(first.status, 0, first.stderr);

  const outPath = path.join(webDocDir, "src", "content", "docs", "stable.md");

  // Force output mtime backwards artificially old. If the sync correctly
  // detects the SOURCE page is unchanged (mtime/hash match the cache), it
  // must skip re-transforming, so this artificially-old mtime survives the
  // second run untouched. If the sync incorrectly re-transforms every run,
  // this file's mtime would jump forward to "now" instead.
  const oldTime = new Date(Date.now() - 60_000);
  fs.utimesSync(outPath, oldTime, oldTime);

  const second = runSync(webDocDir);
  assert.equal(second.status, 0, second.stderr);

  const afterSecondMtime = fs.statSync(outPath).mtimeMs;
  assert.equal(
    afterSecondMtime,
    oldTime.getTime(),
    "unchanged page output must not be rewritten on the second incremental run"
  );
});

// --- 4R remediation batch (approval-006) ------------------------------------

test("does not prune existing web-doc output when openwiki/ is completely missing", (t) => {
  const { webDocDir, openwikiDir } = setupProject(t, {
    pages: { "keep.md": "# Keep\n\nContent.\n" },
  });

  const first = runSync(webDocDir);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(outExists(webDocDir, "keep.md"), "keep.md must exist after the first sync");

  fs.rmSync(openwikiDir, { recursive: true, force: true });

  const second = runSync(webDocDir);
  assert.equal(second.status, 0, "a missing openwiki/ source must not fail the sync");
  assert.ok(outExists(webDocDir, "keep.md"), "existing web-doc output must survive a missing openwiki/ source intact");
  assert.match(second.stderr + second.stdout, /warn/i, "must warn that the source is missing/empty");
});

test("does not prune existing web-doc output when openwiki/ exists but is empty", (t) => {
  const { webDocDir, openwikiDir } = setupProject(t, {
    pages: { "keep.md": "# Keep\n\nContent.\n" },
  });

  const first = runSync(webDocDir);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(outExists(webDocDir, "keep.md"), "keep.md must exist after the first sync");

  fs.rmSync(path.join(openwikiDir, "keep.md"));

  const second = runSync(webDocDir);
  assert.equal(second.status, 0, "an empty openwiki/ source must not fail the sync");
  assert.ok(outExists(webDocDir, "keep.md"), "existing web-doc output must survive an empty openwiki/ source intact");
  assert.match(second.stderr + second.stdout, /warn/i, "must warn that the source is missing/empty");
});

test("preserves nested/multiline frontmatter structure byte-for-byte when a title already exists", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: {
      "structured.md":
        '---\ntitle: "Custom Title"\nsidebar:\n  order: 1\n  badge:\n    text: New\n    variant: tip\ntags:\n  - alpha\n  - beta\n---\n\n# Ignored heading\n\nBody content.\n',
    },
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, result.stderr);

  const out = readOut(webDocDir, "structured.md");
  assert.match(out, /title:\s*"Custom Title"/, "existing title must be preserved");
  assert.match(out, /sidebar:\r?\n {2}order: 1/, "nested sidebar.order must be preserved");
  assert.match(out, /badge:\r?\n {4}text: New\r?\n {4}variant: tip/, "deeply nested badge keys must be preserved");
  assert.match(out, /tags:\r?\n {2}- alpha\r?\n {2}- beta/, "nested list under tags must be preserved");
});

test("prepends a derived title onto existing frontmatter that lacks one, preserving other keys", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: {
      "partial.md": "---\nsidebar:\n  order: 2\n---\n\n# Partial Heading\n\nBody.\n",
    },
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, result.stderr);

  const out = readOut(webDocDir, "partial.md");
  assert.match(out, /title:\s*"Partial Heading"/, "title must be derived and injected");
  assert.match(out, /sidebar:\r?\n {2}order: 2/, "pre-existing nested sidebar.order must be preserved");
});

test("continues syncing other pages and warns (exit 0) when a single page's transform fails", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: {
      "good.md": "# Good\n\nContent.\n",
      "nested/bad.md": "# Bad\n\nContent.\n",
    },
  });

  // Force materializing the "nested" output directory to fail: pre-create a
  // FILE (not a directory) at that path so mkdirSync({recursive:true}) for
  // nested/bad.md's output throws ENOTDIR instead of succeeding.
  const outDocsDir = path.join(webDocDir, "src", "content", "docs");
  fs.mkdirSync(outDocsDir, { recursive: true });
  fs.writeFileSync(path.join(outDocsDir, "nested"), "");

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, "a single page failure must not crash the whole sync");
  assert.ok(outExists(webDocDir, "good.md"), "unrelated pages must still be synced");
  assert.match(result.stderr + result.stdout, /warn/i, "must warn about the failed page");
  assert.match(result.stderr + result.stdout, /bad\.md/, "warning must name the failing page path");
});

test("does not fail the sync when writing the incremental cache file fails", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: { "guide.md": "# Guide\n\nContent.\n" },
  });

  // Pre-create .sync-cache.json as a DIRECTORY so writeFileSync at that path
  // throws EISDIR instead of succeeding.
  fs.mkdirSync(path.join(webDocDir, ".sync-cache.json"));

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, "a cache-write failure must not fail an otherwise successful sync");
  assert.ok(outExists(webDocDir, "guide.md"), "the page must still be transformed despite the cache write failure");
  assert.match(result.stderr + result.stdout, /warn/i, "must warn about the failed cache write");
});

test("warns and performs a full re-sync when .sync-cache.json is corrupt", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: { "guide.md": "# Guide\n\nContent.\n" },
  });

  fs.writeFileSync(path.join(webDocDir, ".sync-cache.json"), "{ not valid json !!!");

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, "a corrupt cache must not fail the sync");
  assert.ok(outExists(webDocDir, "guide.md"), "the page must still be transformed via a full re-sync");
  assert.match(result.stderr + result.stdout, /warn/i, "must warn that the cache was unreadable/corrupt");
});

test("degrades cleanly with a warning when there is no git repository at all", (t) => {
  const { webDocDir } = setupProject(t, {
    pages: { "guide.md": "# Guide\n\nSee [cache](/scripts/lib/cache.js).\n" },
    withGit: false,
  });

  const result = runSync(webDocDir);
  assert.equal(result.status, 0, "sync must exit 0 even with no git repository at all");

  const out = readOut(webDocDir, "guide.md");
  assert.match(out, /\[cache\]\(\/scripts\/lib\/cache\.js\)/, "link must remain untouched with no git repo");
  assert.match(result.stderr + result.stdout, /warn/i, "sync must warn about the missing git context (default branch / origin)");
});

test("prunes the output page when the corresponding openwiki source page is deleted", (t) => {
  const { webDocDir, openwikiDir } = setupProject(t, {
    pages: {
      "keep.md": "# Keep\n\nContent.\n",
      "remove.md": "# Remove\n\nContent.\n",
    },
  });

  const first = runSync(webDocDir);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(outExists(webDocDir, "remove.md"), "remove.md must exist after the first sync");

  fs.rmSync(path.join(openwikiDir, "remove.md"));

  const second = runSync(webDocDir);
  assert.equal(second.status, 0, second.stderr);

  assert.ok(!outExists(webDocDir, "remove.md"), "remove.md output must be pruned after its source is deleted");
  assert.ok(outExists(webDocDir, "keep.md"), "keep.md output must remain untouched");
});
