#!/usr/bin/env node
// sync-openwiki.mjs — transforms ../openwiki/ into ./src/content/docs/.
//
// Zero-dependency Node ESM script (only node: built-ins). Invoked by
// `predev`/`prebuild` in this project's package.json. `openwiki/` remains
// the single source of truth; this script's output directory is always
// treated as generated — never hand-authored.
//
// Behavior (see openspec Option D requirements REQ-sdd-document-015..018):
//   - Injects a `title` frontmatter field (first heading, else humanized
//     filename); never overwrites an existing title.
//   - Rewrites links to repository source files into remote-repository URLs
//     on the default branch; leaves wiki-internal links untouched.
//   - Skips rewriting (with a warning, exit 0) when no `origin` remote is
//     configured — this script must never fail predev/prebuild for that.
//   - Incremental: skips re-transforming pages whose source mtime AND
//     content hash are unchanged since the last run.
//   - Maintains strict 1:1 parity: prunes output pages whose source was
//     deleted.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

const CWD = process.cwd();
const WIKI_SRC = join(CWD, "..", "openwiki");
const OUT_DIR = join(CWD, "src", "content", "docs");
const CACHE_PATH = join(CWD, ".sync-cache.json");
const EXCLUDED_FILES = new Set([".last-update.json", "_plan.md"]);

// --- git helpers -----------------------------------------------------------

function runGit(args) {
  return execFileSync("git", args, { cwd: CWD, encoding: "utf8" }).trim();
}

/** Resolves the origin web URL (https), normalizing git@ SSH form. Returns null if unavailable. */
function resolveOriginUrl() {
  try {
    let url = runGit(["remote", "get-url", "origin"]);
    if (!url) return null;
    const sshMatch = url.match(/^git@([^:]+):(.+?)(\.git)?$/);
    if (sshMatch) {
      return `https://${sshMatch[1]}/${sshMatch[2]}`;
    }
    return url.replace(/\.git$/, "");
  } catch {
    return null;
  }
}

/** Resolves the repository's default branch name, falling back to "main". */
function resolveDefaultBranch() {
  try {
    const ref = runGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
    const parts = ref.split("/");
    return parts.length > 1 ? parts.slice(1).join("/") : "main";
  } catch {
    return "main";
  }
}

// --- frontmatter -------------------------------------------------------------

/** Splits `---\nYAML\n---\nBODY` into { frontmatter, body, hasFrontmatter }. */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      frontmatter[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { frontmatter, body: match[2], hasFrontmatter: true };
}

function serializeFrontmatter(frontmatter) {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function extractFirstHeading(text) {
  const match = text.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function humanizeFilename(relPath) {
  const base = relPath.split(sep).pop().replace(/\.md$/, "");
  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Resolves the frontmatter+body to write for a transformed page. */
function buildFrontmatter(sourceContent, relPath) {
  const { frontmatter, body, hasFrontmatter } = parseFrontmatter(sourceContent);
  const searchText = hasFrontmatter ? body : sourceContent;

  if (!frontmatter.title) {
    frontmatter.title = extractFirstHeading(searchText) || humanizeFilename(relPath);
  }

  return { frontmatter, body: searchText };
}

// --- link classification and rewriting --------------------------------------

const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;

/** "source-file" (repo path outside openwiki/) vs "wiki-internal" (relative, or under /openwiki/). */
function classifyLinkTarget(target) {
  if (!target.startsWith("/")) return "wiki-internal";
  if (target.startsWith("/openwiki/")) return "wiki-internal";
  return "source-file";
}

/** Rewrites source-file links to {originUrl}/blob/{branch}/{path}; leaves wiki-internal links as-is. */
function rewriteLinks(body, { originUrl, defaultBranch, warn }) {
  let warnedMissingOrigin = false;
  const result = body.replace(LINK_RE, (full, text, target) => {
    if (classifyLinkTarget(target) !== "source-file") {
      return full;
    }
    if (!originUrl) {
      if (!warnedMissingOrigin) {
        warn(`No 'origin' remote configured; skipping source-link rewrite for ${target} (and any further source links).`);
        warnedMissingOrigin = true;
      }
      return full;
    }
    return `[${text}](${originUrl}/blob/${defaultBranch}${target})`;
  });
  return result;
}

// --- cache -------------------------------------------------------------------

function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

// --- discovery -----------------------------------------------------------

/** Recursively lists openwiki markdown source pages, relative to WIKI_SRC, excluding metadata files. */
function listSourcePages(dir, base = dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourcePages(abs, base, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md") && !EXCLUDED_FILES.has(entry.name)) {
      acc.push(relative(base, abs));
    }
  }
  return acc;
}

function listOutputPages(dir, base = dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      listOutputPages(abs, base, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      acc.push(relative(base, abs));
    }
  }
  return acc;
}

// --- main ----------------------------------------------------------------

function main() {
  const originUrl = resolveOriginUrl();
  const defaultBranch = resolveDefaultBranch();
  const cache = loadCache();
  const nextCache = {};

  const sourcePages = listSourcePages(WIKI_SRC);

  for (const relPath of sourcePages) {
    const srcAbs = join(WIKI_SRC, relPath);
    const outAbs = join(OUT_DIR, relPath);
    const stat = statSync(srcAbs);
    const rawContent = readFileSync(srcAbs, "utf8");
    const hash = hashContent(rawContent);

    const cached = cache[relPath];
    const unchanged = cached && cached.mtimeMs === stat.mtimeMs && cached.hash === hash && existsSync(outAbs);

    if (unchanged) {
      nextCache[relPath] = cached;
      continue;
    }

    const { frontmatter, body } = buildFrontmatter(rawContent, relPath);
    const rewrittenBody = rewriteLinks(body, {
      originUrl,
      defaultBranch,
      warn: (msg) => console.warn(`[sync-openwiki] WARN: ${msg}`),
    });

    const output = serializeFrontmatter(frontmatter) + rewrittenBody;

    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, output);

    nextCache[relPath] = { mtimeMs: stat.mtimeMs, hash };
  }

  // Prune: delete output pages with no corresponding source page (1:1 parity).
  const expected = new Set(sourcePages);
  for (const relPath of listOutputPages(OUT_DIR)) {
    if (!expected.has(relPath)) {
      rmSync(join(OUT_DIR, relPath), { force: true });
    }
  }

  saveCache(nextCache);
}

main();
