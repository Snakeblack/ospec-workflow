"use strict";

// The progress snapshot v3 (openspec/specs/idd/spec.md, REQ-idd-026, E5.12):
// the v2, with the same groups, phases, texts and requests, plus the delivery
// stage of each done phase, `release`: testing, or production with the
// version and the date that took it there. The stage comes from the changelog
// that `delivery.changelog` declares in idd/config.yaml: the entries ending in
// `(<change-id>)` that `ospec close` writes, by the `##` heading each one sits
// under. Only what decides a stage is checked, so an older history in another
// format does not stop the snapshot. Its schema is
// schemas/progress-snapshot/v3.schema.json, and nothing invalid is ever
// emitted. The v4 builds on this module (progress-snapshot-v4.js).

const fs = require("node:fs");
const path = require("node:path");

const { CONFIG_FILE, parseIddConfig } = require("./idd-config.js");
const { UNRELEASED_HEADING, VERSION_HEADING } = require("./idd-changelog.js");
const { FENCE, HEADING, SnapshotError, phaseChanges } = require("./progress-snapshot.js");
const { documentV2, exactKeys, isDate, problems: problemsV2, serializeChecked } = require("./progress-snapshot-v2.js");
const { CHANGELOG_NONE } = require("./team-profile.js");

const SNAPSHOT_VERSION = 3;
const MAX_VERSION = 64;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const ITEM = /^[-*+][ \t]+(.*)$/;
const NESTED_ITEM = /^\s+[-*+][ \t]/;
// The change id an entry ends with, before trailing spaces only.
const ENTRY_ID = /\(([^()\s]+)\)\s*$/;
// What may follow the version of a heading: nothing, or its date.
const DATE_TAIL = /^-[ \t]+(\S+)$/;

function changelogInvalid(file, line, message) {
  return new SnapshotError("changelog-invalid", `${file}:${line}: ${message}`);
}

function unreadable(error) {
  return error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EISDIR";
}

// The changelog idd/config.yaml declares, with its text, or null: none
// declared, `none`, or a file that does not exist. A configuration that does
// not parse refuses the snapshot with config-invalid.
function declaredChangelog(root) {
  let config;
  try {
    config = fs.readFileSync(path.join(root, CONFIG_FILE), "utf8");
  } catch (error) {
    if (unreadable(error)) return null;
    throw error;
  }
  const file = parseIddConfig(config).delivery.changelog;
  if (file === null || file === CHANGELOG_NONE) return null;
  try {
    return { file, text: fs.readFileSync(path.join(root, ...file.split("/")), "utf8") };
  } catch (error) {
    if (unreadable(error)) return null;
    throw error;
  }
}

// The stage a `##` heading gives the entries under it, checked the first time
// one of them counts: `## [Unreleased]` and a pre-release give testing, and a
// plain `x.y.z` with its date gives production.
function headingStage(heading, file, versions) {
  if (heading.stage) return heading.stage;
  const fail = (message) => changelogInvalid(file, heading.line, message);
  if (UNRELEASED_HEADING.test(heading.text)) return (heading.stage = { stage: "testing" });
  const parts = VERSION_HEADING.exec(heading.text);
  if (!parts) return null;
  const [major, minor, patch, suffix = ""] = parts.slice(1, 5);
  const version = `${major}.${minor}.${patch}`;
  if ([major, minor, patch].some((part) => /^0\d/.test(part))) throw fail(`version ${version}${suffix} has a leading zero`);
  if (suffix.startsWith("+")) throw fail(`version ${version}${suffix} carries build metadata; a release heading reads '## [x.y.z] - YYYY-MM-DD'`);
  const tail = heading.text.slice(parts[0].length).trim();
  const dated = DATE_TAIL.exec(tail);
  if (tail !== "" && !dated) throw fail(`a version heading reads '## [x.y.z] - YYYY-MM-DD', with nothing after the date, got ${JSON.stringify(tail)}`);
  const date = dated?.[1] ?? null;
  if (date !== null && !isDate(date)) throw fail(`the date of version ${version}${suffix} must be YYYY-MM-DD and exist in the calendar, got ${JSON.stringify(date)}`);
  if (suffix !== "") return (heading.stage = { stage: "testing" });
  if (date === null) throw fail(`version ${version} needs its date: '## [${version}] - YYYY-MM-DD'`);
  if (version.length > MAX_VERSION) throw fail(`version ${version} is longer than ${MAX_VERSION} characters`);
  const clash = versions.get(version);
  if (clash) throw fail(`version ${version} repeats the heading of line ${clash}`);
  versions.set(version, heading.line);
  return (heading.stage = { stage: "production", version, date });
}

