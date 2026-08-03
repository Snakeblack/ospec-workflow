'use strict';

const fs = require('fs');
const path = require('path');
const {
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require('../../../../scripts/lib/review-dimensions.js');
const {
  startReviewLineage,
} = require('../../../../scripts/lib/review-lineage.js');
const {
  planLineageGate,
} = require('../../../../scripts/lib/review-gate-state.js');

const outDir = __dirname;
const evidence = JSON.parse(
  fs.readFileSync(path.join(outDir, 'normalized-evidence.json'), 'utf8')
);
const candidate = JSON.parse(
  fs.readFileSync(path.join(outDir, 'candidate.json'), 'utf8')
);

const decision = {
  status: 'needs-specialist',
  specialists: ['risk', 'reliability', 'resilience', 'readability'],
  reason:
    'signals=design-risk,diff-auth-permission,diff-error-flow,diff-structural-complexity,metadata-runtime,verify-readability;dimensions=risk,reliability,resilience,readability',
};

const g = validateGeneralistDecision(decision);
if (!g.valid) {
  console.error('generalist invalid', g.errors);
  process.exit(1);
}

const derived = deriveReviewDimensions(evidence, decision);
const v = validateReviewDecision(derived);
if (!v.valid) {
  console.error('derived invalid', v.errors);
  process.exit(1);
}

fs.writeFileSync(
  path.join(outDir, 'generalist-decision.json'),
  JSON.stringify(decision, null, 2)
);
fs.writeFileSync(
  path.join(outDir, 'derived-dimensions.json'),
  JSON.stringify(derived, null, 2)
);

const lineage = startReviewLineage({
  candidate,
  classification: 'high-risk',
  selected_dimensions: derived.selected_specialists,
  evidence_fingerprint: evidence.fingerprint,
});

fs.writeFileSync(
  path.join(outDir, 'lineage.json'),
  JSON.stringify(lineage, null, 2)
);

const plan = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
});

fs.writeFileSync(
  path.join(outDir, 'gate-plan.json'),
  JSON.stringify(plan, null, 2)
);

console.log(
  JSON.stringify(
    {
      generalist_valid: g.valid,
      derived_valid: v.valid,
      selected: derived.selected_specialists,
      depth: derived.depth,
      escalation: derived.escalation_reason,
      lineage_status: lineage.status,
      candidate_id: lineage.current_candidate_id,
      budget_limit: lineage.correction_budget && lineage.correction_budget.limit_lines,
      next_action: plan.next_action,
      dispatch: plan.dispatch,
    },
    null,
    2
  )
);
