"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extractShellReadPaths, fileExistsIn, namesDeniedFile } = require('./shell-file-access.js');

test('literal read operands keep quotes, separators and option values distinct', () => {
  for (const [command, expected] of [
    [`cat '.en'v`, ['.env']],
    [`cat "a b/.env"`, ['a b/.env']],
    [`Get-Content -Encoding utf8 -LiteralPath C:\\project\\.env`, ['C:\\project\\.env']],
    [`cat file\\ name/.env`, ['file name/.env']],
    [`echo 'cat .env'; cat README.md`, ['README.md']],
    [`cat README.md > .env`, ['README.md']],
    [`cat < .env`, ['.env']],
    [`cat << .env`, []],
    [`cat <<'EOF'\ncat id_rsa\nEOF\ncat .env`, ['.env']],
    [`cat README\u00a0.env`, ['README\u00a0.env']],
    [`cat "$FILE"`, []],
    [`echo ok # ; cat .env`, []],
    [`cat '.env`, []],
    ['grep API_KEY .env', ['.env']],
    ['sed -n 1p .env', ['.env']],
    ["awk '{print}' .env", ['.env']],
    ['base64 .env', ['.env']],
    ['xxd .env', ['.env']],
    ['cp .env /tmp/out.env', ['.env', '/tmp/out.env']],
    ['od -c .env', ['.env']],
    ['tar cf - .env', ['cf', '.env']],
    ['tar -czf out.tgz .env', ['out.tgz', '.env']],
    ['scp .env host:', ['.env', 'host:']],
    ['scp -i ~/.ssh/id_rsa notes.txt host:', ['notes.txt', 'host:']],
    ['scp -o IdentityFile=~/.ssh/id_rsa notes.txt host:', ['notes.txt', 'host:']],
    // $'…' quoting: \' does not close it, so the next command stays visible.
    [`echo $'\\'' ; cat .env`, ['.env']],
    [`cat $'.env`, []],
    // A backslash before a line break continues the line; a `<<` without its
    // delimiter (an arithmetic shift) hides nothing after it.
    ['cat \\\n  .env', ['.env']],
    ['echo $((1<<2))\ncat .env', ['.env']],
  ]) assert.deepEqual(extractShellReadPaths(command), expected, command);
});

test('an id_ name counts as a key when it is a file, not a directory', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ospec-shell-'));
  try {
    fs.mkdirSync(path.join(workspace, 'id_service'));
    fs.writeFileSync(path.join(workspace, 'id_deploy'), '');
    const exists = fileExistsIn(workspace);
    for (const command of ['cd id_service && npm test', 'go test ./id_service', 'git add id_service']) {
      assert.equal(namesDeniedFile(command, exists), false, command);
    }
    assert.equal(namesDeniedFile('openssl rsa -in id_deploy -text', exists), true);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
