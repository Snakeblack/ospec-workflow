"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractShellReadPaths } = require('./shell-file-access.js');

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
  ]) assert.deepEqual(extractShellReadPaths(command), expected, command);
});
