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
