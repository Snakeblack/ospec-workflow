"use strict";

// The progress snapshot v4 (openspec/specs/idd/spec.md, REQ-idd-026, E5.13):
// the v3, with the same groups, phases, texts, requests and releases, plus the
// documentation of the project written for the client: the problem it solves,
// its objectives, what it includes and leaves out, its deliverables and its
// decisions. A decision is an accepted or superseded ADR of
// docs/architecture/decisions/, with the phases the `ADRs` column of the
// roadmap names; every client text comes from the progress file, and no
// document is published as it is. Its schema is
// schemas/progress-snapshot/v4.schema.json, and nothing invalid is ever
// emitted.

const fs = require("node:fs");
const path = require("node:path");

const { DECISIONS_ROOT } = require("./idd-contract.js");
const { HEADING, MAX_PHASES, MAX_TITLE, SnapshotError, plainText } = require("./progress-snapshot.js");
const { DEFAULT_PROGRESS, MAX_TEXT, exactKeys, isDate, serializeChecked, textProblem, urlProblem } = require("./progress-snapshot-v2.js");
const { documentV3, problems: problemsV3 } = require("./progress-snapshot-v3.js");

const SNAPSHOT_VERSION = 4;
const MAX_OBJECTIVES = 10;
const MAX_INCLUDES = 30;
const MAX_EXCLUDES = 30;
const MAX_DELIVERABLES = 50;
const MAX_DECISIONS = 100;
const MAX_NUMBER = 9999;
const DOCUMENTATION_FIELDS = Object.freeze(["problem", "objectives", "includes", "excludes", "deliverables", "decisions"]);
// The `##` keyword of each documentation section and the field it gives.
const SECTIONS = Object.freeze({
  Problem: "problem",
  Objectives: "objectives",
  Includes: "includes",
  Excludes: "excludes",
  Deliverables: "deliverables",
  Decisions: "decisions",
});
// What each section with one `###` per element calls it, the paragraph it
// takes, whether it is required, and its limit.
const ELEMENTS = Object.freeze({
  objectives: { what: "objective", paragraph: "measure", required: true, max: MAX_OBJECTIVES },
  excludes: { what: "exclusion", paragraph: "reason", required: true, max: MAX_EXCLUDES },
  deliverables: { what: "deliverable", paragraph: "summary", required: false, max: MAX_DELIVERABLES },
  decisions: { what: "decision", paragraph: "reason", required: false, max: Infinity },
});
const ADR_FILE = /^(\d{4})-.+\.md$/;
const ADR_HEADING = /^#\s+(\d{4})\.\s+(.+?)\s*$/;
const ADR_FIELD = /^-\s+(Status|Date):\s*(.*?)\s*$/i;
const PUBLISHED = Object.freeze(["accepted", "superseded"]);
const UNPUBLISHED = Object.freeze(["inferred", "proposed", "rejected", "deprecated"]);
const SUPERSEDED_BY = /^superseded\s+by\s+(\d{4})$/i;
// `### NNNN. <title>`, `### NNNN.` or `### NNNN`, once clean.
const DECISION_HEADING = /^(\d{4})(?:\.(?:\s+(.*))?)?$/;
const KEY = /^([A-Za-z]+):[ \t]*(.*)$/;
const TASK = /^\[[ xX]\][ \t]/;
// An `ADRs` cell that names none, and one ADR number of a cell that does.
const NO_ADRS = /^(?:-|—)?$/;
const ADR_NUMBER = /^\d{4}$/;
const ADRS_COLUMN = "adrs";

function decisionsInvalid(file, line, message, how) {
  return new SnapshotError("decisions-invalid", `${file}:${line}: ${message}`, how);
}

function roadmapInvalid(file, line, message) {
  return new SnapshotError("roadmap-invalid", `${file}:${line}: ${message}`);
}

function progressInvalid(file, line, message) {
  return new SnapshotError("progress-invalid", `${file}:${line}: ${message}`);
}

