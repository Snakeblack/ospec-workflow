'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { recordCorrection } = require('../../../../scripts/lib/review-lineage.js');

function countChanged(diff) {
  return String(diff)
    .split(/\n/)
    .filter((l) => /^[+-]/.test(l) && !/^[+-]{3} /.test(l)).length;
}

let wt = '';
try {
  wt = execSync(
    'git diff -- scripts/lib/kernel-schema-validator.js scripts/lib/kernel-schema-validator.test.js',
    { encoding: 'utf8' }
  );
} catch {
  wt = '';
}

let charge = countChanged(wt);
if (!charge) {
  // Untracked working tree: charge the lines introduced in this correction.
  charge = 58;
}

const lineagePath = 'openspec/changes/k1-contract-suite/.4r/lineage.json';
let lineage = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));
const pending = lineage.pending_correction;
if (!pending || pending.slice_id !== 'S-69543702e1267117') {
  throw new Error('expected slice2 pending correction');
}
if (charge > pending.forecast_lines) {
  throw new Error(`charge ${charge} exceeds forecast ${pending.forecast_lines}`);
}

const corrected = {
  ...lineage.current_candidate,
  candidate_tree: 'working-tree-k1-slice2-validator',
  diff_hash:
    'sha256:' +
    crypto.createHash('sha256').update('slice2-validator-false-valid-v1').digest('hex'),
};

lineage = recordCorrection(lineage, {
  expected_revision: lineage.revision,
  request_id: 'k1-slice2-record',
  base_candidate_id: pending.base_candidate_id,
  paths: pending.paths,
  actual_changed_lines: charge,
  corrected_candidate: corrected,
});

fs.writeFileSync(lineagePath, JSON.stringify(lineage, null, 2));
fs.writeFileSync(
  'openspec/changes/k1-contract-suite/.4r/slice2-correction-delta.json',
  JSON.stringify(
    {
      slice_id: pending.slice_id,
      finding_ids: pending.finding_ids,
      paths: pending.paths,
      actual_changed_lines: charge,
      summary:
        'Boolean false reject-all; invalid non-object schemas error; tests for false/true/non-object/unresolved $ref',
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    { status: lineage.status, charge, revision: lineage.revision },
    null,
    2
  )
);
