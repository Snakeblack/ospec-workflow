"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKER = "k1-prose-authority";
const SCOPED_EXACT_FILES = ["AGENTS.md"];
const SCOPED_DIRECTORIES = [
  "agents",
  "commands",
  "skills",
  "rules",
  ".github/instructions",
  "docs/architecture",
  "openspec/specs",
  "schemas/kernel",
];

const PROSE_SOURCE_RE = /\b(?:free[- ]?form\s+prose|prose|narrative(?:\s+(?:summary|text))?|human(?:-written)?\s+text|chat(?:\s+summary)?|conversation(?:\s+memory)?|prosa|narrativa|texto\s+libre|descripci[oó]n\s+libre)\b/i;
const AUTHORITY_ACTION_RE = /\b(?:infer|derive|determin(?:e|ing)|decid(?:e|ing)|resolve|obtain|recover|extract|reconstruct|pars(?:e|ing)|interpret(?:ing)?|read|use|fall\s+back|fallback|inferir|derivar|determinar|decidir|resolver|obtener|recuperar|extraer|reconstruir|interpretar|usar)\b/i;
const AUTHORITY_TARGET_RE = /\b(?:authorit(?:y|ative)|decision|approval|transition|next[_ -]?action|reason|route|status|candidate|state|autoridad|decisi[oó]n|aprobaci[oó]n|transici[oó]n|acci[oó]n|raz[oó]n|ruta|estado|candidato)\b/i;
const COMMAND_TARGET_RE = /\b(?:command|comando)\b/i;
const COMMAND_DERIVATION_RE = /\b(?:infer|derive|determin(?:e|ing)|obtain|recover|extract|reconstruct|pars(?:e|ing)|interpret(?:ing)?|inferir|derivar|determinar|obtener|recuperar|extraer|reconstruir|interpretar)\b/i;
const SOURCE_RELATION_RE = /\b(?:from|by|using|based\s+on|through|via|instead(?:\s+of)?|fallback|when\s+(?:the\s+)?\w+\s+is\s+missing|if\s+[^.\n]{0,60}\s+missing|desde|mediante|usando|basad[oa]\s+en|a\s+partir\s+de|si\s+falta)\b/i;
const PROHIBITION_RE = /\b(?:must|shall|should|do|does|can)\s+not\b|\bnever\b|\b(?:reject(?:s|ed|ing)?|forbid(?:s|den)?|prohibit(?:s|ed|ing)?|disallow(?:s|ed|ing)?)\b|\b(?:must|shall)\s+(?:reject|report|fail)\b|\boffender\b|\bno\s+(?:fallback|authority)\b|\bwithout\s+(?:falling\s+back|using|interpreting|relying)\b|\b(?:no\s+(?:debe|puede|se)|ning[uú]n(?:a|o)?|nunca|ausencia\s+de|rechaz(?:a|ar)|proh[ií]b(?:e|ir)|sin\s+(?:recurrir|usar|interpretar))\b/i;

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function walkMarkdown(directory, root, output) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(absolute, root, output);
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      output.add(toPosix(path.relative(root, absolute)));
    }
  }
}

function collectScopedPaths(root) {
  const output = new Set();
  for (const relativePath of SCOPED_EXACT_FILES) {
    if (fs.existsSync(path.join(root, relativePath))) output.add(relativePath);
  }
  for (const relativeDirectory of SCOPED_DIRECTORIES) {
    walkMarkdown(path.join(root, relativeDirectory), root, output);
  }
  return [...output].sort();
}

function splitParagraphs(text) {
  const segments = [];
  let continuation = [];
  const flush = () => {
    if (continuation.length > 0) segments.push(continuation.join(" "));
    continuation = [];
  };
  const lines = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\r\n]+`/g, "")
    .split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flush();
      continue;
    }
    if (/^(?:[-*+]\s+|#{1,6}\s+)/.test(line)) {
      flush();
      segments.push(line);
      continue;
    }
    continuation.push(line);
  }
  flush();
  return segments
    .flatMap((segment) => segment.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ])/))
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isProhibitedExample(paragraph) {
  return PROHIBITION_RE.test(paragraph);
}

function looksLikeAuthorityFallback(paragraph) {
  if (/^#{1,6}\s+/.test(paragraph)) return false;
  if (isProhibitedExample(paragraph)) return false;
  return (
    PROSE_SOURCE_RE.test(paragraph) &&
    AUTHORITY_ACTION_RE.test(paragraph) &&
    (AUTHORITY_TARGET_RE.test(paragraph) ||
      (COMMAND_TARGET_RE.test(paragraph) && COMMAND_DERIVATION_RE.test(paragraph))) &&
    SOURCE_RELATION_RE.test(paragraph)
  );
}

function claimsImplementedGraphAuthority(paragraph) {
  if (isProhibitedExample(paragraph)) return false;
  return (
    /Graph\s+IR/i.test(paragraph) &&
    /independent\s+authorit|authorit[^.\n]{0,80}independent/i.test(paragraph) &&
    /\{implemented\}|(?:tagged|labeled|labelled|is|as)\s+implemented|implemented[^.\n]{0,100}Graph\s+IR/i.test(paragraph)
  );
}

/**
 * REQ-contract-lint-010: scan the repository's operative Markdown contracts,
 * not a two-file declaration island. Detection requires an authority action,
 * material target, prose source, and source relation; explicit prohibitions
 * and negative contract examples are excluded to keep the signal actionable.
 *
 * @param {{root: string}} ctx
 */
function check(ctx) {
  const root = path.resolve(ctx.root);
  const offenders = [];

  for (const relativePath of collectScopedPaths(root)) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, relativePath), "utf8");
    } catch (err) {
      offenders.push({
        checker: CHECKER,
        path: relativePath,
        expected: "readable scoped authority contract",
        actual: err.message,
        message: `${relativePath} could not be read: ${err.message}`,
      });
      continue;
    }

    const paragraphs = splitParagraphs(text);
    if (paragraphs.some(looksLikeAuthorityFallback)) {
      offenders.push({
        checker: CHECKER,
        path: relativePath,
        expected: "structured-only authority guidance",
        actual: "prose-derived authority decision",
        message: `${relativePath} instructs an authority-sensitive operation to derive a decision from prose`,
      });
    }
    if (paragraphs.some(claimsImplementedGraphAuthority)) {
      offenders.push({
        checker: CHECKER,
        path: relativePath,
        expected: "Graph IR independent authority tagged target|experimental",
        actual: "implemented",
        message: `${relativePath} labels Graph IR independent authority as implemented`,
      });
    }
  }

  return offenders;
}

module.exports = {
  check,
  collectScopedPaths,
  claimsImplementedGraphAuthority,
  looksLikeAuthorityFallback,
  splitParagraphs,
  SCOPED_DIRECTORIES,
};
