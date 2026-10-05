"use strict";

// `ospec close` for IDD changes (openspec/specs/idd/spec.md, REQ-idd-004,
// REQ-idd-009, REQ-idd-017). Closing settles the living document, refuses
// while an obligation is pending or a gate is open, records `status: closed`
// with `closed_at` (the resume marker) and then moves idd/<id>/ to
// idd/archive/<date>-<id>/ transactionally: the inventory digest of O6A must
// match on both sides, a failed rename falls back to copy, compare and remove,
// and running close again finishes an interrupted move. Delivery stays outside.

const fsp = require("node:fs/promises");
const path = require("node:path");

const { computeInventory, fingerprintInventory } = require("./archive-transaction.js");
const {
  ARCHIVE_ROOT,
  CHANGE_ROOT,
  EVIDENCE_MARKERS,
  LIVING_DOC_SECTIONS,
  canClose,
  isIntentAmbiguous,
} = require("./idd-contract.js");
const { IddRecordError } = require("./idd-record.js");

const LIVING_DOC = "living-doc";
// The model writes these sections; they must say something at close.
const AUTHORED_SECTIONS = Object.freeze(["Plan", "Decisions"]);

function refuse(code, message) {
  throw new IddRecordError(code, message);
}

function sectionsOf(text) {
  const sections = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) sections.push({ heading: heading[1], body: [] });
    else if (sections.length > 0) sections.at(-1).body.push(line);
  }
  return sections;
}

/** Whether change.md is current enough to close (REQ-idd-004). */
function livingDocStatus(text) {
  if (typeof text !== "string") return { ok: false, reason: "change.md is missing" };
  const sections = sectionsOf(text);
  const headings = sections.map((section) => section.heading);
  if (headings.join("\n") !== LIVING_DOC_SECTIONS.join("\n")) {
    return { ok: false, reason: `change.md must keep the sections ${LIVING_DOC_SECTIONS.join(", ")} in that order` };
  }
  for (const name of AUTHORED_SECTIONS) {
    const body = sections.find((section) => section.heading === name).body.join("\n");
    if (body.trim() === "") return { ok: false, reason: `the section ${name} is empty in change.md` };
  }
  const evidence = sections.at(-1).body.join("\n");
  const start = evidence.indexOf(EVIDENCE_MARKERS.start);
  if (start === -1 || evidence.indexOf(EVIDENCE_MARKERS.end, start) === -1) {
    return { ok: false, reason: "change.md lost its evidence markers" };
  }
  return { ok: true, reason: null };
}

/** Rewrites only the CLI-owned text between the evidence markers. */
function renderEvidence(text, state) {
  const start = text.indexOf(EVIDENCE_MARKERS.start);
  const end = text.indexOf(EVIDENCE_MARKERS.end, start);
  if (start === -1 || end === -1) return text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = state.evidence.map((entry) => `- ${entry.id}: ${entry.kind} for ${entry.obligation} (${entry.recorded_at})`);
  const body = lines.length ? `${eol}${lines.join(eol)}${eol}` : eol;
  return `${text.slice(0, start + EVIDENCE_MARKERS.start.length)}${body}${text.slice(end)}`;
}

/**
 * Closes an open change: the living document, when active and pending, is
 * settled first; then nothing may stay pending and no gate open.
 */
function closeChange(state, { closedAt, livingDoc = null }) {
  if (state.status === "closed") refuse("change-closed", `change ${state.change} is closed`);
  if (isIntentAmbiguous(state)) refuse("ambiguous-intent-open", "a change with an ambiguous intent cannot close");
  const next = structuredClone(state);
  const doc = next.obligations.find((entry) => entry.id === LIVING_DOC && entry.status === "pending");
  if (doc) {
    if (!livingDoc?.ok) refuse("close-refused", `close refused: living-doc: ${livingDoc?.reason || "change.md was not read"}`);
    const id = `ev-${next.evidence.length + 1}`;
    next.evidence.push({ id, kind: "living-doc-current", obligation: LIVING_DOC, recorded_at: closedAt });
    doc.status = "satisfied";
    doc.evidence = [id];
  }
  const { ok, blocking } = canClose(next);
  if (!ok) refuse("close-refused", `close refused: ${blocking.join(", ")}`);
  next.status = "closed";
  next.closed_at = closedAt;
  return { state: next };
}

function archiveName(state) {
  return `${state.closed_at.slice(0, 10)}-${state.change}`;
}

async function exists(file) {
  try {
    await fsp.stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function inventoryOf(dir) {
  const inventory = await computeInventory(dir);
  return { files: inventory.length, digest: fingerprintInventory(inventory) };
}

/**
 * Moves a closed change to idd/archive/<date>-<id>/ (REQ-idd-017). Safe to
 * run again after an interruption at any point.
 */
async function archiveChange(root, state) {
  if (state.status !== "closed" || !state.closed_at) {
    throw new IddRecordError("change-open", `change ${state.change} must be closed before it is archived`);
  }
  const relative = `${ARCHIVE_ROOT}/${archiveName(state)}`;
  const origin = path.join(root, CHANGE_ROOT, state.change);
  const destination = path.join(root, ...relative.split("/"));
  const receipt = (inventory, alreadyComplete) => ({
    change: state.change,
    destination: relative,
    files: inventory.files,
    inventory_sha256: inventory.digest,
    already_complete: alreadyComplete,
  });

  const hasOrigin = await exists(origin);
  const hasDestination = await exists(destination);
  if (!hasOrigin && hasDestination) return receipt(await inventoryOf(destination), true);
  if (!hasOrigin) throw new IddRecordError("unknown-change", `change ${state.change} is neither open nor archived`);

  const expected = await inventoryOf(origin);
  if (hasDestination) {
    // A copy finished before the origin was removed: finish only if identical.
    const copied = await inventoryOf(destination);
    if (copied.digest !== expected.digest) {
      throw new IddRecordError("archive-conflict", `${relative} already exists with other content`);
    }
    await fsp.rm(origin, { recursive: true, force: true });
    return receipt(copied, false);
  }

  await fsp.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fsp.rename(origin, destination);
  } catch (error) {
    if (!["EPERM", "EXDEV", "EBUSY", "EACCES"].includes(error.code)) throw error;
    const staging = `${destination}.partial`;
    await fsp.rm(staging, { recursive: true, force: true });
    await fsp.cp(origin, staging, { recursive: true });
    if ((await inventoryOf(staging)).digest !== expected.digest) {
      await fsp.rm(staging, { recursive: true, force: true });
      throw new IddRecordError("archive-failed", `copying ${state.change} to ${relative} changed its content`);
    }
    await fsp.rename(staging, destination);
    await fsp.rm(origin, { recursive: true, force: true });
  }
  const moved = await inventoryOf(destination);
  if (moved.digest !== expected.digest) {
    throw new IddRecordError("archive-failed", `${relative} does not hold what ${CHANGE_ROOT}/${state.change} held`);
  }
  return receipt(moved, false);
}

module.exports = {
  archiveChange,
  archiveName,
  closeChange,
  livingDocStatus,
  renderEvidence,
};