// The stage of each change of `ids` that has an entry in the changelog. An
// entry is a `-`, `*` or `+` item at the first column, outside code fences,
// with its indented lines joined, that ends in `(<change-id>)`. Only the
// entries of `ids` and the headings that hold them are checked, in reading
// order, so a refusal names the first problem.
function changelogStages(text, file, ids) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const found = new Map();
  const versions = new Map();
  let heading = null;
  let fence = null;
  let entry = null;
  const close = () => {
    const id = entry && ENTRY_ID.exec(entry.text)?.[1];
    if (id && ids.has(id)) {
      if (heading === null) throw changelogInvalid(file, entry.line, `the entry of change ${id} sits under no '##' heading; it goes under '## [Unreleased]' or '## [x.y.z] - YYYY-MM-DD'`);
      const stage = headingStage(heading, file, versions);
      if (stage === null) {
        throw changelogInvalid(file, entry.line, `the entry of change ${id} sits under the heading of line ${heading.line}, which is neither '## [Unreleased]' nor '## [x.y.z] - YYYY-MM-DD'`);
      }
      const seen = found.get(id);
      if (seen && seen.heading !== heading.line) {
        throw changelogInvalid(file, entry.line, `the entry of change ${id} sits under the heading of line ${heading.line}, and the one of line ${seen.line} under the heading of line ${seen.heading}`);
      }
      if (!seen) found.set(id, { line: entry.line, heading: heading.line, stage });
    }
    entry = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = FENCE.exec(line)?.[1];
    if (marker && (fence === null || marker.startsWith(fence))) {
      close();
      fence = fence === null ? marker[0].repeat(3) : null;
      continue;
    }
    if (fence !== null) continue;
    if (entry && /^\s/.test(line) && line.trim() !== "" && !NESTED_ITEM.test(line)) {
      entry.text += ` ${line.trim()}`;
      continue;
    }
    close();
    const title = HEADING.exec(line);
    if (title && title[1].length <= 2) {
      heading = title[1].length === 2 ? { line: index + 1, text: line.trim() } : null;
      continue;
    }
    const item = ITEM.exec(line);
    if (item) entry = { line: index + 1, text: item[1] };
  }
  close();
  return found;
}

// Compares two x.y.z versions without leading zeros, by Semantic Versioning
// precedence, whatever their length.
function compareVersions(left, right) {
  const a = left.split(".");
  const b = right.split(".");
  for (let index = 0; index < 3; index += 1) {
    if (a[index].length !== b[index].length) return a[index].length - b[index].length;
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

// The release of a done phase from the stages of its changes: the least
// advanced wins, and in production the highest version with its date. A
// change without an entry does not count, and without any there is none.
function phaseRelease(changes, stages) {
  const found = changes.map((change) => stages.get(change.id)?.stage).filter(Boolean);
  if (found.length === 0) return undefined;
  if (found.some((stage) => stage.stage === "testing")) return { stage: "testing" };
  return found.reduce((highest, stage) => (compareVersions(stage.version, highest.version) > 0 ? stage : highest));
}

// Every rule of the v3 format: those of the v2 under its own version, plus a
// release only in a done phase, testing alone or production with its version
// and date. The v4 checks the same rules under its version, with its fields.
function problems(document, { version = SNAPSHOT_VERSION, rootFields = [] } = {}) {
  const found = problemsV2(document, { version, phaseFields: ["release"], rootFields });
  if (!Array.isArray(document?.phases)) return found;
  document.phases.forEach((phase, index) => {
    const release = phase?.release;
    if (release === undefined) return;
    const at = `phases[${index}].release`;
    if (phase.status !== "done") found.push(`${at} goes only in a done phase`);
    if (release?.stage === "testing") {
      if (!exactKeys(release, ["stage"], [])) found.push(`${at} in testing holds only stage`);
    } else if (release?.stage === "production") {
      if (!exactKeys(release, ["stage", "version", "date"], [])) found.push(`${at} in production holds exactly stage, version and date`);
      if (typeof release.version !== "string" || !VERSION.test(release.version) || release.version.length > MAX_VERSION) {
        found.push(`${at}.version must be x.y.z without leading zeros, pre-release or build, of at most ${MAX_VERSION} characters`);
      }
      if (!isDate(release.date)) found.push(`${at}.date must be a date YYYY-MM-DD that exists in the calendar`);
    } else found.push(`${at}.stage must be testing or production`);
  });
  return found;
}

function serializeSnapshotV3(document) {
  return serializeChecked(document, problems);
}

// The v3 document of a project, with the progress file and the changelog it
// read and what the v2 came from, which the v4 reads again.
function documentV3({ root, roadmap, progress, sections = null }) {
  const built = documentV2({ root, roadmap, progress, sections });
  const document = { ...built.document, schemaVersion: SNAPSHOT_VERSION };
  const changelog = declaredChangelog(root);
  if (changelog !== null) {
    const owned = phaseChanges(built.phases, built.changes);
    const done = document.phases.filter((phase) => phase.status === "done");
    const ids = new Set(done.flatMap((phase) => owned.get(phase.id).map((change) => change.id)));
    const stages = changelogStages(changelog.text, changelog.file, ids);
    for (const phase of done) {
      const release = phaseRelease(owned.get(phase.id), stages);
      if (release) phase.release = release;
    }
  }
  return { ...built, changelog: changelog?.file ?? null, document };
}

function buildSnapshotV3({ root, roadmap, progress }) {
  const { progress: read, changelog, document } = documentV3({ root, roadmap, progress });
  return { roadmap, progress: read, changelog, snapshot: document, text: serializeSnapshotV3(document) };
}

module.exports = {
  MAX_VERSION,
  VERSION,
  buildSnapshotV3,
  changelogStages,
  compareVersions,
  documentV3,
  phaseRelease,
  problems,
  serializeSnapshotV3,
};
