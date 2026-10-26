"use strict";

// The progress snapshot v2 (openspec/specs/idd/spec.md, REQ-idd-026, E5.11):
// the phases of the v1, with the same status and order, plus the groups of
// the roadmap, its `##` headings with phase tables, and the client texts of a
// progress file, `docs/progress.md` unless --progress names another. Like the
// v1 it declares only its version (ADR 0012), its schema is
// schemas/progress-snapshot/v2.schema.json and nothing invalid is ever
// emitted: a progress file out of its syntax is refused at the line of the
// first problem, and nothing is cut.

const fs = require("node:fs");
const path = require("node:path");

const {
  CONTROL,
  FENCE,
  HEADING,
  MAX_BYTES,
  MAX_PHASES,
  MAX_TITLE,
  PHASE_ID_PATTERN,
  STATUSES,
  SnapshotError,
  phaseStatuses,
  plainText,
  readChanges,
  readRoadmap,
  roadmapPhases,
} = require("./progress-snapshot.js");

const SNAPSHOT_VERSION = 2;
const DEFAULT_PROGRESS = "docs/progress.md";
const MAX_GROUPS = 20;
const MAX_TEXT = 1000;
const MAX_SHORT = 40;
const MAX_TASKS = 50;
const MAX_OUTCOMES = 10;
const MAX_REQUESTS = 10;
const MAX_URL = 2048;
// `<ID>. <title>` or `<ID>.` alone, once clean.
const NAMED = /^([A-Za-z0-9][A-Za-z0-9.-]*?)\.(?:\s+(.*))?$/;
const ITEM = /^[-*+][ \t]+(.*)$/;
const NESTED_ITEM = /^\s+[-*+][ \t]/;
const TASK = /^\[([ xX])\][ \t]+(.*)$/;
const TASK_TEXT = /^([^\s:]+):\s+(.*)$/;
const KEY = /^([A-Za-z]+):[ \t]*(.*)$/;
// Block starts the syntax has no place for: quotes, tables, HTML, ordered
// lists, thematic breaks and indented code.
const OTHER_BLOCK = /^(?: {0,3}(?:>|\||<|\d{1,9}[.)](?:\s|$)|(?:[-*_][ \t]*){3,}$)| {4}|\t)/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PHASE_KEYS = Object.freeze({ short: "shortTitle", start: "start", end: "end", preview: "previewUrl" });
const REQUEST_KEYS = Object.freeze({ phase: "phase", due: "due" });
const SECTIONS = Object.freeze({ Tasks: "tasks", Outcomes: "outcomes" });
const REQUESTS_HEADING = "Requests";

function roadmapInvalid(file, line, message) {
  return new SnapshotError("roadmap-invalid", `${file}:${line}: ${message}`);
}

function progressInvalid(file, line, message) {
  return new SnapshotError("progress-invalid", `${file}:${line}: ${message}`);
}

