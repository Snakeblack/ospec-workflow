"use strict";

const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");

const { mkdirOspec } = require("./ospec-gitignore.js");

const CACHE_VERSION = 2;

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }

  return left > right ? 1 : 0;
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function collectFiles(root, include) {
  const files = [];

  async function visit(directory) {
    let entries;

    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    entries.sort((left, right) => compareStrings(left.name, right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() && include(absolutePath)) {
        files.push(absolutePath);
      }
    }
  }

  await visit(root);
  return files;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return { attributes: {}, body: content };
  }

  const attributes = {};

  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");

    if (separator === -1 || /^\s/.test(line)) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");

    attributes[key] = value;
  }

  return {
    attributes,
    body: content.slice(match[0].length),
  };
}

function extractTriggers(description, fallback) {
  const match = description.match(/\bTrigger:\s*(.+)$/i);

  if (!match) {
    return [fallback];
  }

  const triggers = match[1]
    .split(/[,;]/)
    .map((trigger) => trigger.trim())
    .filter(Boolean);

  return triggers.length > 0 ? triggers : [fallback];
}

function extractCapabilities(raw) {
  if (typeof raw !== "string") {
    return [];
  }
  let str = raw.trim();
  if (str.startsWith("[")) {
    str = str.slice(1);
  }
  if (str.endsWith("]")) {
    str = str.slice(0, -1);
  }
  return str
    .split(/[,;]/)
    .map((cap) => cap.trim())
    .filter(Boolean);
}

// Only explicit rules sections feed compact rules: anti-patterns, patterns,
// gates and activation lists read as instructions once injected out of context.
const RULES_HEADING = /^(?:[\w-]+\s+){0,3}rules$|^reglas(?:\s+\S+){0,3}$/i;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;

function isRulesHeading(text) {
  return RULES_HEADING.test(text) && !/\banti/i.test(text);
}

function extractCompactRules(skillMarkdown) {
  const { body } = parseFrontmatter(skillMarkdown);
  const rules = [];
  let inRulesSection = false;

  function addRule(value) {
    const rule = value.replace(LIST_ITEM, "").trim();

    if (rule && !rules.includes(rule)) {
      rules.push(rule);
    }
  }

  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/);

    if (heading) {
      inRulesSection = isRulesHeading(heading[1]);
      continue;
    }

    if (!inRulesSection) {
      continue;
    }

    if (LIST_ITEM.test(line)) {
      addRule(line);
      continue;
    }

    if (/^\|.+\|$/.test(line) && !/^\|[\s:|-]+\|$/.test(line)) {
      const columns = line
        .split("|")
        .slice(1, -1)
        .map((column) => column.trim());
      const label = columns[0]?.toLowerCase();

      if (columns.length >= 2 && label !== "rule" && label !== "gate") {
        addRule(`${columns[0]}: ${columns.slice(1).join(" - ")}`);
      }
    }
  }

  return rules.slice(0, 15);
}

function shouldIncludeSkill(relativePath) {
  const skillDirectory = relativePath.split("/")[1] || "";

  return (
    relativePath.startsWith("skills/") &&
    relativePath.endsWith("/SKILL.md") &&
    skillDirectory !== "_shared" &&
    skillDirectory !== "skill-registry" &&
    !skillDirectory.startsWith("sdd-") &&
    !path.posix.basename(path.posix.dirname(relativePath)).startsWith("sdd-")
  );
}

