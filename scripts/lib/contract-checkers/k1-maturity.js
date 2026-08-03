"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKER = "k1-maturity";
const TAG_RE = /\{(implemented|target|experimental)\}/;

/**
 * Extract bullet entries from the Registro de madurez section.
 * @param {string} text
 * @returns {Array<{text: string, line: number, expectedTag: string|null}>}
 */
function extractMaturityEntries(text) {
  const sectionMatch = text.match(
    /##\s+Registro de madurez\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/
  );
  if (!sectionMatch) return null;

  const section = sectionMatch[1];
  const entries = [];
  const lines = section.split(/\r?\n/);
  const firstSectionLine = text.slice(0, sectionMatch.index).split(/\r?\n/).length + 1;
  let expectedTag = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^\s*###\s+(.+?)\s*$/);
    if (heading) {
      if (/implementad|implemented/i.test(heading[1])) expectedTag = "implemented";
      else if (/target|objetivo/i.test(heading[1])) expectedTag = "target";
      else if (/experimental|hip[oó]tesis/i.test(heading[1])) expectedTag = "experimental";
      else expectedTag = null;
      continue;
    }
    const bullet = line.match(/^\s*-\s+(.+)\s*$/);
    if (!bullet) continue;
    entries.push({
      text: bullet[1].trim(),
      line: firstSectionLine + index + 1,
      expectedTag,
    });
  }
  return entries;
}

/**
 * REQ-contract-lint-011: every scoped maturity register entry carries exactly
 * one of {implemented|target|experimental}.
 *
 * @param {{root: string}} ctx
 */
function check(ctx) {
  const root = ctx.root;
  const rel = "docs/architecture/harness-evolution.md";
  const abs = path.join(root, rel);
  const offenders = [];

  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch (err) {
    return [
      {
        checker: CHECKER,
        path: rel,
        expected: "readable harness-evolution maturity register",
        actual: err.message,
        message: `${rel} could not be read: ${err.message}`,
      },
    ];
  }

  const entries = extractMaturityEntries(text);
  if (!entries) {
    return [
      {
        checker: CHECKER,
        path: rel,
        expected: "section ## Registro de madurez",
        actual: "missing",
        message: `${rel} is missing ## Registro de madurez`,
      },
    ];
  }

  for (const entry of entries) {
    const matches = entry.text.match(/\{(implemented|target|experimental)\}/g) || [];
    if (matches.length === 0) {
      offenders.push({
        checker: CHECKER,
        path: `${rel}:L${entry.line}`,
        expected: "exactly one {implemented|target|experimental} tag",
        actual: "no maturity tag",
        message: `maturity entry lacks a maturity tag: ${entry.text}`,
      });
      continue;
    }
    if (matches.length > 1) {
      offenders.push({
        checker: CHECKER,
        path: `${rel}:L${entry.line}`,
        expected: "exactly one maturity tag",
        actual: matches.join(", "),
        message: `maturity entry has multiple tags: ${entry.text}`,
      });
    }
    const tag = matches[0].slice(1, -1);

    if (entry.expectedTag && tag !== entry.expectedTag) {
      offenders.push({
        checker: CHECKER,
        path: `${rel}:L${entry.line}`,
        expected: `{${entry.expectedTag}} matching the maturity subsection`,
        actual: `{${tag}}`,
        message: `maturity subsection ${entry.expectedTag} cannot label an entry ${tag}: ${entry.text}`,
      });
    }

    if (
      /Graph\s+IR/i.test(entry.text) &&
      /authorit/i.test(entry.text) &&
      tag === "implemented"
    ) {
      offenders.push({
        checker: CHECKER,
        path: `${rel}:L${entry.line}`,
        expected: "Graph IR authority tagged target|experimental",
        actual: "implemented",
        message: `Graph IR authority must not be tagged implemented: ${entry.text}`,
      });
    }
  }

  return offenders;
}

module.exports = { check, extractMaturityEntries, TAG_RE };
