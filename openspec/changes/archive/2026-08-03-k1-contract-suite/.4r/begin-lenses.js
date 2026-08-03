'use strict';

const fs = require('fs');
const path = require('path');
const { beginLens } = require('../../../../scripts/lib/review-lineage.js');

const outDir = __dirname;
let lineage = JSON.parse(fs.readFileSync(path.join(outDir, 'lineage.json'), 'utf8'));

const dims = ['risk', 'reliability', 'resilience', 'readability'];
for (const dimension of dims) {
  lineage = beginLens(lineage, {
    dimension,
    expected_revision: lineage.revision,
    request_id: `k1-${dimension}-start`,
  });
}

fs.writeFileSync(path.join(outDir, 'lineage.json'), JSON.stringify(lineage, null, 2));
console.log(
  JSON.stringify(
    {
      revision: lineage.revision,
      lenses: Object.fromEntries(
        dims.map((d) => [d, lineage.lenses[d].status])
      ),
    },
    null,
    2
  )
);
