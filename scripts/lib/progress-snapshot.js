"use strict";

// The progress snapshot v1 (openspec/specs/idd/spec.md, REQ-idd-026): the
// phases of the project roadmap, in reading order, with the status their
// changes give them. `ospec snapshot` builds it on demand; no IDD or SDD step,
// hook, check or gate runs it. The status comes from directory names only, so
// no state of either mode is read (ADR 0011). The document declares only its
// version: its format is closed (ADR 0009) and its schema is
// schemas/progress-snapshot/v1.schema.json. The v2 builds on this module
// (progress-snapshot-v2.js).

const fs = require("node:fs");
const path = require("node:path");

const { ARCHIVE_ROOT, CHANGE_ID_PATTERN, CHANGE_ROOT } = require("./idd-contract.js");

const SNAPSHOT_VERSION = 1;
const DEFAULT_ROADMAP = "docs/roadmap.md";
const MAX_PHASES = 100;
const MAX_TITLE = 200;
const MAX_BYTES = 64 * 1024;
const PHASE_ID_PATTERN = /^[a-z0-9.-]{1,64}$/;
const STATUSES = Object.freeze(["pending", "in-progress", "done"]);
// Active changes live in the root, closed ones under archive/<date>-<id>.
const CHANGE_TREES = Object.freeze([
  { active: CHANGE_ROOT, archive: ARCHIVE_ROOT },
  { active: "openspec/changes", archive: "openspec/changes/archive" },
]);
const ARCHIVED_NAME = /^\d{4}-\d{2}-\d{2}-(.+)$/;
// The first cell of a phase row: an id, a dot and the title.
const PHASE_CELL = /^([A-Za-z0-9][A-Za-z0-9.-]*?)\.\s+(.*)$/;
const DELIMITER_ROW = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

class SnapshotError extends Error {
  constructor(code, message, how) {
    super(message);
    this.code = code;
    if (how) this.how = how;
  }
}

// The text a reader sees in a cell: inline Markdown removed, whitespace
// collapsed, trimmed and NFC.
function plainText(markdown) {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(`+)(.*?)\1/g, "$2")
    .replace(/(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(^|\W)([*_])(?=\S)(.+?)(?<=\S)\2(?=\W|$)/g, "$1$3")
    .replace(/\\([\\`*_[\]()#+\-.!|~<>{}])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC");
}

// The cells of a table row, split on unescaped pipes.
function cells(line) {
  const parts = line.trim().split(/(?<!\\)\|/);
  if (parts[0].trim() === "") parts.shift();
  if (parts.length > 0 && parts[parts.length - 1].trim() === "") parts.pop();
  return parts;
}

// The body rows of every Markdown table outside code fences, grouped by table,
// each table with the `##` heading it sits under: null before the first one
// and after a `#` heading. Only the v2 reads the heading.
function tables(lines) {
  const found = [];
  let fence = null;
  let heading = null;
  for (let index = 0; index < lines.length; index += 1) {
    const marker = FENCE.exec(lines[index])?.[1];
    if (marker && (fence === null || marker.startsWith(fence))) {
      fence = fence === null ? marker[0].repeat(3) : null;
      continue;
    }
    if (fence !== null) continue;
    if (!lines[index].includes("|") || !DELIMITER_ROW.test(lines[index + 1]?.trim() ?? "")) {
      const title = HEADING.exec(lines[index]);
      if (title && title[1].length <= 2) heading = title[1].length === 2 ? { text: title[2] ?? "", line: index + 1 } : null;
      continue;
    }
    const rows = [];
    let at = index + 2;
    while (at < lines.length && lines[at].includes("|") && lines[at].trim() !== "") {
      rows.push({ line: at + 1, first: cells(lines[at])[0] ?? "" });
      at += 1;
    }
    found.push({ heading, rows });
    index = at - 1;
  }
  return found;
}

function linkKey(id) {
  return id.replace(/\./g, "");
}

function invalid(file, line, message) {
  return new SnapshotError("roadmap-invalid", `${file}:${line}: ${message}`);
}

// The phases of a roadmap: each row of a table whose every row starts with
// `<ID>. <title>`, with the `##` heading of its table. A table with no such
// row is not a phase table.
function roadmapPhases(text, file) {
  const phases = [];
  const byKey = new Map();
  for (const { heading, rows } of tables(text.split(/\r?\n/))) {
    const matches = rows.map((row) => PHASE_CELL.exec(plainText(row.first)));
    if (!matches.some(Boolean)) continue;
    const stray = rows.find((row, index) => !matches[index]);
    if (stray) throw invalid(file, stray.line, "the first cell does not start with '<ID>. <title>', as the other rows of its table do");
    rows.forEach((row, index) => {
      const id = matches[index][1].toLowerCase();
      const title = matches[index][2];
      if (!PHASE_ID_PATTERN.test(id)) throw invalid(file, row.line, `phase id ${JSON.stringify(id)} is longer than 64 characters`);
      const length = [...title].length;
      if (length === 0 || length > MAX_TITLE) throw invalid(file, row.line, `phase ${id} needs a title of 1 to ${MAX_TITLE} characters, got ${length}`);
      if (CONTROL.test(title)) throw invalid(file, row.line, `the title of phase ${id} holds a control character`);
      const clash = byKey.get(linkKey(id));
      if (clash) throw invalid(file, row.line, `phase id ${id} repeats ${clash.id} of line ${clash.line}`);
      const phase = { id, title, line: row.line, heading };
      byKey.set(linkKey(id), phase);
      phases.push(phase);
    });
  }
  if (phases.length === 0) {
    throw new SnapshotError("roadmap-unrecognized", `${file} has no phase table: no table row whose first cell starts with '<ID>. <title>'`);
  }
  return phases;
}

function parseRoadmap(text, file) {
  return roadmapPhases(text, file).map(({ id, title, line }) => ({ id, title, line }));
}

// The status of each phase. A change belongs to the phase whose link key, the
// id without dots, equals the change id or prefixes it before a hyphen; the
// longest key wins. An active change gives in-progress, else an archived one
// gives done, else the phase is pending.
function phaseStatuses(phases, changes) {
  const found = new Map(phases.map((phase) => [phase.id, { active: false, archived: false }]));
  for (const change of changes) {
    let owner = null;
    for (const phase of phases) {
      const key = linkKey(phase.id);
      if ((change.id === key || change.id.startsWith(`${key}-`)) && (!owner || key.length > linkKey(owner.id).length)) owner = phase;
    }
    if (owner) found.get(owner.id)[change.archived ? "archived" : "active"] = true;
  }
  return phases.map(({ id, title }) => {
    const { active, archived } = found.get(id);
    return { id, title, status: active ? "in-progress" : archived ? "done" : "pending" };
  });
}

function directories(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
    throw error;
  }
}

