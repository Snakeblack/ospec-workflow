#!/usr/bin/env node
// sync-handbook.mjs — transforms the handbook (../handbook/ by default, or the
// directory given with `--source <dir>`, relative to this web project) into
// ./src/content/docs/.
//
// Zero-dependency Node ESM script (only node: built-ins). Invoked by
// `predev`/`prebuild` in this project's package.json. The handbook remains
// the single source of truth; this script's output directory is always
// treated as generated — never hand-authored.
//
// Behavior:
//   - Injects a `title` frontmatter field (first heading, else humanized
//     filename); never overwrites an existing title, and never re-serializes
//     (and thereby loses) pre-existing nested/multiline frontmatter structure.
//   - Strips the page's leading H1 from the transformed body: Starlight
//     already renders the frontmatter `title` as the page H1, so keeping the
//     source heading would duplicate the title on every page.
//   - Emits `src/sidebar.generated.json` (language, top links, groups) so
//     astro.config.mjs can render a coherent sidebar: the quickstart page
//     first, then the groups in the order, labels and audience badges the
//     handbook's `handbook.json` manifest declares. Directories the manifest
//     does not name go last, alphabetically, with humanized labels.
//   - Rewrites links to repository source files into remote-repository URLs
//     on the default branch; leaves handbook-internal links untouched.
//   - Skips rewriting (with a warning, exit 0) when no `origin` remote is
//     configured — this script must never fail predev/prebuild for that.
//   - Incremental: skips re-transforming pages whose source mtime AND
//     content hash are unchanged since the last run.
//   - Maintains strict 1:1 parity: prunes output pages whose source was
//     deleted.
//
// Failure policy: this script always degrades — it warns and continues
// rather than crashing `predev`/`prebuild`. A per-page failure, an invalid
// handbook.json, a corrupt or unwritable cache, or a missing/empty source
// never take down the whole run; a missing/empty handbook aborts BEFORE
// touching the output directory at all, so it can never be mistaken for
// "everything was deleted" and prune the existing site down to nothing.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

const CWD = process.cwd();

/** The handbook directory: `--source <dir>` (relative to this web project), default ../handbook. */
function resolveSourceDir(argv) {
  const index = argv.indexOf("--source");
  const value = index === -1 ? null : argv[index + 1];
  return resolve(CWD, value && !value.startsWith("--") ? value : join("..", "handbook"));
}

const WIKI_SRC = resolveSourceDir(process.argv.slice(2));
// Repository-relative path of the handbook (`handbook`, `docs/handbook`):
// links written as `/<that path>/page.md` are handbook-internal.
const WIKI_REPO_PREFIX = `/${relative(join(CWD, ".."), WIKI_SRC).split(sep).join("/")}/`;
const OUT_DIR = join(CWD, "src", "content", "docs");
const CACHE_PATH = join(CWD, ".sync-cache.json");
const SIDEBAR_MANIFEST_PATH = join(CWD, "src", "sidebar.generated.json");
const QUICKSTART_PAGE = "quickstart.md";
const EXCLUDED_FILES = new Set(["_plan.md"]);
const MANIFEST_PATH = join(WIKI_SRC, "handbook.json");
const DEFAULT_LANGUAGE = "en";
const LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;

function warn(message) {
  console.warn(`[sync-handbook] WARN: ${message}`);
}

// --- git helpers -------------------------------------------------------------

function runGit(args) {
  return execFileSync("git", args, { cwd: CWD, encoding: "utf8" }).trim();
}

/**
 * Resolves the origin's public web URL (https://host/path), normalizing the
 * scp-like `git@host:path` form and URL forms (https, ssh, git). It never
 * keeps the URL's user or password: a token clone
 * (https://user:TOKEN@host/repo) would otherwise publish the token in every
 * rewritten link. Returns null when there is no origin or it cannot be parsed.
 */
function resolveOriginUrl() {
  try {
    const url = runGit(["remote", "get-url", "origin"]);
    if (!url) return null;
    return toPublicWebUrl(url);
  } catch {
    // No configured origin (or no git at all): rewriteLinks() itself already
    // warns per-link when it needs to skip a rewrite for this reason, so no
    // redundant warning here.
    return null;
  }
}

