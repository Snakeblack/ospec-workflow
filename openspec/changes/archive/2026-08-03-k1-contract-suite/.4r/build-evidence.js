'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const {
  normalizeReviewEvidence,
} = require('../../../../scripts/lib/review-dimensions.js');

const outDir = __dirname;
const changeRoot = path.join(outDir, '..');

function shouldInclude(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  if (norm.includes('/.4r/')) return false;
  if (norm.includes('/evidence/receipts/')) return false;
  if (norm.endsWith('/.4r/build-evidence.js')) return false;
  if (norm.endsWith('/.4r/candidate.diff')) return false;
  if (norm.endsWith('/.4r/normalized-evidence.json')) return false;
  if (norm.endsWith('/.4r/paths.json')) return false;
  return true;
}

function collectPathsFromDiff(diffText) {
  const paths = new Set();
  for (const line of diffText.split(/\r?\n/)) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (m && shouldInclude(m[2])) paths.add(m[2]);
  }
  return [...paths].sort();
}

function countChangedLines(diffText) {
  let count = 0;
  for (const line of diffText.split(/\r?\n/)) {
    if (/^[+-]/.test(line) && !/^[+-]{3} /.test(line)) count += 1;
  }
  return count;
}

let tracked = '';
try {
  tracked = execSync('git diff main -- .', {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
} catch (err) {
  console.error('git diff failed:', err.message);
  process.exit(1);
}

// Filter tracked sections by path
function filterDiffByPath(diffText) {
  const lines = diffText.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const section = /^diff --git a\/(.+) b\/(.+)$/.exec(lines[i]);
    if (!section) {
      i += 1;
      continue;
    }
    const file = section[2];
    const start = i;
    i += 1;
    while (i < lines.length && !lines[i].startsWith('diff --git ')) i += 1;
    if (shouldInclude(file)) out.push(...lines.slice(start, i));
  }
  return out.join('\n') + (out.length ? '\n' : '');
}

let diff = filterDiffByPath(tracked);

const untracked = execSync('git ls-files --others --exclude-standard', {
  encoding: 'utf8',
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .filter(shouldInclude);

for (const filePath of untracked) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.length === 0) {
    diff += [
      `diff --git a/${filePath} b/${filePath}`,
      'new file mode 100644',
      'index 0000000..e69de29',
      '',
    ].join('\n');
    continue;
  }
  const fileLines = content.replace(/\n$/, '').split('\n');
  const n = fileLines.length;
  diff += [
    `diff --git a/${filePath} b/${filePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${n} @@`,
    ...fileLines.map((line) => `+${line}`),
    '',
  ].join('\n');
}

const paths = collectPathsFromDiff(diff);
const changedLines = countChangedLines(diff);
const diffHash = 'sha256:' + crypto.createHash('sha256').update(diff).digest('hex');
const pathsDigest =
  'sha256:' +
  crypto.createHash('sha256').update(JSON.stringify(paths)).digest('hex');

fs.writeFileSync(path.join(outDir, 'candidate.diff'), diff);

const input = {
  classification: 'high-risk',
  verify: {
    status: 'success',
    findings: [
      {
        code: 'verify-readability',
        source: 'verify',
        detail: 'TRIANGULATE column uses Written rather than N cases',
      },
    ],
  },
  diff,
  paths,
  capabilities: ['schemas', 'contract-lint', 'classification', 'parity', 'runtime'],
  operationTypes: ['add', 'modify'],
  dependencies: [],
  designRisks: [
    {
      code: 'design-risk',
      source: 'design',
      detail: 'public-contracts,schema-migration,ci-enforcement',
    },
  ],
};

let evidence;
try {
  evidence = normalizeReviewEvidence(input);
} catch (err) {
  console.error('normalize failed:', err.message);
  process.exit(1);
}

const candidate = {
  projection: 'workspace',
  base_tree: 'main',
  candidate_tree: 'working-tree-k1-contract-suite',
  paths,
  diff_hash: diffHash,
  paths_digest: pathsDigest,
  authored_lines: changedLines,
  original_changed_lines: changedLines,
};

fs.writeFileSync(
  path.join(outDir, 'normalized-evidence.json'),
  JSON.stringify(evidence, null, 2)
);
fs.writeFileSync(path.join(outDir, 'paths.json'), JSON.stringify(paths, null, 2));
fs.writeFileSync(
  path.join(outDir, 'candidate.json'),
  JSON.stringify(candidate, null, 2)
);

console.log(
  JSON.stringify(
    {
      diff_bytes: Buffer.byteLength(diff),
      path_count: paths.length,
      changed_lines: changedLines,
      fingerprint: evidence.fingerprint,
      facts: evidence.sources.facts,
      sample_paths: paths.slice(0, 25),
      candidate_diff_hash: diffHash,
      paths_digest: pathsDigest,
    },
    null,
    2
  )
);