// The reader of one documentation section, which writes its field into
// `found`: one paragraph for `## Problem`, one `- <text>` item each for
// `## Includes`, and one `### <title>` each, with its paragraph, for the rest.
// A deliverable adds `- phase: <ID>` and `- url: <https URL>`, and a decision
// reads `### NNNN. <title>` or `### NNNN`, with `- internal`.
function sectionReader(name, field, line, { fail, roadmap }, found) {
  const clean = (value, max, what, at) => {
    const text = plainText(value);
    const problem = textProblem(text, max);
    if (problem) throw fail(at, `${what} ${problem}`);
    return text;
  };
  const elements = field === "decisions" ? new Map() : [];
  const spec = ELEMENTS[field];
  let element = null;

  // An element is complete once the next heading or the end of the section
  // comes.
  const finish = () => {
    if (!element) return;
    const label = element.number === undefined ? `${spec.what} ${JSON.stringify(element.title)}` : `${spec.what} ${element.id}`;
    if (spec.required && element[spec.paragraph] === undefined) {
      throw fail(element.line, `${label} needs its ${spec.paragraph}: a paragraph under its heading`);
    }
    if (field === "deliverables" && element.phase === undefined) throw fail(element.line, `${label} needs its phase: '- phase: <ID>'`);
    if (element.internal && (element.title !== undefined || element.reason !== undefined)) {
      throw fail(element.line, `${label} is internal, so it is not published: drop its title and its reason`);
    }
    element = null;
  };

  const start = (block) => {
    finish();
    const heading = plainText(block.text);
    if (field !== "decisions") {
      if (elements.length === spec.max) throw fail(block.line, `more than ${spec.max} ${field}`);
      const title = textProblem(heading, MAX_TITLE);
      if (title) throw fail(block.line, `the title of a ${spec.what} ${title}`);
      element = { line: block.line, title: heading, keys: new Map() };
      elements.push(element);
      return;
    }
    const named = DECISION_HEADING.exec(heading);
    if (!named) throw fail(block.line, "a decision reads '### NNNN. <title>' or '### NNNN', with the four digits of its ADR");
    const number = Number(named[1]);
    if (elements.has(number)) throw fail(block.line, `decision ${named[1]} repeats the one of line ${elements.get(number).line}`);
    element = { line: block.line, id: named[1], number, keys: new Map() };
    if (named[2] !== undefined) {
      const problem = textProblem(named[2], MAX_TITLE);
      if (problem) throw fail(block.line, `the title of decision ${named[1]} ${problem}`);
      element.title = named[2];
    }
    elements.set(number, element);
  };

  const item = (block) => {
    const raw = block.text.trim();
    const label = element.number === undefined ? `${spec.what} ${JSON.stringify(element.title)}` : `${spec.what} ${element.id}`;
    if (field === "decisions") {
      if (raw !== "internal") throw fail(block.line, `an item of ${label} reads '- internal'`);
      if (element.internal) throw fail(block.line, `'- internal' repeats the one of line ${element.internalLine}`);
      element.internal = true;
      element.internalLine = block.line;
      return;
    }
    const pair = field === "deliverables" ? KEY.exec(raw) : null;
    if (!pair || !["phase", "url"].includes(pair[1])) {
      const allowed = field === "deliverables" ? "the items '- phase: <ID>' and '- url: <https URL>' and a paragraph" : "a paragraph";
      throw fail(block.line, `${label} holds ${allowed} under its heading`);
    }
    const [, key, value] = pair;
    if (element.keys.has(key)) throw fail(block.line, `key ${key} repeats the one of line ${element.keys.get(key)}`);
    element.keys.set(key, block.line);
    if (key === "phase") {
      const id = value.trim().toLowerCase();
      if (!roadmap.phases.has(id)) throw fail(block.line, `${label} names phase ${JSON.stringify(value.trim())}, which is not a phase of the roadmap`);
      element.phase = id;
      return;
    }
    const problem = urlProblem(value.trim());
    if (problem) throw fail(block.line, `the URL of ${label} ${problem}`);
    element.url = value.trim();
  };

  const add = (block) => {
    if (field === "problem") {
      if (block.kind !== "paragraph") throw fail(block.line, `'## ${name}' holds one paragraph`);
      if (found.problem !== undefined) throw fail(block.line, "the problem is one paragraph; a second one starts here");
      found.problem = clean(block.text, MAX_TEXT, "the problem", block.line);
      return;
    }
    if (field === "includes") {
      if (block.kind !== "item") throw fail(block.line, `'## ${name}' holds only '- <text>' items`);
      if (TASK.test(block.text.trim())) throw fail(block.line, "an item of '## Includes' reads '- <text>', without a checkbox");
      if (elements.length === MAX_INCLUDES) throw fail(block.line, `more than ${MAX_INCLUDES} includes`);
      elements.push(clean(block.text, MAX_TITLE, "an item of '## Includes'", block.line));
      return;
    }
    if (block.kind === "heading") {
      if (block.level !== 3) throw fail(block.line, `a '${"#".repeat(block.level)}' heading is out of the format in '## ${name}'`);
      start(block);
      return;
    }
    if (!element) throw fail(block.line, `'## ${name}' holds one '### ' heading per ${spec.what}, with what it says below it`);
    if (block.kind === "item") {
      item(block);
      return;
    }
    const label = element.number === undefined ? `${spec.what} ${JSON.stringify(element.title)}` : `${spec.what} ${element.id}`;
    if (element[spec.paragraph] !== undefined) throw fail(block.line, `the ${spec.paragraph} of ${label} is one paragraph; a second one starts here`);
    element[spec.paragraph] = clean(block.text, MAX_TEXT, `the ${spec.paragraph} of ${label}`, block.line);
  };

  const close = () => {
    finish();
    if (field === "problem") {
      if (found.problem === undefined) throw fail(line, `'## ${name}' holds no paragraph; leave the heading out when there is none`);
      return;
    }
    const size = field === "decisions" ? elements.size : elements.length;
    if (size === 0) throw fail(line, `'## ${name}' holds no ${field === "includes" ? "items" : `${spec.what}s`}; leave the heading out when there are none`);
    found[field] = elements;
  };

  return { add, close };
}

