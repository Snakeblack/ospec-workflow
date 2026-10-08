// Policy probes only: tool commands are evaluated, never executed.
// All files are synthetic and removed before exit. Run from any directory.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const hook = path.resolve(__dirname, '../../../scripts/hooks/pre-tool-use.js');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ospec-security-boundary-'));
const env = { ...process.env, DISABLE_TOKEN_ADVISOR: 'true' };
for (const key of ['OSPEC_TARGET', 'OSPEC_CODEX_WRAPPER', 'DISABLE_AGENT_SHIELD']) delete env[key];
const results = [];
function probe(label, tool_name, tool_input) {
  const result = spawnSync(process.execPath, [hook], {
    cwd: workspace, env, encoding: 'utf8', input: JSON.stringify({ tool_name, tool_input, permission_mode: 'default' }),
    timeout: 5000, killSignal: 'SIGKILL',
  });
  if (result.error || result.status !== 0) throw new Error(`probe failed: ${label}`);
  const output = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  results.push({ label, decision: output?.hookSpecificOutput?.permissionDecision ?? null });
}
try {
  fs.writeFileSync(path.join(workspace, '.env'), 'SYNTHETIC_FIXTURE=example\n');
  fs.writeFileSync(path.join(workspace, 'notes.txt'), '-----BEGIN PRIVATE KEY-----\nSYNTHETIC\n-----END PRIVATE KEY-----\n');
  const fakeToken = 'sk-' + 'x'.repeat(48);
  fs.writeFileSync(path.join(workspace, 'small.txt'), fakeToken);
  fs.writeFileSync(path.join(workspace, 'large.txt'), fakeToken + 'x'.repeat(1024 * 1024));
  probe('direct-env', 'Read', { file_path: '.env' });
  probe('literal-cat', 'Bash', { command: 'cat .env' });
  probe('stdin-redirection', 'Bash', { command: 'cat < .env' });
  probe('nested-interpreter', 'Bash', { command: `node -e "require('fs').readFileSync('.env','utf8')"` });
  probe('variable-path', 'Bash', { command: 'cat "$FILE"' });
  probe('renamed-private-key-header', 'Read', { file_path: 'notes.txt' });
  probe('small-known-token', 'Read', { file_path: 'small.txt' });
  probe('large-known-token', 'Read', { file_path: 'large.txt' });
  try {
    fs.symlinkSync(path.join(workspace, '.env'), path.join(workspace, 'alias.txt'), 'file');
    probe('symlink-to-env', 'Read', { file_path: 'alias.txt' });
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    results.push({ label: 'symlink-to-env', skipped: error.code });
  }
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
} finally {
  for (const name of fs.readdirSync(workspace)) fs.unlinkSync(path.join(workspace, name));
  fs.rmdirSync(workspace);
}
