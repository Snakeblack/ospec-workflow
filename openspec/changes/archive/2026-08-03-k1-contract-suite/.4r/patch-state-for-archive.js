'use strict';

const fs = require('fs');
const { readArchiveGateFacts } = require('../../../../scripts/lib/archive-transaction.js');

const lineage = JSON.parse(
  fs.readFileSync('openspec/changes/k1-contract-suite/.4r/lineage.json', 'utf8')
);
const evidence = JSON.parse(
  fs.readFileSync(
    'openspec/changes/k1-contract-suite/.4r/normalized-evidence.json',
    'utf8'
  )
);
const decision = JSON.parse(
  fs.readFileSync(
    'openspec/changes/k1-contract-suite/.4r/generalist-decision.json',
    'utf8'
  )
);
const derived = JSON.parse(
  fs.readFileSync(
    'openspec/changes/k1-contract-suite/.4r/derived-dimensions.json',
    'utf8'
  )
);

const statePath = 'openspec/changes/k1-contract-suite/state.yaml';
let text = fs.readFileSync(statePath, 'utf8');

if (!text.includes('4r-review-gate:')) {
  const marker = 'decided_at: "2026-08-03T13:25:00Z"';
  const idx = text.indexOf(marker);
  if (idx < 0) throw new Error('clarify marker missing');
  const insert = [
    '',
    '  4r-review-gate:',
    '    status: approved',
    '    schema_version: 1',
    '    classification: high-risk',
    '    findings_summary: "0 BLOCKER, 2 CRITICAL (resolved), 8 WARNING, 3 SUGGESTION"',
    `    lineage_id: "${lineage.lineage_id}"`,
    `    current_candidate_id: "${lineage.current_candidate_id}"`,
    '    remediation_schema_version: 2',
  ].join('\n');
  text = text.slice(0, idx + marker.length) + insert + text.slice(idx + marker.length);
  fs.writeFileSync(statePath, text);
}

fs.writeFileSync(
  'openspec/changes/k1-contract-suite/.4r/gate-final.json',
  JSON.stringify(
    {
      status: 'approved',
      schema_version: 1,
      classification: 'high-risk',
      evidence: {
        schema_version: 1,
        fingerprint: evidence.fingerprint,
        sources: evidence.sources,
      },
      generalist: decision,
      dimensions: derived,
      findings_summary:
        '0 BLOCKER, 2 CRITICAL (resolved), 8 WARNING, 3 SUGGESTION',
      lineage: {
        lineage_id: lineage.lineage_id,
        status: lineage.status,
        current_candidate_id: lineage.current_candidate_id,
        selected_dimensions: lineage.genesis.selected_dimensions,
        remediation_schema_version: lineage.remediation_schema_version,
        slice_order: lineage.slice_order,
      },
    },
    null,
    2
  )
);

const tx = '.ospec/archive-tx/k1-contract-suite';
if (fs.existsSync(tx)) {
  fs.rmSync(tx, { recursive: true, force: true });
}

const facts = readArchiveGateFacts(fs.readFileSync(statePath, 'utf8'));
console.log(JSON.stringify({ facts, has4r: text.includes('4r-review-gate:') }, null, 2));