// The documentation sections of a progress file, for the v2 parser to read in
// the same pass as its own, each `##` at most once.
function documentationSections() {
  const found = {};
  const seen = new Map();
  return {
    found,
    names: Object.keys(SECTIONS),
    open(name, line, tools) {
      const field = SECTIONS[name];
      if (!field) return null;
      if (seen.has(name)) throw tools.fail(line, `'## ${name}' repeats the one of line ${seen.get(name)}`);
      seen.set(name, line);
      return sectionReader(name, field, line, tools, found);
    },
  };
}

// One ADR: its heading `# NNNN. <title>`, with the number of its file name,
// and the Status and Date of its header, before the next heading. The rest of
// the file is not read.
function parseAdr(text, file, id) {
  const fail = (line, message) => decisionsInvalid(file, line, message);
  const adr = { id, number: Number(id), file };
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const at = index + 1;
    const heading = HEADING.exec(lines[index]);
    if (adr.line === undefined) {
      if (!heading) continue;
      const parts = ADR_HEADING.exec(lines[index]);
      if (!parts) throw fail(at, `an ADR starts with its heading '# ${id}. <title>'`);
      if (parts[1] !== id) throw fail(at, `the heading names ADR ${parts[1]}, but the file name says ${id}`);
      adr.line = at;
      adr.title = parts[2];
      continue;
    }
    if (heading) break;
    const field = ADR_FIELD.exec(lines[index]);
    if (!field) continue;
    const name = field[1].toLowerCase();
    if (adr[name] !== undefined) throw fail(at, `'- ${field[1]}:' repeats the one of line ${adr[`${name}Line`]}`);
    adr[name] = field[2];
    adr[`${name}Line`] = at;
  }
  if (adr.line === undefined) throw fail(1, `an ADR starts with its heading '# ${id}. <title>'`);
  if (adr.status === undefined) throw fail(adr.line, `ADR ${id} has no '- Status:' line in its header`);
  const by = SUPERSEDED_BY.exec(adr.status);
  const status = adr.status.toLowerCase();
  if (by) {
    adr.state = "superseded";
    adr.supersededBy = Number(by[1]);
    adr.supersededById = by[1];
  } else if (status === "accepted" || UNPUBLISHED.includes(status)) adr.state = status;
  else {
    throw fail(adr.statusLine, `the status of ADR ${id} is inferred, proposed, accepted, superseded by NNNN, rejected or deprecated, got ${JSON.stringify(adr.status)}`);
  }
  return adr;
}

