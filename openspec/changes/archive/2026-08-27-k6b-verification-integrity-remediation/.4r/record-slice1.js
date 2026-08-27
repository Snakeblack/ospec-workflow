"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { recordCorrection } = require("../../../../scripts/lib/review-lineage.js");

const dir = __dirname;
const ROOT = path.resolve(__dirname, "../../../..");
const lineagePath = path.join(dir, "lineage.json");
let lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));

function sha256Bytes(buf) {
  return `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

const pending = lineage.pending_correction;
const genesis = lineage.genesis.candidate;
const fileDigests = {};
for (const rel of genesis.paths) {
  fileDigests[rel] = sha256Bytes(fs.readFileSync(path.join(ROOT, rel)));
}

const corrected = {
  projection: genesis.projection,
  base_tree: genesis.base_tree,
  candidate_tree: sha256Bytes(Buffer.from(JSON.stringify(fileDigests))),
  paths: genesis.paths.slice(),
  diff_hash: sha256Bytes(fs.readFileSync(path.join(dir, "unified.diff"))),
  paths_digest: genesis.paths_digest,
  authored_lines: genesis.authored_lines,
  original_changed_lines: genesis.original_changed_lines,
};

lineage = recordCorrection(lineage, {
  request_id: "slice-1-correction-record",
  expected_revision: lineage.revision,
  base_candidate_id: pending.base_candidate_id,
  paths: pending.paths,
  actual_changed_lines: 177,
  corrected_candidate: corrected,
});

fs.writeFileSync(lineagePath, JSON.stringify(lineage, null, 2));
console.log(JSON.stringify({
  status: lineage.status,
  revision: lineage.revision,
  current_candidate_id: lineage.current_candidate_id,
  active_slice_id: lineage.active_slice_id,
  used_lines: lineage.correction_slices[lineage.active_slice_id].used_lines,
}, null, 2));
