"use strict";

// Roadmap E0.1: worker agents run inside consumer projects, which have no
// `skills/` tree, so a relative "read skills/<x>/SKILL.md" fails there. This
// pure helper makes a worker agent self-contained: it embeds the agent's own
// skill, the modules in that skill's directory, and the `_shared` files the
// agent or those files name, then rewrites each reference to an embedded
// section marker «id». `_shared` files are leaves, except the review judgment's
// conditional SDD envelope; other references are relabelled as installed skills.

const posix = require("node:path").posix;
const { parse } = require("./frontmatter.js");

// A path-like token ending in `.md` or `/`. Resolution decides whether it is
// an ospec file; artifacts (`tasks.md`) and project paths stay untouched.
const PATH_TOKEN = /(?<![A-Za-z0-9_./{}*-])((?:\.{1,2}\/)*[A-Za-z0-9_{}*.-]+(?:\/[A-Za-z0-9_{}*.-]+)*(?:\.md|\/))(?![A-Za-z0-9_/-])/g;
const MD_LINK = /\[([^\]\n]*)\]\(([^)\s]+)\)/g;
const SHARED_DIR = "skills/_shared/";
// Phase skills open with a blockquote telling an orchestrator that loaded the
// skill to delegate instead; inside the worker it embeds into, it is noise.
const ORCHESTRATOR_GATE = /^\s*> \*\*ORCHESTRATOR GATE\*\*[^\n]*\n(?:>[^\n]*\n)*/;

function embedAgentReferences({ agentPath, content, sources, withSdd = false }) {
  const name = posix.basename(agentPath).replace(/\.agent\.md$/, "");
  const skillDir = `skills/${name}/`;
  const ownSkill = `${skillDir}SKILL.md`;
  if (!sources.has(ownSkill)) return content; // coordinators keep their text

  const ctx = { sources, name, skillDir, ownSkill, agentPath, withSdd };
  const embedded = collectEmbedded(content, ctx);
  const ids = assignIds(embedded, ctx);

  const sections = embedded.map((filePath) => {
    const body = parse(sources.get(filePath)).body.replace(ORCHESTRATOR_GATE, "").replace(/^\s+|\s+$/g, "");
    return `### «${ids.get(filePath)}»\n\n${demoteHeadings(rewrite(body, filePath, ctx, ids))}\n`;
  });

  return [
    rewrite(content, agentPath, ctx, ids).replace(/\s+$/, ""),
    "",
    "## Embedded references",
    "",
    "Every reference in guillemets is embedded below. Read it here, never from disk: the project you work in does not contain the ospec skills. Load a conditional module only when its condition holds.",
    "",
    sections.join("\n"),
  ].join("\n");
}

// Breadth-first from the agent: own skill files are followed, `_shared`
// files are embedded but not followed.
function collectEmbedded(agentContent, ctx) {
  const embedded = [ctx.ownSkill];
  const queue = [[ctx.agentPath, agentContent], [ctx.ownSkill, ctx.sources.get(ctx.ownSkill)]];
  while (queue.length > 0) {
    const [fromPath, text] = queue.shift();
    for (const target of referencedFiles(text, fromPath, ctx)) {
      if (embedded.includes(target)) continue;
      if (target.startsWith(ctx.skillDir)) {
        embedded.push(target);
        queue.push([target, ctx.sources.get(target)]);
      } else if (target.startsWith(SHARED_DIR)) {
        embedded.push(target);
      }
    }
  }
  // Discovery reviewers share a dispatch contract. Its SDD envelope is a
  // conditional dependency, not an IDD phase procedure. Follow only that
  // existing reference when SDD is requested; other shared files stay leaves.
  const judgment = `${SHARED_DIR}review-judgment.md`;
  const sddCommon = `${SHARED_DIR}sdd-phase-common.md`;
  if (ctx.withSdd && embedded.includes(judgment) && !embedded.includes(sddCommon)
      && referencedFiles(ctx.sources.get(judgment), judgment, ctx).includes(sddCommon)) {
    embedded.push(sddCommon);
  }
  return embedded;
}

function referencedFiles(text, fromPath, ctx) {
  const found = [];
  for (const [, token] of String(text).matchAll(PATH_TOKEN)) {
    const resolved = resolve(token, fromPath, ctx);
    if (resolved && resolved.endsWith(".md")) found.push(resolved);
  }
  return found;
}

// Agent files resolve as if they lived in their own skill directory. A bare
// `SKILL.md` is ambiguous (every skill has one) and is never resolved.
function resolve(token, fromPath, ctx) {
  const ref = token.replace("{phase-name}", ctx.name);
  if (ref === "SKILL.md" || !/[A-Za-z]/.test(ref)) return null; // `./` alone names no file
  const fromDir = fromPath && fromPath.startsWith("skills/") ? posix.dirname(fromPath) : ctx.skillDir.slice(0, -1);
  const candidates = [];
  if (ref.startsWith("skills/")) candidates.push(ref);
  else if (ref.startsWith("./") || ref.startsWith("../")) candidates.push(posix.normalize(posix.join(fromDir, ref)));
  else {
    candidates.push(posix.join(fromDir, ref), `skills/${ref}`);
    if (!ref.includes("/")) candidates.push(`${SHARED_DIR}${ref}`);
  }
  return candidates.find((candidate) => candidate.startsWith("skills/") && exists(candidate, ctx.sources)) || null;
}

function exists(candidate, sources) {
  if (!candidate.endsWith("/")) return sources.has(candidate);
  for (const key of sources.keys()) if (key.startsWith(candidate)) return true;
  return false;
}

// The own skill is named after the agent; every other file after its basename,
// falling back to its skills-relative path on a collision.
function assignIds(embedded, ctx) {
  const ids = new Map();
  const taken = new Set();
  for (const filePath of embedded) {
    let id = filePath === ctx.ownSkill ? ctx.name : posix.basename(filePath, ".md");
    if (taken.has(id)) id = filePath.slice("skills/".length, -".md".length);
    taken.add(id);
    ids.set(filePath, id);
  }
  return ids;
}

function rewrite(text, fromPath, ctx, ids) {
  const label = (token) => {
    const resolved = resolve(token, fromPath, ctx);
    if (!resolved) return null;
    if (ids.has(resolved)) return `«${ids.get(resolved)}»`;
    const otherSkill = resolved.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (otherSkill) return `the ospec \`${otherSkill[1]}\` skill`;
    return `\`${resolved.slice("skills/".length)}\` (installed ospec skills, not this project)`;
  };
  return String(text)
    .replace(MD_LINK, (whole, _text, href) => label(href) ?? whole)
    .replace(/`([^`\n]+)`/g, (whole, inner) => (isSingleToken(inner) ? label(inner) ?? whole : whole))
    .replace(PATH_TOKEN, (whole, token) => label(token) ?? whole);
}

function isSingleToken(value) {
  const match = value.match(PATH_TOKEN);
  return match !== null && match.length === 1 && match[0] === value;
}

// Embedded bodies sit under a level-3 section heading; shift their headings
// below it, leaving fenced code alone.
function demoteHeadings(text) {
  let fenced = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      return line.replace(/^(#{1,6})(?=\s)/, (hashes) => "#".repeat(Math.min(6, hashes.length + 3)));
    })
    .join("\n");
}

module.exports = { embedAgentReferences };