// The ADRs of the project by number, in number order, or null without
// docs/architecture/decisions/. Only `NNNN-<title>.md` files count, and every
// `superseded by` names an ADR with a greater number.
function readAdrs(root) {
  const dir = path.join(root, ...DECISIONS_ROOT.split("/"));
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
  const adrs = new Map();
  const names = entries.filter((entry) => entry.isFile() && ADR_FILE.test(entry.name)).map((entry) => entry.name);
  for (const name of names.sort()) {
    const file = `${DECISIONS_ROOT}/${name}`;
    const adr = parseAdr(fs.readFileSync(path.join(dir, name), "utf8"), file, ADR_FILE.exec(name)[1]);
    const clash = adrs.get(adr.number);
    if (clash) throw decisionsInvalid(file, adr.line, `ADR ${adr.id} repeats the number of ${clash.file}`);
    adrs.set(adr.number, adr);
  }
  const sorted = new Map([...adrs].sort(([left], [right]) => left - right));
  for (const adr of sorted.values()) {
    if (adr.state !== "superseded") continue;
    const fail = (message) => decisionsInvalid(adr.file, adr.statusLine, message);
    if (!sorted.has(adr.supersededBy)) throw fail(`ADR ${adr.id} is superseded by ${adr.supersededById}, which is not an ADR of ${DECISIONS_ROOT}/`);
    if (adr.supersededBy <= adr.number) throw fail(`ADR ${adr.id} is superseded by ${adr.supersededById}, whose number is not greater`);
  }
  return sorted;
}

// The phases that name each ADR in the `ADRs` column of the roadmap's phase
// tables, in roadmap order and without repeats. A cell holds `—`, `-` or
// nothing, or ADR numbers separated by commas, each one an ADR on disk.
function adrPhases(phases, file, adrs) {
  const found = new Map();
  for (const phase of phases) {
    const column = phase.header.findIndex((cell) => plainText(cell).toLowerCase() === ADRS_COLUMN);
    if (column === -1) continue;
    const cell = plainText(phase.cells[column] ?? "");
    if (NO_ADRS.test(cell)) continue;
    for (const part of cell.split(",").map((value) => value.trim())) {
      if (!ADR_NUMBER.test(part)) {
        throw roadmapInvalid(file, phase.line, `the ADRs cell of phase ${phase.id} reads ${JSON.stringify(cell)}; it holds '—' or ADR numbers NNNN separated by commas`);
      }
      if (!adrs?.has(Number(part))) throw roadmapInvalid(file, phase.line, `phase ${phase.id} names ADR ${part}, which is not an ADR of ${DECISIONS_ROOT}/`);
      const named = found.get(Number(part)) ?? [];
      if (!named.includes(phase.id)) named.push(phase.id);
      found.set(Number(part), named);
    }
  }
  return found;
}