async function hasOspecIdentity(skillsRoot, skillFiles) {
  for (const file of skillFiles) {
    const relativePath = toPortablePath(path.relative(skillsRoot, file));
    if (relativePath.startsWith("_shared/") && file.endsWith(".md")) {
      return true;
    }
    if (relativePath === "skill-registry/SKILL.md") {
      return true;
    }
  }

  const manifestInRoot = path.join(skillsRoot, ".ospec-workflow-install.json");
  const manifestInParent = path.join(path.dirname(skillsRoot), ".ospec-workflow-install.json");

  for (const manifestPath of [manifestInRoot, manifestInParent]) {
    try {
      const stat = await fs.stat(manifestPath);
      if (stat.isFile()) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

async function discoverSkills(root, {
  skillsRoot = path.join(root, "skills"),
  requireSkills = false,
} = {}) {
  const absoluteRoot = path.resolve(root);
  skillsRoot = path.resolve(skillsRoot);
  const externalSkills = path.relative(path.join(absoluteRoot, "skills"), skillsRoot) !== "";
  const rulesRoot = path.join(absoluteRoot, "rules");
  const [skillFiles, ruleFiles] = await Promise.all([
    collectFiles(skillsRoot, (filePath) => {
      const relativePath = toPortablePath(path.relative(skillsRoot, filePath));

      return (
        path.basename(filePath) === "SKILL.md" ||
        (relativePath.startsWith("_shared/") && filePath.endsWith(".md"))
      );
    }),
    collectFiles(rulesRoot, (filePath) => filePath.endsWith(".md")),
  ]);

  // Optional project skills may be absent. A hook's required bundle must not
  // silently replace a working registry with the SHA of an empty input set.
  if (requireSkills) {
    if (!skillFiles.some((file) => path.basename(file) === "SKILL.md")) {
      throw new Error(`No SKILL.md files found in required skills root: ${skillsRoot}`);
    }
    if (externalSkills && !(await hasOspecIdentity(skillsRoot, skillFiles))) {
      throw new Error(`No OSpec identity anchors found in required external skills root: ${skillsRoot}`);
    }
  }

  const allCandidates = [
    ...skillFiles.map((absolutePath) => ({
      absolutePath,
      relativePath: `skills/${toPortablePath(path.relative(skillsRoot, absolutePath))}`,
      isSkill: true,
    })),
    ...ruleFiles.map((absolutePath) => ({
      absolutePath,
      relativePath: toPortablePath(path.relative(absoluteRoot, absolutePath)),
      isSkill: false,
    })),
  ].sort((left, right) =>
    compareStrings(left.relativePath, right.relativePath),
  );

  const fingerprintPaths = [];
  const skills = [];

  for (const file of allCandidates) {
    let content;
    let readOk = true;
    try {
      content = await fs.readFile(file.absolutePath);
    } catch (error) {
      readOk = false;
      console.error(`Warning: failed to read skill file ${file.absolutePath}: ${error.message}`);
      content = Buffer.alloc(0);
    }

    fingerprintPaths.push({
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      content,
    });

    if (readOk && file.isSkill && shouldIncludeSkill(file.relativePath)) {
      const markdown = content.toString("utf8");
      const { attributes } = parseFrontmatter(markdown);
      const fallbackName = path.basename(path.dirname(file.absolutePath));
      const id = attributes.name || fallbackName;

      skills.push({
        id,
        path: externalSkills ? toPortablePath(file.absolutePath) : file.relativePath,
        triggers: extractTriggers(attributes.description || "", id),
        compact_rules: extractCompactRules(markdown),
        capabilities: extractCapabilities(attributes.capabilities || ""),
      });
    }
  }

  skills.sort((left, right) => compareStrings(left.id, right.id));

  return { fingerprintPaths, skills };
}

function normalizeFingerprintPath(entry) {
  if (typeof entry === "string") {
    return {
      absolutePath: path.resolve(entry),
      relativePath: toPortablePath(entry),
      content: undefined,
    };
  }

  if (
    entry &&
    typeof entry.absolutePath === "string" &&
    typeof entry.relativePath === "string"
  ) {
    return {
      absolutePath: path.resolve(entry.absolutePath),
      relativePath: toPortablePath(entry.relativePath),
      content: entry.content !== undefined ? entry.content : undefined,
    };
  }

  throw new TypeError(
    "Fingerprint paths must be file paths or { absolutePath, relativePath } objects.",
  );
}

async function calculateFingerprint(paths) {
  const files = paths
    .map(normalizeFingerprintPath)
    .sort((left, right) =>
      compareStrings(left.relativePath, right.relativePath),
    );
  const hash = crypto.createHash("sha256");

  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    let content = file.content;
    if (content === undefined) {
      try {
        content = await fs.readFile(file.absolutePath);
      } catch {
        content = Buffer.alloc(0);
      }
    }
    hash.update(content);
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}

async function readRegistryCache(cachePath) {
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

async function writeRegistryCache(cachePath, data) {
  mkdirOspec(path.dirname(cachePath));

  const temporaryPath = `${cachePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let writeFailed = false;

  try {
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(data, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(temporaryPath, cachePath);
  } catch (error) {
    writeFailed = true;
    throw error;
  } finally {
    try {
      await fs.rm(temporaryPath, { force: true });
    } catch (error) {
      if (!writeFailed && error.code !== "ENOENT") {
        throw error;
      } else if (error.code !== "ENOENT") {
        console.error(`Warning: failed to remove temporary cache file ${temporaryPath}: ${error.message}`);
      }
    }
  }
}

function canonicalPath(directory) {
  try {
    return fsSync.realpathSync(directory);
  } catch {
    return path.resolve(directory);
  }
}

// Global Codex installs split scripts (~/.codex/ospec-workflow) from skills
// (~/.agents/skills). Source and generated bundles retain root/skills.
function resolveSkillsRoot({ pluginRoot, target, homeDir, codexHome }) {
  const installedRoots = [path.join(homeDir, ".codex", "ospec-workflow")];
  if (typeof codexHome === "string" && path.isAbsolute(codexHome)) {
    installedRoots.push(path.join(codexHome, "ospec-workflow"));
  }
  const canonicalPluginRoot = canonicalPath(pluginRoot);
  const installedCodex = target === "codex" && installedRoots.some(
    (root) => path.relative(canonicalPath(root), canonicalPluginRoot) === "",
  );
  return installedCodex ? path.join(homeDir, ".agents", "skills") : path.join(pluginRoot, "skills");
}

// What an entry lacks to serve a delegation: rules to inject, or a way to be
// matched other than its own name (a `Trigger:` or a capability).
function registryGaps(skills) {
  const gaps = [];
  for (const skill of skills) {
    const missing = [];
    if (skill.compact_rules.length === 0) missing.push("rules");
    const nameOnly = skill.triggers.length === 1 && skill.triggers[0] === skill.id;
    if (nameOnly && skill.capabilities.length === 0) missing.push("trigger");
    if (missing.length > 0) gaps.push({ id: skill.id, missing });
  }
  return gaps;
}

// The one builder of the cache, shared by the SessionStart hook and
// `ospec registry`: reuses a cache whose inputs and entries match, writes it
// otherwise. `describeWorkspace` federates the workspace shape (null in
// single-repo mode).
async function refreshRegistryCache({ cachePath, pluginRoot, skillsRoot, now = () => new Date(), describeWorkspace }) {
  const registry = await discoverSkills(pluginRoot, { skillsRoot, requireSkills: true });
  const fingerprint = await calculateFingerprint(registry.fingerprintPaths);
  const currentCache = await readRegistryCache(cachePath);
  const cacheHit =
    currentCache?.version === CACHE_VERSION &&
    currentCache.fingerprint === fingerprint &&
    isDeepStrictEqual(currentCache.skills, registry.skills);

  if (!cacheHit) {
    const cache = {
      version: CACHE_VERSION,
      fingerprint,
      generated_at: now().toISOString(),
      skills: registry.skills,
    };
    const workspaceContext = describeWorkspace ? await describeWorkspace() : null;
    if (workspaceContext) {
      cache.workspace = workspaceContext;
    }
    await writeRegistryCache(cachePath, cache);
  }

  return { status: cacheHit ? "reused" : "generated", skills: registry.skills };
}

module.exports = {
  CACHE_VERSION,
  calculateFingerprint,
  collectFiles,
  discoverSkills,
  extractCapabilities,
  extractCompactRules,
  hasOspecIdentity,
  readRegistryCache,
  refreshRegistryCache,
  registryGaps,
  resolveSkillsRoot,
  writeRegistryCache,
};
