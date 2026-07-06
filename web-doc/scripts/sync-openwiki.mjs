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
//     filename); never overwrites an existing title, and never re-serializes
//     (and thereby loses) pre-existing nested/multiline frontmatter structure.
//   - Strips the page's leading H1 from the transformed body: Starlight
//     already renders the frontmatter `title` as the page H1, so keeping the
//     source heading would duplicate the title on every page.
//   - Emits `src/sidebar.generated.json` (top links + groups) so
//     astro.config.mjs can render a coherent sidebar: the quickstart page
//     first, then one group per wiki subdirectory ordered by first mention
//     in the quickstart's own links (alphabetical for unmentioned ones).
//   - Rewrites links to repository source files into remote-repository URLs
//     on the default branch; leaves wiki-internal links untouched.
//   - Skips rewriting (with a warning, exit 0) when no `origin` remote is
//     configured — this script must never fail predev/prebuild for that.
//   - Incremental: skips re-transforming pages whose source mtime AND
//     content hash are unchanged since the last run.
//   - Maintains strict 1:1 parity: prunes output pages whose source was
//     deleted.
//
// Failure policy: this script always degrades — it warns and continues
// rather than crashing `predev`/`prebuild`. A per-page failure, a corrupt or
// unwritable cache, or a missing/empty source never take down the whole
// run; a missing/empty openwiki/ source aborts BEFORE touching the output
// directory at all, so it can never be mistaken for "everything was deleted"
// and prune the existing site down to nothing.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

const CWD = process.cwd();
const WIKI_SRC = join(CWD, "..", "openwiki");
const OUT_DIR = join(CWD, "src", "content", "docs");
const CACHE_PATH = join(CWD, ".sync-cache.json");
const SIDEBAR_MANIFEST_PATH = join(CWD, "src", "sidebar.generated.json");
const QUICKSTART_PAGE = "quickstart.md";
const EXCLUDED_FILES = new Set([".last-update.json", "_plan.md"]);

function warn(message) {
  console.warn(`[sync-openwiki] WARN: ${message}`);
}

// --- git helpers -------------------------------------------------------------

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
    // No configured origin (or no git at all): rewriteLinks() itself already
    // warns per-link when it needs to skip a rewrite for this reason, so no
    // redundant warning here.
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
    warn(
      `could not resolve the repository's default branch from 'origin/HEAD' ` +
        `(no origin configured, no git repository, or its HEAD ref is not tracked locally); ` +
        `falling back to "main". Any rewritten source-file links will use "main" as the ref.`
    );
    return "main";
  }
}

// --- frontmatter -------------------------------------------------------------

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Splits `---\nYAML\n---\nBODY` into the RAW (unparsed) frontmatter block text and the body. */
function splitFrontmatter(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { hasFrontmatter: false, rawFrontmatter: "", body: content };
  }
  return { hasFrontmatter: true, rawFrontmatter: match[1], body: match[2] };
}

/**
 * Reads a ROOT-LEVEL (non-indented) `key: value` line out of a raw
 * frontmatter block, or null when absent. The pattern has no leading `\s*`,
 * so it only matches a line that starts at column 0 with `key:` — a nested
 * line such as `  order: 1` (under `sidebar:`) or a list item never matches.
 * This lets us detect an existing top-level `title` without parsing (and
 * therefore risking mangling) the rest of the YAML structure.
 */