// The published decisions, in number order: every accepted or superseded ADR
// that the progress file does not mark internal, with the client title and
// reason the progress file gives it. An entry of the progress file names a
// published ADR, and a published ADR has an entry.
function decisionsOf(adrs, entries, phasesOf, progressFile) {
  for (const entry of entries.values()) {
    const fail = (message) => progressInvalid(progressFile, entry.line, message);
    const adr = adrs?.get(entry.number);
    if (!adr) throw fail(`decision ${entry.id} names no ADR of ${DECISIONS_ROOT}/`);
    if (!PUBLISHED.includes(adr.state)) throw fail(`ADR ${entry.id} is ${adr.state}, so it is not published; leave its decision out`);
    if (!entry.internal && entry.reason === undefined) throw fail(`decision ${entry.id} needs its reason for the client: a paragraph under its heading, or '- internal'`);
  }
  const published = [...(adrs?.values() ?? [])].filter((adr) => PUBLISHED.includes(adr.state) && !entries.get(adr.number)?.internal);
  if (published.length > MAX_DECISIONS) {
    throw new SnapshotError("snapshot-limit", `the snapshot would hold ${published.length} decisions; the limit is ${MAX_DECISIONS}`);
  }
  const numbers = new Set(published.map((adr) => adr.number));
  return published.map((adr) => {
    const fail = (line, message, how) => decisionsInvalid(adr.file, line, message, how);
    const entry = entries.get(adr.number);
    if (adr.number < 1) throw fail(adr.line, `ADR ${adr.id} cannot be published: a decision number goes from 0001 to ${MAX_NUMBER}`);
    if (adr.date === undefined) throw fail(adr.line, `ADR ${adr.id} has no '- Date:' line in its header`);
    if (!isDate(adr.date)) throw fail(adr.dateLine, `the date of ADR ${adr.id} must be YYYY-MM-DD and exist in the calendar, got ${JSON.stringify(adr.date)}`);
    if (!entry) {
      throw fail(
        adr.statusLine,
        `ADR ${adr.id} is ${adr.state} and has no reason for the client`,
        `write its reason under '### ${adr.id}' in the '## Decisions' section of ${progressFile ?? DEFAULT_PROGRESS}, or mark it '- internal' there`,
      );
    }
    let title = entry.title;
    if (title === undefined) {
      title = plainText(adr.title);
      const problem = textProblem(title, MAX_TITLE);
      if (problem) throw fail(adr.line, `the title of ADR ${adr.id} ${problem}; give its decision a title for the client in the progress file`);
    }
    const decision = { number: adr.number, title, date: adr.date, status: adr.state };
    if (adr.state === "superseded" && numbers.has(adr.supersededBy)) decision.supersededBy = adr.supersededBy;
    decision.reason = entry.reason;
    if (phasesOf.has(adr.number)) decision.phases = phasesOf.get(adr.number);
    return decision;
  });
}