// The IDD and SDD changes of the project, by directory name.
function readChanges(root) {
  const changes = [];
  for (const tree of CHANGE_TREES) {
    const archiveName = path.basename(tree.archive);
    for (const name of directories(path.join(root, tree.active))) {
      if (name !== archiveName && CHANGE_ID_PATTERN.test(name)) changes.push({ id: name, archived: false });
    }
    for (const name of directories(path.join(root, tree.archive))) {
      const id = ARCHIVED_NAME.exec(name)?.[1];
      if (id && CHANGE_ID_PATTERN.test(id)) changes.push({ id, archived: true });
    }
  }
  return changes;
}

// Every rule of the format, checked on what is about to be emitted.
function problems(phases) {
  const found = [];
  const seen = new Set();
  if (!Array.isArray(phases) || phases.length === 0) return ["phases must hold at least one phase"];
  phases.forEach((phase, index) => {
    const at = `phases[${index}]`;
    const keys = Object.keys(phase ?? {});
    if (keys.length !== 3 || !["id", "title", "status"].every((key) => keys.includes(key))) found.push(`${at} must hold exactly id, title and status`);
    if (typeof phase?.id !== "string" || !PHASE_ID_PATTERN.test(phase.id)) found.push(`${at}.id must match ${PHASE_ID_PATTERN.source}`);
    else if (seen.has(phase.id)) found.push(`${at}.id ${phase.id} repeats an earlier phase`);
    else seen.add(phase.id);
    const title = phase?.title;
    if (typeof title !== "string" || title.length === 0 || [...title].length > MAX_TITLE) found.push(`${at}.title must hold 1 to ${MAX_TITLE} characters`);
    else if (title !== title.trim() || title !== title.normalize("NFC") || CONTROL.test(title)) found.push(`${at}.title must be trimmed, NFC and free of control characters`);
    if (!STATUSES.includes(phase?.status)) found.push(`${at}.status must be one of ${STATUSES.join(", ")}`);
  });
  return found;
}

// The snapshot text, or a refusal: nothing invalid is ever emitted.
function serializeSnapshot(phases) {
  if (Array.isArray(phases) && phases.length > MAX_PHASES) {
    throw new SnapshotError("snapshot-limit", `the snapshot would hold ${phases.length} phases; the limit is ${MAX_PHASES}`);
  }
  const found = problems(phases);
  if (found.length > 0) throw new SnapshotError("snapshot-invalid", `the snapshot would break its format: ${found.join("; ")}`);
  const text = `${JSON.stringify({ schemaVersion: SNAPSHOT_VERSION, phases }, null, 2)}\n`;
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_BYTES) throw new SnapshotError("snapshot-limit", `the snapshot would take ${bytes} bytes; the limit is ${MAX_BYTES} (64 KiB)`);
  return text;
}

function readRoadmap(root, roadmap) {
  try {
    return fs.readFileSync(path.resolve(root, roadmap), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
    throw new SnapshotError("roadmap-missing", `roadmap not found: ${roadmap}`, "pass --roadmap <path> to read another roadmap");
  }
}

function buildSnapshot({ root, roadmap = DEFAULT_ROADMAP }) {
  const text = readRoadmap(root, roadmap);
  const phases = phaseStatuses(parseRoadmap(text, roadmap), readChanges(root));
  const snapshotText = serializeSnapshot(phases);
  return { roadmap, snapshot: { schemaVersion: SNAPSHOT_VERSION, phases }, text: snapshotText };
}

module.exports = {
  CONTROL,
  DEFAULT_ROADMAP,
  FENCE,
  HEADING,
  MAX_BYTES,
  MAX_PHASES,
  MAX_TITLE,
  PHASE_ID_PATTERN,
  STATUSES,
  SnapshotError,
  buildSnapshot,
  parseRoadmap,
  phaseStatuses,
  plainText,
  readChanges,
  readRoadmap,
  roadmapPhases,
  serializeSnapshot,
};
