"use strict";

// The changelog entry of a closed change and the release it proposes
// (openspec/specs/idd/spec.md, REQ-idd-025). The changelog follows Keep a
// Changelog: the change's kind gives the section under ## [Unreleased] and its
// summary the line. Pure: ospec close reads and writes the file.

const SECTION_BY_KIND = Object.freeze({ feature: "Added", bug: "Fixed", refactor: "Changed", docs: "Changed" });
// The section order of Keep a Changelog; an unknown section sorts last.
const SECTION_ORDER = Object.freeze(["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"]);
const HEADER = Object.freeze([
  "# Changelog",
  "",
  "All notable changes to this project are documented in this file.",
  "",
  "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),",
  "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).",
]);
const UNRELEASED = "## [Unreleased]";
const UNRELEASED_HEADING = /^##\s+\[Unreleased\]/i;
const VERSION_HEADING = /^##\s+\[?v?(\d+)\.(\d+)\.(\d+)([-+][^\]\s]*)?\]?(\s|$)/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;

function changelogEntry(state) {
  const summary = state.intent.summary.replace(/\s+/g, " ").trim();
  return { section: SECTION_BY_KIND[state.intent.kind], line: `- ${summary} (${state.change})` };
}

function isBlank(line) {
  return line.trim() === "";
}

function sectionRank(line) {
  const rank = SECTION_ORDER.indexOf(SECTION_HEADING.exec(line)?.[1]);
  return rank === -1 ? SECTION_ORDER.length : rank;
}

// The line range of ## [Unreleased]: its heading and the line where the next
// version starts, or the end of the file.
function unreleasedRange(lines) {
  const start = lines.findIndex((line) => UNRELEASED_HEADING.test(line));
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return { start, end: next === -1 ? lines.length : next };
}

// The index after the last non-blank line before `end`, never above `floor`.
function afterContent(lines, floor, end) {
  let at = end;
  while (at > floor && isBlank(lines[at - 1])) at -= 1;
  return at;
}

function ensureUnreleased(lines) {
  if (unreleasedRange(lines)) return;
  const firstVersion = lines.findIndex((line) => /^##\s/.test(line));
  if (firstVersion !== -1) {
    lines.splice(firstVersion, 0, UNRELEASED, "");
    return;
  }
  const at = afterContent(lines, 0, lines.length);
  lines.splice(at, 0, ...(at > 0 ? [""] : []), UNRELEASED, ...(at === lines.length ? [""] : []));
}

/**
 * Adds the entry under ## [Unreleased], in its section. A missing file gets the
 * Keep a Changelog header, and a missing [Unreleased] goes before the first
 * version. An entry the file already holds is not added again. Line endings
 * are kept.
 * @param {string|null} text the changelog, or null when it does not exist
 * @param {{ section: string, line: string }} entry
 * @returns {{ text: string, written: boolean }}
 */
function addEntry(text, { section, line }) {
  const eol = text?.includes("\r\n") ? "\r\n" : "\n";
  const lines = text == null ? [...HEADER] : text.split(/\r?\n/);
  if (text != null && lines.some((existing) => existing.trimEnd() === line)) return { text, written: false };
  ensureUnreleased(lines);
  const { start, end } = unreleasedRange(lines);
  const headings = [];
  for (let index = start + 1; index < end; index += 1) if (SECTION_HEADING.test(lines[index])) headings.push(index);
  const own = headings.find((index) => SECTION_HEADING.exec(lines[index])[1] === section);
  if (own !== undefined) {
    const ownEnd = headings.find((index) => index > own) ?? end;
    lines.splice(afterContent(lines, own + 1, ownEnd), 0, line);
  } else {
    const later = headings.find((index) => sectionRank(lines[index]) > sectionRank(`### ${section}`));
    if (later !== undefined) {
      lines.splice(later, 0, `### ${section}`, line, "");
    } else {
      const at = afterContent(lines, start + 1, end);
      const added = ["", `### ${section}`, line];
      if (at < lines.length && !isBlank(lines[at])) added.push("");
      lines.splice(at, 0, ...added);
    }
  }
  if (text == null && !isBlank(lines.at(-1))) lines.push("");
  return { text: lines.join(eol), written: true };
}

function bumpVersion([major, minor, patch], bump) {
  return bump === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

/**
 * The release the changelog proposes: the latest version raised by a minor
 * when [Unreleased] holds an Added section and by a patch otherwise, its tag
 * and the [Unreleased] contents as notes. A major is never proposed. Without a
 * plain previous version the version and the tag are null. Null when
 * [Unreleased] is missing or empty.
 * @param {string} text
 * @returns {{ version: string|null, bump: "minor"|"patch", tag: string|null, notes: string }|null}
 */
function proposeRelease(text) {
  const lines = String(text).split(/\r?\n/);
  const range = unreleasedRange(lines);
  if (!range) return null;
  const body = lines.slice(range.start + 1, range.end);
  const notes = body.join("\n").trim();
  if (notes === "") return null;
  const bump = body.some((line) => SECTION_HEADING.exec(line)?.[1] === "Added") ? "minor" : "patch";
  const latest = lines.slice(range.end).map((line) => VERSION_HEADING.exec(line)).find(Boolean);
  const version = latest && !latest[4] ? bumpVersion(latest.slice(1, 4).map(Number), bump) : null;
  return { version, bump, tag: version ? `v${version}` : null, notes };
}

module.exports = {
  SECTION_BY_KIND,
  UNRELEASED_HEADING,
  VERSION_HEADING,
  addEntry,
  changelogEntry,
  proposeRelease,
};