function toPublicWebUrl(remote) {
  const scpLike = remote.match(/^(?:[^@/:]+@)?([^/:]+):(?!\/)(.+)$/);
  if (scpLike && !/^[a-z][a-z0-9+.-]*:\/\//i.test(remote)) {
    return `https://${scpLike[1]}/${scpLike[2].replace(/\.git$/, "").replace(/^\/+/, "")}`;
  }
  try {
    const parsed = new URL(remote);
    if (!parsed.hostname) return null;
    // An ssh/git port is not the web port: keep it only for http(s) remotes.
    const host = /^https?:$/.test(parsed.protocol) ? parsed.host : parsed.hostname;
    return `https://${host}${parsed.pathname.replace(/\.git$/, "").replace(/\/+$/, "")}`;
  } catch {
    warn("the origin remote is not a URL this script understands; skipping source-link rewrite.");
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

/**
 * "external" (protocol URL or bare anchor) vs "source-file" (repo path
 * outside the handbook) vs "wiki-internal" (relative, or under the
 * handbook's repository path, e.g. /handbook/).
 */
function classifyLinkTarget(target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return "external";
  if (!target.startsWith("/")) return "wiki-internal";
  if (target.startsWith(WIKI_REPO_PREFIX)) return "wiki-internal";
  return "source-file";
}

/**
 * Rewrites a wiki-internal `.md` link to the extensionless slug URL that
 * Starlight actually serves (`architecture/overview.md` seen from the wiki
 * root -> `/architecture/overview/`). Relative targets resolve against the
 * CONTAINING page's directory, handbook-prefixed ones (`/handbook/`) against the site
 * root; `#anchor` fragments survive. Non-.md targets (images, assets)
 * return null and are left untouched.
 *
 * Wiki authors also write root-anchored bare links (`hooks-runtime/x.md`
 * from a page under `security/`), which strict relative resolution would
 * nest under the page's own directory. `sourcePageSet` (posix-relative
 * source paths) disambiguates: when the page-relative candidate is not a
 * real page but the root-anchored one is, the root interpretation wins.
 */
function toWikiSlugUrl(target, pageRelPath, sourcePageSet) {
  const hashIdx = target.indexOf("#");
  const pathPart = hashIdx === -1 ? target : target.slice(0, hashIdx);
  const anchor = hashIdx === -1 ? "" : target.slice(hashIdx);
  if (!pathPart.endsWith(".md")) return null;

  let resolved;
  if (pathPart.startsWith(WIKI_REPO_PREFIX)) {
    resolved = pathPart.slice(WIKI_REPO_PREFIX.length);
  } else {
    const pageDir = dirname(pageRelPath.split(sep).join("/"));
    resolved = posix.normalize(posix.join(pageDir === "." ? "" : pageDir, pathPart));
    if (!sourcePageSet.has(resolved)) {
      const rootCandidate = posix.normalize(pathPart);
      if (!rootCandidate.startsWith("..") && sourcePageSet.has(rootCandidate)) {
        resolved = rootCandidate;
      }
    }
  }
  if (resolved.startsWith("..")) return null; // escapes the wiki root: leave as-is

  return `/${resolved.replace(/\.md$/, "")}/${anchor}`;
}

/**
 * Rewrites source-file links to {originUrl}/blob/{branch}/{path} and
 * wiki-internal .md links to local extensionless slug URLs; external links
 * pass through untouched.
 */
function rewriteLinks(body, { originUrl, defaultBranch, pageRelPath, sourcePageSet, warn: warnFn }) {
  let warnedMissingOrigin = false;
  return body.replace(LINK_RE, (full, text, target) => {
    const kind = classifyLinkTarget(target);
    if (kind === "external") {
      return full;
    }
    if (kind === "wiki-internal") {
      const slugUrl = toWikiSlugUrl(target, pageRelPath, sourcePageSet);
      return slugUrl ? `[${text}](${slugUrl})` : full;
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
 * Reads and validates the handbook manifest (`handbook.json`):
 *   { "language": "es", "web": true,
 *     "groups": [{ "directory": "idd", "label": "...", "audience": "..." }] }
 * `language` and each `audience` are optional. A missing file returns null
 * silently (alphabetical groups, English UI); an unreadable or invalid one
 * warns and returns null too, so the build never breaks over it.
 */
function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch (err) {
    return invalidManifest(`it is not valid JSON (${err.message})`);
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return invalidManifest("it is not a JSON object");
  }
  if (manifest.language !== undefined && (typeof manifest.language !== "string" || !LANGUAGE_RE.test(manifest.language))) {
    return invalidManifest(`"language" must be a language code such as "en" or "es"`);
  }
  if (!Array.isArray(manifest.groups)) {
    return invalidManifest(`"groups" must be an array`);
  }
  const seen = new Set();
  for (const [index, group] of manifest.groups.entries()) {
    const where = `groups[${index}]`;
    if (!group || typeof group !== "object" || Array.isArray(group)) return invalidManifest(`${where} is not an object`);
    if (!isNonEmptyString(group.directory) || /[\\/]/.test(group.directory)) {
      return invalidManifest(`${where}.directory must be a top-level directory name`);
    }
    if (seen.has(group.directory)) return invalidManifest(`${where}.directory "${group.directory}" is repeated`);
    seen.add(group.directory);
    if (!isNonEmptyString(group.label)) return invalidManifest(`${where}.label must be a non-empty string`);
    if (group.audience !== undefined && !isNonEmptyString(group.audience)) {
      return invalidManifest(`${where}.audience must be a non-empty string when present`);
    }
  }
  return { language: manifest.language || DEFAULT_LANGUAGE, groups: manifest.groups };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function invalidManifest(reason) {
  warn(`ignoring ${MANIFEST_PATH}: ${reason}; groups fall back to alphabetical order with directory names.`);
  return null;
}

/**
 * Builds the sidebar manifest consumed by astro.config.mjs:
 *   - language: the handbook's language (Starlight UI locale).
 *   - topLinks: root-level pages, quickstart always first, labelled with
 *     each page's resolved title.
 *   - groups: the handbook.json groups in their declared order (label, and
 *     the audience as badge text), then every directory the manifest does
 *     not name, alphabetically with its humanized name. A declared group
 *     whose directory holds no page is skipped. Both cases warn.
 */
function buildSidebarManifest(sourcePages, titlesByPage, manifest) {
  const rootPages = sourcePages.filter((p) => !p.includes(sep));
  const dirs = new Set(sourcePages.filter((p) => p.includes(sep)).map((p) => p.split(sep)[0]));

  const groups = [];
  for (const group of manifest ? manifest.groups : []) {
    if (!dirs.has(group.directory)) {
      warn(`handbook.json names the group "${group.directory}", which has no pages; leaving it out of the sidebar.`);
      continue;
    }
    dirs.delete(group.directory);
    groups.push({
      label: group.label,
      directory: group.directory,
      ...(group.audience ? { badge: group.audience } : {}),
    });
  }
  const unnamed = [...dirs].sort((a, b) => a.localeCompare(b));
  if (manifest && unnamed.length > 0) {
    warn(`handbook.json does not name ${unnamed.join(", ")}; adding them last with their directory names.`);
  }
  for (const dir of unnamed) groups.push({ label: humanizeDirName(dir), directory: dir });

  const topLinks = rootPages
    .sort((a, b) =>
      a === QUICKSTART_PAGE ? -1 : b === QUICKSTART_PAGE ? 1 : a.localeCompare(b)
    )
    .map((page) => ({
      label: titlesByPage.get(page) || humanizeFilename(page),
      link: `/${page.replace(/\.md$/, "")}`,
    }));

  return { language: manifest ? manifest.language : DEFAULT_LANGUAGE, topLinks, groups };
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
 * Recursively lists the handbook's markdown pages, relative to WIKI_SRC.
 * Excludes scratch files (EXCLUDED_FILES) because those live alongside real
 * content in the handbook and must never be treated as
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

  // Guard: an absent or empty handbook must never be interpreted as "every
  // page was deleted". Abort BEFORE resolving git context, touching the
  // cache, or reaching the prune step below — the existing web-doc output
  // (if any) is left completely untouched.
  if (sourcePages.length === 0) {
    warn(
      `no handbook pages found under ${WIKI_SRC} (the directory is missing or empty); ` +
        `skipping this sync entirely rather than pruning ${OUT_DIR} down to nothing.`
    );
    return;
  }

  const originUrl = resolveOriginUrl();
  const defaultBranch = resolveDefaultBranch();
  const sourcePageSet = new Set(sourcePages.map((p) => p.split(sep).join("/")));
  const cache = loadCache();
  const nextCache = {};
  const failures = [];
  const titlesByPage = new Map();

  for (const relPath of sourcePages) {
    try {
      const srcAbs = join(WIKI_SRC, relPath);
      const outAbs = join(OUT_DIR, relPath);
      const stat = statSync(srcAbs);
      const rawContent = readFileSync(srcAbs, "utf8");
      const hash = hashContent(rawContent);

      titlesByPage.set(relPath, resolvePageTitle(rawContent, relPath));

      const cached = cache[relPath];
      const unchanged = cached && cached.mtimeMs === stat.mtimeMs && cached.hash === hash && existsSync(outAbs);

      if (unchanged) {
        nextCache[relPath] = cached;
        continue;
      }

      const { block, body } = buildFrontmatterBlock(rawContent, relPath);
      const rewrittenBody = rewriteLinks(body, { originUrl, defaultBranch, pageRelPath: relPath, sourcePageSet, warn });

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

  saveSidebarManifest(buildSidebarManifest(sourcePages, titlesByPage, loadManifest()));
  saveCache(nextCache);

  if (failures.length > 0) {
    warn(`sync finished with ${failures.length} page(s) failed and skipped: ${failures.join(", ")}`);
  }
}

main();