// The id a heading without `<ID>.` gives: lower case, without diacritics,
// each run of other characters a hyphen, none at either end.
function derivedId(text) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isDate(value) {
  const parts = DATE.exec(value);
  if (!parts) return false;
  const [year, month, day] = parts.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Why a preview URL breaks the format, or null.
function urlProblem(value) {
  if (!value.startsWith("https://")) return "must be a bare https:// URL";
  if ([...value].length > MAX_URL) return `must hold at most ${MAX_URL} characters`;
  if (/\s/.test(value) || CONTROL.test(value)) return "must hold no whitespace or control characters";
  if (/^https:\/\/[^/?#]*@/.test(value)) return "must hold no user or password";
  let url;
  try {
    url = new URL(value);
  } catch {
    return "is not a URL";
  }
  if (url.hostname === "") return "needs a host";
  return null;
}

// Why a text breaks the format, or null.
function textProblem(value, max) {
  if (typeof value !== "string" || value.length === 0 || [...value].length > max) return `must hold 1 to ${max} characters`;
  if (value !== value.trim() || value !== value.normalize("NFC") || CONTROL.test(value)) return "must be trimmed, NFC and free of control characters";
  return null;
}

// The groups of a roadmap, from the `##` headings of its phase tables, and
// the group of each phase. A roadmap without them has no groups.
function roadmapGroups(phases, file) {
  if (phases.every((phase) => phase.heading === null)) return { groups: [], groupOf: new Map() };
  const loose = phases.find((phase) => phase.heading === null);
  if (loose) throw roadmapInvalid(file, loose.line, `phase ${loose.id} sits outside every '##' group while other phases sit in one`);
  const groups = [];
  const groupOf = new Map();
  for (const phase of phases) {
    if (groups.at(-1)?.heading !== phase.heading) {
      const { text, line } = phase.heading;
      const clean = plainText(text);
      const named = NAMED.exec(clean);
      const id = named ? named[1].toLowerCase() : derivedId(clean);
      const title = named ? named[2] ?? "" : clean;
      if (!PHASE_ID_PATTERN.test(id)) {
        throw roadmapInvalid(file, line, `the group heading gives the id ${JSON.stringify(id)}, which must match ${PHASE_ID_PATTERN.source}; write it as '<ID>. <title>'`);
      }
      const problem = textProblem(title, MAX_TITLE);
      if (problem) throw roadmapInvalid(file, line, `the title of group ${id} ${problem}`);
      const clash = groups.find((group) => group.id === id);
      if (clash) throw roadmapInvalid(file, line, `group id ${id} repeats the group of line ${clash.line}`);
      groups.push({ id, title, line, heading: phase.heading });
    }
    groupOf.set(phase.id, groups.at(-1).id);
  }
  return { groups: groups.map(({ id, title, line }) => ({ id, title, line })), groupOf };
}

// The blocks of a progress file after its free introduction: headings, items
// and paragraphs, each with its line. An item or a paragraph takes the lines
// that follow it until a blank line, a heading or another item.
function progressBlocks(lines, file) {
  const blocks = [];
  let fence = null;
  let started = false;
  let open = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const at = index + 1;
    if (!started) {
      const marker = FENCE.exec(line)?.[1];
      if (marker && (fence === null || marker.startsWith(fence))) fence = fence === null ? marker[0].repeat(3) : null;
      const heading = fence === null ? HEADING.exec(line) : null;
      if (!heading || heading[1].length < 2) continue;
      started = true;
    }
    if (line.trim() === "") {
      open = null;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", line: at, level: heading[1].length, text: heading[2] ?? "" });
      open = null;
      continue;
    }
    if (NESTED_ITEM.test(line)) throw progressInvalid(file, at, "nested lists are out of the format; an item starts at the first column");
    const item = ITEM.exec(line);
    if (item) {
      open = { kind: "item", line: at, text: item[1] };
      blocks.push(open);
      continue;
    }
    if (open) {
      open.text += ` ${line}`;
      continue;
    }
    if (FENCE.test(line) || OTHER_BLOCK.test(line)) {
      throw progressInvalid(file, at, "out of the format: after the introduction a progress file holds only headings, '- ' items and paragraphs");
    }
    open = { kind: "paragraph", line: at, text: line };
    blocks.push(open);
  }
  return blocks;
}

// The client texts of a progress file, checked against the roadmap in one
// pass so that a refusal names the first problem: `## <ID>. <title>` for a
// group, `### <ID>. <title>` for a phase under the `##` of its group, its
// `- <key>: <value>` items, paragraph, `#### Tasks` and `#### Outcomes`, and
// `## Requests` with one `### <id>. <title>` per request.
function parseProgress(text, file, roadmap) {
  const fail = (line, message) => progressInvalid(file, line, message);
  // A heading is clean already: cleaning it twice would drop escaped emphasis.
  const checked = (clean, max, what, line) => {
    const problem = textProblem(clean, max);
    if (problem) throw fail(line, `${what} ${problem}`);
    return clean;
  };
  const cleanText = (value, max, what, line) => checked(plainText(value), max, what, line);
  const cleanId = (value, what, line) => {
    const id = value.toLowerCase();
    if (!PHASE_ID_PATTERN.test(id)) throw fail(line, `${what} ${JSON.stringify(value)} must match ${PHASE_ID_PATTERN.source} once in lower case`);
    return id;
  };
  const groups = new Map();
  const phases = new Map();
  const requests = [];
  let group = null;
  let inRequests = false;
  let seenRequests = false;
  let entry = null;
  let section = null;

  // A section heading without items is an empty list.
  const closeSection = () => {
    if (section && entry[section.field] === undefined) throw fail(section.line, `'#### ${section.heading}' holds no items; leave the heading out when there are none`);
    section = null;
  };

  for (const block of progressBlocks(text.replace(/^﻿/, "").split(/\r?\n/), file)) {
    const { line } = block;
    if (block.kind === "heading") {
      closeSection();
      const heading = plainText(block.text);
      const named = NAMED.exec(heading);
      if (block.level === 2) {
        entry = null;
        group = null;
        inRequests = heading === REQUESTS_HEADING;
        if (inRequests) {
          if (seenRequests) throw fail(line, `'## ${REQUESTS_HEADING}' repeats an earlier one`);
          seenRequests = true;
          continue;
        }
        if (!named) throw fail(line, `a '##' heading reads '<ID>. <title>' for a group of the roadmap, or '${REQUESTS_HEADING}'`);
        const id = named[1].toLowerCase();
        if (!roadmap.groups.has(id)) throw fail(line, `group ${id} is not a group of the roadmap`);
        if (groups.has(id)) throw fail(line, `group ${id} repeats the one of line ${groups.get(id).line}`);
        group = { id, line };
        if (named[2] !== undefined) group.title = checked(named[2], MAX_TITLE, `the title of group ${id}`, line);
        groups.set(id, group);
        continue;
      }
      if (block.level === 3) {
        if (!named) throw fail(line, `a '###' heading reads '<ID>. <title>' for a ${inRequests ? "request" : "phase of the roadmap"}`);
        if (inRequests) {
          if (requests.length === MAX_REQUESTS) throw fail(line, `more than ${MAX_REQUESTS} requests`);
          const id = cleanId(named[1], "the request id", line);
          const clash = requests.find((request) => request.id === id);
          if (clash) throw fail(line, `request ${id} repeats the one of line ${clash.line}`);
          if (named[2] === undefined) throw fail(line, `request ${id} needs a title: '### ${named[1]}. <title>'`);
          entry = { kind: "request", id, line, title: checked(named[2], MAX_TITLE, `the title of request ${id}`, line), keys: new Map() };
          requests.push(entry);
          continue;
        }
        const id = named[1].toLowerCase();
        if (!roadmap.phases.has(id)) throw fail(line, `phase ${id} is not a phase of the roadmap`);
        if (phases.has(id)) throw fail(line, `phase ${id} repeats the one of line ${phases.get(id).line}`);
        const owner = roadmap.phases.get(id).group;
        if ((group?.id ?? null) !== owner) {
          const where = owner === null ? "outside every group, as the roadmap has none" : `under the '##' heading of group ${owner}`;
          throw fail(line, `phase ${id} goes ${where}`);
        }
        entry = { kind: "phase", id, line, keys: new Map() };
        if (named[2] !== undefined) entry.title = checked(named[2], MAX_TITLE, `the title of phase ${id}`, line);
        phases.set(id, entry);
        continue;
      }
      if (block.level === 4) {
        const field = SECTIONS[heading];
        if (entry?.kind !== "phase") throw fail(line, "a '####' heading goes inside a phase");
        if (!field) throw fail(line, `a '####' heading inside a phase is '${Object.keys(SECTIONS).join("' or '")}'`);
        if (entry[`${field}Line`] !== undefined) throw fail(line, `'#### ${heading}' repeats the one of line ${entry[`${field}Line`]}`);
        entry[`${field}Line`] = line;
        section = { field, heading, line };
        continue;
      }
      throw fail(line, `a '${"#".repeat(block.level)}' heading is out of the format`);
    }

    if (block.kind === "paragraph") {
      const owner = entry ?? group;
      if (!owner) throw fail(line, `'## ${REQUESTS_HEADING}' holds only '### <id>. <title>' requests`);
      if (section) throw fail(line, `'#### ${section.heading}' holds only items`);
      const field = owner.kind === "request" ? "body" : "summary";
      const what = owner.kind ? `the ${field} of ${owner.kind} ${owner.id}` : `the summary of group ${owner.id}`;
      if (owner[field] !== undefined) throw fail(line, `${what} is one paragraph; a second one starts here`);
      owner[field] = cleanText(block.text, MAX_TEXT, what, line);
      continue;
    }

    // An item: a key of its phase or request, a task or an outcome.
    if (!entry) throw fail(line, group ? `group ${group.id} holds only its title and a paragraph` : `'## ${REQUESTS_HEADING}' holds only '### <id>. <title>' requests`);
    const raw = block.text.trim();
    if (section?.field === "tasks") {
      const task = TASK.exec(raw);
      const parts = task && TASK_TEXT.exec(task[2]);
      if (!parts) throw fail(line, "a task reads '- [ ] <id>: <title>' or '- [x] <id>: <title>'");
      const tasks = (entry.tasks ??= []);
      if (tasks.length === MAX_TASKS) throw fail(line, `phase ${entry.id} holds more than ${MAX_TASKS} tasks`);
      const id = cleanId(parts[1], "the task id", line);
      const clash = tasks.find((other) => other.id === id);
      if (clash) throw fail(line, `task ${id} repeats the one of line ${clash.line}`);
      const done = task[1] !== " ";
      if (!done && roadmap.phases.get(entry.id).status === "done") throw fail(line, `phase ${entry.id} is done, so task ${id} must be checked: '- [x]'`);
      tasks.push({ id, title: cleanText(parts[2], MAX_TITLE, `the title of task ${id}`, line), done, line });
      continue;
    }
    if (section?.field === "outcomes") {
      if (TASK.test(raw)) throw fail(line, "an outcome reads '- <text>', without a checkbox");
      const outcomes = (entry.outcomes ??= []);
      if (outcomes.length === MAX_OUTCOMES) throw fail(line, `phase ${entry.id} holds more than ${MAX_OUTCOMES} outcomes`);
      outcomes.push(cleanText(raw, MAX_TITLE, "an outcome", line));
      continue;
    }
    const keys = entry.kind === "phase" ? PHASE_KEYS : REQUEST_KEYS;
    const pair = KEY.exec(raw);
    if (!pair || !Object.hasOwn(keys, pair[1])) {
      const where = entry.kind === "phase" ? `of phase ${entry.id} outside its '####' sections` : `of request ${entry.id}`;
      throw fail(line, `an item ${where} reads '- <key>: <value>', with the key ${Object.keys(keys).join(", ")}`);
    }
    const [, key, value] = pair;
    if (entry.keys.has(key)) throw fail(line, `key ${key} repeats the one of line ${entry.keys.get(key)}`);
    entry.keys.set(key, line);
    const field = keys[key];
    if (key === "short") entry[field] = cleanText(value, MAX_SHORT, `the short title of phase ${entry.id}`, line);
    else if (key === "preview") {
      const problem = urlProblem(value.trim());
      if (problem) throw fail(line, `the preview URL of phase ${entry.id} ${problem}`);
      entry[field] = value.trim();
    } else if (key === "phase") {
      const id = value.trim().toLowerCase();
      if (!roadmap.phases.has(id)) throw fail(line, `request ${entry.id} names phase ${JSON.stringify(value.trim())}, which is not a phase of the roadmap`);
      entry[field] = id;
    } else {
      const date = value.trim();
      if (!isDate(date)) throw fail(line, `${key} must be a date YYYY-MM-DD that exists in the calendar, got ${JSON.stringify(date)}`);
      entry[field] = date;
      if (entry.start !== undefined && entry.end !== undefined && entry.start > entry.end) throw fail(line, `start ${entry.start} is after end ${entry.end}`);
    }
  }
  closeSection();
  return { groups, phases, requests };
}

// The v2 document: the roadmap's groups and phases with the texts of the
// progress file, every field in the order of the schema, empty ones left out.
function assemble(groups, phases, progress) {
  const document = { schemaVersion: SNAPSHOT_VERSION };
  if (groups.length > 0) {
    document.groups = groups.map(({ id, title }) => {
      const texts = progress.groups.get(id) ?? {};
      return { id, title: texts.title ?? title, ...(texts.summary !== undefined && { summary: texts.summary }) };
    });
  }
  document.phases = phases.map(({ id, title, status, group }) => {
    const texts = progress.phases.get(id) ?? {};
    const phase = { id, title: texts.title ?? title, status };
    if (group !== undefined) phase.group = group;
    for (const field of ["shortTitle", "start", "end", "summary"]) if (texts[field] !== undefined) phase[field] = texts[field];
    if (texts.tasks) phase.tasks = texts.tasks.map((task) => ({ id: task.id, title: task.title, done: task.done }));
    if (texts.outcomes) phase.outcomes = texts.outcomes;
    if (texts.previewUrl !== undefined) phase.previewUrl = texts.previewUrl;
    return phase;
  });
  if (progress.requests.length > 0) {
    document.requests = progress.requests.map(({ id, phase, title, body, due }) => ({
      id,
      ...(phase !== undefined && { phase }),
      title,
      ...(body !== undefined && { body }),
      ...(due !== undefined && { due }),
    }));
  }
  return document;
}

function exactKeys(value, required, optional) {
  const keys = Object.keys(value ?? {});
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}

// Every rule of the v2 format, checked on what is about to be emitted.
function problems(document) {
  const found = [];
  const check = (problem, at) => problem && found.push(`${at} ${problem}`);
  const checkDate = (value, at) => !isDate(value) && found.push(`${at} must be a date YYYY-MM-DD that exists in the calendar`);
  if (!exactKeys(document, ["schemaVersion", "phases"], ["groups", "requests"])) found.push("the snapshot holds schemaVersion and phases, and may hold groups and requests");
  if (document?.schemaVersion !== SNAPSHOT_VERSION) found.push(`schemaVersion must be ${SNAPSHOT_VERSION}`);
  const groups = document?.groups;
  const groupIds = new Set();
  if (groups !== undefined) {
    if (!Array.isArray(groups) || groups.length === 0) found.push("groups, when present, holds at least one group");
    else
      groups.forEach((group, index) => {
        const at = `groups[${index}]`;
        if (!exactKeys(group, ["id", "title"], ["summary"])) found.push(`${at} holds id and title, and may hold summary`);
        if (typeof group?.id !== "string" || !PHASE_ID_PATTERN.test(group.id)) found.push(`${at}.id must match ${PHASE_ID_PATTERN.source}`);
        else if (groupIds.has(group.id)) found.push(`${at}.id ${group.id} repeats an earlier group`);
        else groupIds.add(group.id);
        check(textProblem(group?.title, MAX_TITLE), `${at}.title`);
        if (group?.summary !== undefined) check(textProblem(group.summary, MAX_TEXT), `${at}.summary`);
      });
  }
  const phases = document?.phases;
  const phaseIds = new Set();
  if (!Array.isArray(phases) || phases.length === 0) found.push("phases must hold at least one phase");
  else {
    const closed = new Set();
    let current = null;
    phases.forEach((phase, index) => {
      const at = `phases[${index}]`;
      const optional = ["group", "shortTitle", "start", "end", "summary", "tasks", "outcomes", "previewUrl"];
      if (!exactKeys(phase, ["id", "title", "status"], optional)) found.push(`${at} holds id, title and status, and may hold ${optional.join(", ")}`);
      if (typeof phase?.id !== "string" || !PHASE_ID_PATTERN.test(phase.id)) found.push(`${at}.id must match ${PHASE_ID_PATTERN.source}`);
      else if (phaseIds.has(phase.id)) found.push(`${at}.id ${phase.id} repeats an earlier phase`);
      else phaseIds.add(phase.id);
      check(textProblem(phase?.title, MAX_TITLE), `${at}.title`);
      if (!STATUSES.includes(phase?.status)) found.push(`${at}.status must be one of ${STATUSES.join(", ")}`);
      if (groups === undefined) {
        if (phase?.group !== undefined) found.push(`${at}.group names a group, but the snapshot has none`);
      } else if (!groupIds.has(phase?.group)) found.push(`${at}.group must name a group of the snapshot`);
      else if (phase.group !== current) {
        if (closed.has(phase.group)) found.push(`${at}.group ${phase.group} is not consecutive with its other phases`);
        if (current !== null) closed.add(current);
        current = phase.group;
      }
      if (phase?.shortTitle !== undefined) check(textProblem(phase.shortTitle, MAX_SHORT), `${at}.shortTitle`);
      if (phase?.start !== undefined) checkDate(phase.start, `${at}.start`);
      if (phase?.end !== undefined) checkDate(phase.end, `${at}.end`);
      if (isDate(phase?.start) && isDate(phase?.end) && phase.start > phase.end) found.push(`${at}.start is after its end`);
      if (phase?.summary !== undefined) check(textProblem(phase.summary, MAX_TEXT), `${at}.summary`);
      if (phase?.tasks !== undefined) {
        if (!Array.isArray(phase.tasks) || phase.tasks.length === 0 || phase.tasks.length > MAX_TASKS) found.push(`${at}.tasks, when present, holds 1 to ${MAX_TASKS} tasks`);
        else {
          const taskIds = new Set();
          phase.tasks.forEach((task, taskIndex) => {
            const taskAt = `${at}.tasks[${taskIndex}]`;
            if (!exactKeys(task, ["id", "title", "done"], [])) found.push(`${taskAt} must hold exactly id, title and done`);
            if (typeof task?.id !== "string" || !PHASE_ID_PATTERN.test(task.id)) found.push(`${taskAt}.id must match ${PHASE_ID_PATTERN.source}`);
            else if (taskIds.has(task.id)) found.push(`${taskAt}.id ${task.id} repeats an earlier task of its phase`);
            else taskIds.add(task.id);
            check(textProblem(task?.title, MAX_TITLE), `${taskAt}.title`);
            if (typeof task?.done !== "boolean") found.push(`${taskAt}.done must be true or false`);
            else if (!task.done && phase.status === "done") found.push(`${taskAt}.done must be true in a done phase`);
          });
        }
      }
      if (phase?.outcomes !== undefined) {
        if (!Array.isArray(phase.outcomes) || phase.outcomes.length === 0 || phase.outcomes.length > MAX_OUTCOMES) found.push(`${at}.outcomes, when present, holds 1 to ${MAX_OUTCOMES} texts`);
        else phase.outcomes.forEach((outcome, outcomeIndex) => check(textProblem(outcome, MAX_TITLE), `${at}.outcomes[${outcomeIndex}]`));
      }
      if (phase?.previewUrl !== undefined) check(typeof phase.previewUrl === "string" ? urlProblem(phase.previewUrl) : "must be a string", `${at}.previewUrl`);
    });
    for (const id of groupIds) if (!phases.some((phase) => phase?.group === id)) found.push(`group ${id} holds no phase`);
  }
  const requests = document?.requests;
  if (requests !== undefined) {
    if (!Array.isArray(requests) || requests.length === 0 || requests.length > MAX_REQUESTS) found.push(`requests, when present, holds 1 to ${MAX_REQUESTS} requests`);
    else {
      const requestIds = new Set();
      requests.forEach((request, index) => {
        const at = `requests[${index}]`;
        if (!exactKeys(request, ["id", "title"], ["phase", "body", "due"])) found.push(`${at} holds id and title, and may hold phase, body and due`);
        if (typeof request?.id !== "string" || !PHASE_ID_PATTERN.test(request.id)) found.push(`${at}.id must match ${PHASE_ID_PATTERN.source}`);
        else if (requestIds.has(request.id)) found.push(`${at}.id ${request.id} repeats an earlier request`);
        else requestIds.add(request.id);
        if (request?.phase !== undefined && !phaseIds.has(request.phase)) found.push(`${at}.phase must name a phase of the snapshot`);
        check(textProblem(request?.title, MAX_TITLE), `${at}.title`);
        if (request?.body !== undefined) check(textProblem(request.body, MAX_TEXT), `${at}.body`);
        if (request?.due !== undefined) checkDate(request.due, `${at}.due`);
      });
    }
  }
  return found;
}

// The snapshot text, or a refusal: nothing invalid is ever emitted.
function serializeSnapshotV2(document) {
  if (Array.isArray(document?.phases) && document.phases.length > MAX_PHASES) {
    throw new SnapshotError("snapshot-limit", `the snapshot would hold ${document.phases.length} phases; the limit is ${MAX_PHASES}`);
  }
  if (Array.isArray(document?.groups) && document.groups.length > MAX_GROUPS) {
    throw new SnapshotError("snapshot-limit", `the snapshot would hold ${document.groups.length} groups; the limit is ${MAX_GROUPS}`);
  }
  const found = problems(document);
  if (found.length > 0) throw new SnapshotError("snapshot-invalid", `the snapshot would break its format: ${found.join("; ")}`);
  const text = `${JSON.stringify(document, null, 2)}\n`;
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_BYTES) throw new SnapshotError("snapshot-limit", `the snapshot would take ${bytes} bytes; the limit is ${MAX_BYTES} (64 KiB)`);
  return text;
}

// The progress file, or null when the default one does not exist; one that
// --progress names must exist.
function readProgress(root, file, named) {
  try {
    return fs.readFileSync(path.resolve(root, file), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
    if (!named) return null;
    throw new SnapshotError("progress-missing", `progress file not found: ${file}`, `pass --progress <path> to read another one, or leave it out to read ${DEFAULT_PROGRESS} when it exists`);
  }
}

function buildSnapshotV2({ root, roadmap, progress }) {
  const phases = roadmapPhases(readRoadmap(root, roadmap), roadmap);
  const { groups, groupOf } = roadmapGroups(phases, roadmap);
  const statuses = phaseStatuses(phases, readChanges(root)).map((phase) => ({ ...phase, group: groupOf.get(phase.id) }));
  const file = progress ?? DEFAULT_PROGRESS;
  const text = readProgress(root, file, progress !== undefined);
  const context = {
    groups: new Set(groups.map((group) => group.id)),
    phases: new Map(statuses.map(({ id, status, group }) => [id, { status, group: group ?? null }])),
  };
  const texts = text === null ? { groups: new Map(), phases: new Map(), requests: [] } : parseProgress(text, file, context);
  const document = assemble(groups, statuses, texts);
  return { roadmap, progress: text === null ? null : file, snapshot: document, text: serializeSnapshotV2(document) };
}

module.exports = {
  DEFAULT_PROGRESS,
  MAX_GROUPS,
  MAX_OUTCOMES,
  MAX_REQUESTS,
  MAX_SHORT,
  MAX_TASKS,
  MAX_TEXT,
  MAX_URL,
  buildSnapshotV2,
  derivedId,
  parseProgress,
  roadmapGroups,
  serializeSnapshotV2,
};