function extractRootScalar(rawFrontmatter, key) {
  const match = rawFrontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
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

// JSON.stringify on a plain string produces a double-quoted scalar with the
// same escaping rules (quotes, backslashes, control characters) that YAML's
// own double-quoted scalar syntax expects. That makes it a safe, minimal
// quoter for a single string frontmatter value without pulling in a full
// YAML serializer — it is NEVER used to re-serialize a whole frontmatter
// block (see buildFrontmatterBlock below), only a single injected line.
function quoteYamlString(value) {
  return JSON.stringify(value);
}

/**
 * Removes the body's leading H1 (its first non-blank line, when it is a
 * `# heading`). Starlight renders the frontmatter `title` as the page H1,
 * so a kept source heading would print the title twice on every page.
 */
function stripLeadingH1(body) {
  return body.replace(/^\s*#[ \t]+[^\n]*\r?\n?/, "");
}

/**
 * Resolves the exact frontmatter block + body to write for a transformed
 * page, WITHOUT ever re-serializing pre-existing frontmatter structure.
 * A naive "parse into a flat object, then re-emit `key: value` lines" round
 * trip silently drops nested keys, multiline scalars, and lists — this
 * function never does that. Three cases:
 *   1. No frontmatter at all -> synthesize a minimal new block with just `title`.
 *   2. Frontmatter already has a root-level `title` -> byte-for-byte
 *      passthrough of the frontmatter block.
 *   3. Frontmatter exists but has no `title` -> PREPEND a `title:` line onto
 *      the ORIGINAL raw block text; every other line is left untouched.
 * In every case the resolved page `title` is also returned (the sidebar
 * manifest needs it) and the body's leading H1 is stripped.
 */
function buildFrontmatterBlock(sourceContent, relPath) {
  const { hasFrontmatter, rawFrontmatter, body } = splitFrontmatter(sourceContent);

  if (!hasFrontmatter) {
    const title = extractFirstHeading(sourceContent) || humanizeFilename(relPath);
    return {
      block: `---\ntitle: ${quoteYamlString(title)}\n---\n`,
      body: stripLeadingH1(sourceContent),
      title,
    };
  }

  const existingTitle = extractRootScalar(rawFrontmatter, "title");
  if (existingTitle) {
    return {
      block: `---\n${rawFrontmatter}\n---\n`,
      body: stripLeadingH1(body),
      title: existingTitle,
    };
  }

  const derivedTitle = extractFirstHeading(body) || humanizeFilename(relPath);
  const injectedBlock = `title: ${quoteYamlString(derivedTitle)}\n${rawFrontmatter}`;
  return {
    block: `---\n${injectedBlock}\n---\n`,
    body: stripLeadingH1(body),
    title: derivedTitle,
  };
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
function rewriteLinks(body, { originUrl, defaultBranch, warn: warnFn }) {
  let warnedMissingOrigin = false;
  return body.replace(LINK_RE, (full, text, target) => {
    if (classifyLinkTarget(target) !== "source-file") {
      return full;
    }
    if (!originUrl) {
      if (!warnedMissingOrigin) {
        warnFn(`No 'origin' remote configured; skipping source-link rewrite for ${target} (and any further source links).`);
        warnedMissingOrigin = true;
      }
      return full;
    }
    return `[${text}](${originUrl}/blob/${defaultBranch}${target})`;
  });
}

// --- sidebar manifest ----------------------------------------------------

/** Resolves a page's display title without transforming it (manifest use). */
function resolvePageTitle(sourceContent, relPath) {
  const { hasFrontmatter, rawFrontmatter, body } = splitFrontmatter(sourceContent);
  const existing = hasFrontmatter ? extractRootScalar(rawFrontmatter, "title") : null;
  return (
    existing ||
    extractFirstHeading(hasFrontmatter ? body : sourceContent) ||
    humanizeFilename(relPath)
  );
}

/** "hooks-runtime" -> "Hooks Runtime" (sidebar group label). */
function humanizeDirName(dir) {
  return dir
    .split(/[-_]/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Builds the sidebar manifest consumed by astro.config.mjs:
 *   - topLinks: root-level wiki pages, quickstart always first, labelled with
 *     each page's resolved title.
 *   - groups: one per wiki subdirectory, ordered by the directory's first
 *     mention among the quickstart page's own links (the quickstart is the
 *     generator-maintained narrative index), alphabetical for directories
 *     the quickstart never mentions.
 */
function buildSidebarManifest(sourcePages, titlesByPage, quickstartRaw) {
  const rootPages = sourcePages.filter((p) => !p.includes(sep));
  const dirs = [...new Set(sourcePages.filter((p) => p.includes(sep)).map((p) => p.split(sep)[0]))];

  const mentionOrder = new Map();
  if (quickstartRaw) {
    let match;
    let next = 0;
    const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
    while ((match = linkRe.exec(quickstartRaw))) {
      for (const dir of dirs) {
        if (!mentionOrder.has(dir) && match[1].includes(`${dir}/`)) {
          mentionOrder.set(dir, next++);
        }
      }
    }
  }
  dirs.sort((a, b) => {
    const ia = mentionOrder.has(a) ? mentionOrder.get(a) : Infinity;
    const ib = mentionOrder.has(b) ? mentionOrder.get(b) : Infinity;
    return ia !== ib ? ia - ib : a.localeCompare(b);
  });

  const topLinks = rootPages
    .sort((a, b) =>
      a === QUICKSTART_PAGE ? -1 : b === QUICKSTART_PAGE ? 1 : a.localeCompare(b)
    )
    .map((page) => ({
      label: titlesByPage.get(page) || humanizeFilename(page),
      link: `/${page.replace(/\.md$/, "")}`,
    }));

  return {
    topLinks,
    groups: dirs.map((dir) => ({ label: humanizeDirName(dir), directory: dir })),
  };
}

function saveSidebarManifest(manifest) {
  try {
    mkdirSync(dirname(SIDEBAR_MANIFEST_PATH), { recursive: true });
    writeFileSync(SIDEBAR_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (err) {
    warn(
      `failed to write ${SIDEBAR_MANIFEST_PATH} (${err.message}); astro.config.mjs will fall ` +
        `back to Starlight's default autogenerated sidebar. The sync itself still completed.`
    );
  }
}

// --- cache -------------------------------------------------------------------

function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch (err) {
    warn(`${CACHE_PATH} is unreadable or corrupt (${err.message}); ignoring it and performing a full re-sync.`);
    return {};
  }
}

function saveCache(cache) {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (err) {
    warn(
      `failed to write ${CACHE_PATH} (${err.message}); the incremental cache was not updated, so the ` +
        `next run will re-transform every page. The sync itself still completed successfully.`
    );
  }
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

// --- discovery -----------------------------------------------------------

/**
 * Recursively lists openwiki markdown source pages, relative to WIKI_SRC.
 * Excludes metadata/scratch files (EXCLUDED_FILES) because those live
 * alongside real content under openwiki/ and must never be treated as wiki
 * pages. `listOutputPages` below needs no equivalent exclusion list: this
 * script is the ONLY writer of `OUT_DIR`, and it only ever writes
 * transformed `.md` pages there, so nothing extraneous can appear.
 */
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
  const sourcePages = listSourcePages(WIKI_SRC);

  // Guard: an absent or empty openwiki/ must never be interpreted as "every
  // page was deleted". Abort BEFORE resolving git context, touching the
  // cache, or reaching the prune step below — the existing web-doc output
  // (if any) is left completely untouched.
  if (sourcePages.length === 0) {
    warn(
      `no openwiki pages found under ${WIKI_SRC} (the directory is missing or empty); ` +
        `skipping this sync entirely rather than pruning ${OUT_DIR} down to nothing.`
    );
    return;
  }

  const originUrl = resolveOriginUrl();
  const defaultBranch = resolveDefaultBranch();
  const cache = loadCache();
  const nextCache = {};
  const failures = [];
  const titlesByPage = new Map();
  let quickstartRaw = null;

  for (const relPath of sourcePages) {
    try {
      const srcAbs = join(WIKI_SRC, relPath);
      const outAbs = join(OUT_DIR, relPath);
      const stat = statSync(srcAbs);
      const rawContent = readFileSync(srcAbs, "utf8");
      const hash = hashContent(rawContent);

      titlesByPage.set(relPath, resolvePageTitle(rawContent, relPath));
      if (relPath === QUICKSTART_PAGE) quickstartRaw = rawContent;

      const cached = cache[relPath];
      const unchanged = cached && cached.mtimeMs === stat.mtimeMs && cached.hash === hash && existsSync(outAbs);

      if (unchanged) {
        nextCache[relPath] = cached;
        continue;
      }

      const { block, body } = buildFrontmatterBlock(rawContent, relPath);
      const rewrittenBody = rewriteLinks(body, { originUrl, defaultBranch, warn });

      mkdirSync(dirname(outAbs), { recursive: true });
      writeFileSync(outAbs, `${block}\n${rewrittenBody}`);

      nextCache[relPath] = { mtimeMs: stat.mtimeMs, hash };
    } catch (err) {
      failures.push(relPath);
      warn(`failed to sync page "${relPath}" (${err.message}); skipping it and continuing with the rest.`);
    }
  }

  // Prune: delete output pages with no corresponding source page (1:1 parity).
  const expected = new Set(sourcePages);
  for (const relPath of listOutputPages(OUT_DIR)) {
    if (!expected.has(relPath)) {
      try {
        rmSync(join(OUT_DIR, relPath), { force: true });
      } catch (err) {
        warn(`failed to prune stale output page "${relPath}" (${err.message}); leaving it in place.`);
      }
    }
  }

  saveSidebarManifest(buildSidebarManifest(sourcePages, titlesByPage, quickstartRaw));
  saveCache(nextCache);

  if (failures.length > 0) {
    warn(`sync finished with ${failures.length} page(s) failed and skipped: ${failures.join(", ")}`);
  }
}

main();