// Every rule of the v4 format: those of the v3 under its own version, plus
// the documentation fields, each list within its limits, a deliverable or a
// decision naming phases of the snapshot, unique decision numbers and a
// supersededBy only in a superseded decision, naming a greater one.
function problems(document) {
  const found = problemsV3(document, { version: SNAPSHOT_VERSION, rootFields: DOCUMENTATION_FIELDS });
  const check = (problem, at) => problem && found.push(`${at} ${problem}`);
  const phaseIds = new Set(Array.isArray(document?.phases) ? document.phases.map((phase) => phase?.id) : []);
  const list = (name, max, each) => {
    const value = document?.[name];
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length === 0 || value.length > max) found.push(`${name}, when present, holds 1 to ${max} items`);
    else value.forEach((item, index) => each(item, `${name}[${index}]`));
  };
  if (document?.problem !== undefined) check(textProblem(document.problem, MAX_TEXT), "problem");
  list("objectives", MAX_OBJECTIVES, (item, at) => {
    if (!exactKeys(item, ["title", "measure"], [])) found.push(`${at} must hold exactly title and measure`);
    check(textProblem(item?.title, MAX_TITLE), `${at}.title`);
    check(textProblem(item?.measure, MAX_TEXT), `${at}.measure`);
  });
  list("includes", MAX_INCLUDES, (item, at) => check(textProblem(item, MAX_TITLE), at));
  list("excludes", MAX_EXCLUDES, (item, at) => {
    if (!exactKeys(item, ["title", "reason"], [])) found.push(`${at} must hold exactly title and reason`);
    check(textProblem(item?.title, MAX_TITLE), `${at}.title`);
    check(textProblem(item?.reason, MAX_TEXT), `${at}.reason`);
  });
  list("deliverables", MAX_DELIVERABLES, (item, at) => {
    if (!exactKeys(item, ["title", "phase"], ["summary", "url"])) found.push(`${at} holds title and phase, and may hold summary and url`);
    check(textProblem(item?.title, MAX_TITLE), `${at}.title`);
    if (item?.summary !== undefined) check(textProblem(item.summary, MAX_TEXT), `${at}.summary`);
    if (!phaseIds.has(item?.phase)) found.push(`${at}.phase must name a phase of the snapshot`);
    if (item?.url !== undefined) check(typeof item.url === "string" ? urlProblem(item.url) : "must be a string", `${at}.url`);
  });
  const numbers = new Set();
  list("decisions", MAX_DECISIONS, (item, at) => {
    if (!exactKeys(item, ["number", "title", "date", "status", "reason"], ["supersededBy", "phases"])) {
      found.push(`${at} holds number, title, date, status and reason, and may hold supersededBy and phases`);
    }
    if (!Number.isInteger(item?.number) || item.number < 1 || item.number > MAX_NUMBER) found.push(`${at}.number must be an integer from 1 to ${MAX_NUMBER}`);
    else if (numbers.has(item.number)) found.push(`${at}.number ${item.number} repeats an earlier decision`);
    else numbers.add(item.number);
    check(textProblem(item?.title, MAX_TITLE), `${at}.title`);
    if (!isDate(item?.date)) found.push(`${at}.date must be a date YYYY-MM-DD that exists in the calendar`);
    if (!PUBLISHED.includes(item?.status)) found.push(`${at}.status must be one of ${PUBLISHED.join(", ")}`);
    check(textProblem(item?.reason, MAX_TEXT), `${at}.reason`);
    if (item?.phases !== undefined) {
      const phases = item.phases;
      if (!Array.isArray(phases) || phases.length === 0 || phases.length > MAX_PHASES) found.push(`${at}.phases, when present, holds 1 to ${MAX_PHASES} phase ids`);
      else if (new Set(phases).size !== phases.length) found.push(`${at}.phases repeats a phase`);
      else if (!phases.every((id) => phaseIds.has(id))) found.push(`${at}.phases must name phases of the snapshot`);
    }
  });
  if (Array.isArray(document?.decisions)) {
    document.decisions.forEach((item, index) => {
      if (item?.supersededBy === undefined) return;
      const at = `decisions[${index}].supersededBy`;
      if (item.status !== "superseded") found.push(`${at} goes only in a superseded decision`);
      if (!Number.isInteger(item.supersededBy) || !numbers.has(item.supersededBy) || item.supersededBy <= item.number) {
        found.push(`${at} must name a decision of the snapshot with a greater number`);
      }
    });
  }
  return found;
}

function serializeSnapshotV4(document) {
  return serializeChecked(document, problems);
}

function buildSnapshotV4({ root, roadmap, progress }) {
  const sections = documentationSections();
  const built = documentV3({ root, roadmap, progress, sections });
  const document = { ...built.document, schemaVersion: SNAPSHOT_VERSION };
  const adrs = readAdrs(root);
  const phasesOf = adrPhases(built.phases, roadmap, adrs);
  const { found } = sections;
  const decisions = decisionsOf(adrs, found.decisions ?? new Map(), phasesOf, built.progress);
  if (found.problem !== undefined) document.problem = found.problem;
  if (found.objectives) document.objectives = found.objectives.map(({ title, measure }) => ({ title, measure }));
  if (found.includes) document.includes = found.includes;
  if (found.excludes) document.excludes = found.excludes.map(({ title, reason }) => ({ title, reason }));
  if (found.deliverables) {
    document.deliverables = found.deliverables.map(({ title, summary, phase, url }) => ({
      title,
      ...(summary !== undefined && { summary }),
      phase,
      ...(url !== undefined && { url }),
    }));
  }
  if (decisions.length > 0) document.decisions = decisions;
  return {
    roadmap,
    progress: built.progress,
    changelog: built.changelog,
    decisions: adrs === null ? null : DECISIONS_ROOT,
    snapshot: document,
    text: serializeSnapshotV4(document),
  };
}

module.exports = {
  DOCUMENTATION_FIELDS,
  MAX_DECISIONS,
  MAX_DELIVERABLES,
  MAX_EXCLUDES,
  MAX_INCLUDES,
  MAX_NUMBER,
  MAX_OBJECTIVES,
  adrPhases,
  buildSnapshotV4,
  readAdrs,
  serializeSnapshotV4,
};
