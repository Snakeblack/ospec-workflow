"use strict";

// E1.45 cli-one-word-invocation (B5): the IDD protocol names the ospec CLI as
// one word, the shim beside the installed runtime, and that word runs in bash,
// zsh, fish, PowerShell and cmd, also from a path with spaces. A shell this
// machine lacks is skipped, and the skip names it.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const { runConfigure } = require("./cli.js");
const { renderRuntimeDir, runtimeDirValue } = require("./shared-dir.js");

const ROOT = path.resolve(__dirname, "..", "..");
const WINDOWS = process.platform === "win32";
const DEFINITION = /`ospec` below means `([^`]+)`/;
// Git Bash, where Claude Code runs its Bash tool on Windows; a bare `bash` may
// be the WSL launcher there.
const GIT_BASH = "C:\\Program Files\\Git\\bin\\bash.exe";

// One build in a directory whose path has a space, rendered the way a global
// install renders it.
let installed;
test.after(() => {
  if (installed) fs.rmSync(installed.parent, { recursive: true, force: true });
});

function install() {
  if (installed) return installed;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ospec shim-"));
  const out = path.join(parent, "runtime root");
  const result = runConfigure({ sourceDir: ROOT, target: "opencode", outDir: out, validate: false });
  assert.equal(result.exitCode, 0);
  renderRuntimeDir(out, runtimeDirValue(out));
  const word = DEFINITION.exec(fs.readFileSync(path.join(out, "skills", "idd", "SKILL.md"), "utf8"))?.[1];
  assert.ok(word, "the protocol defines ospec");
  // A project root with a space too, outside any git work tree.
  const project = path.join(parent, "a project");
  fs.mkdirSync(project);
  installed = { parent, out, word, shim: word.replace(/^"|"$/g, ""), project };
  return installed;
}

test("the rendered protocol names the shim of its platform, quoted only for the space in its path", () => {
  const { out, word, shim } = install();
  const expected = `${runtimeDirValue(out)}/bin/ospec${WINDOWS ? ".cmd" : ""}`;
  assert.equal(word, `"${expected}"`);
  assert.equal(shim, expected);
  assert.ok(fs.existsSync(shim), `${shim} must exist`);
  if (!WINDOWS) assert.ok(fs.statSync(shim).mode & 0o111, `${shim} must be executable`);
});

function available(bin, args) {
  if (path.isAbsolute(bin) && !fs.existsSync(bin)) return false;
  const probe = spawnSync(bin, args, { encoding: "utf8", timeout: 30000 });
  return !probe.error && probe.status === 0;
}

const POSIX_PROBE = ["-c", "exit 0"];

// Each shell runs the word as the protocol writes it; zsh and fish also keep it
// in a variable, as the agents in idd-7 did, since neither splits it.
const SHELLS = [
  {
    name: "bash",
    bin: WINDOWS ? GIT_BASH : "bash",
    probe: POSIX_PROBE,
    // Under Git Bash, Claude names the POSIX shim beside ospec.cmd.
    word: (word) => (WINDOWS ? word.replace(/\.cmd(?="?$)/, "") : word),
    run: (word, args) => ["-c", `O=${word}; "$O" ${args}`],
  },
  { name: "zsh", bin: "zsh", posixOnly: true, probe: POSIX_PROBE, run: (word, args) => ["-c", `O=${word}; $O ${args}`] },
  { name: "fish", bin: "fish", posixOnly: true, probe: POSIX_PROBE, run: (word, args) => ["-c", `set O ${word}; $O ${args}`] },
  {
    name: "PowerShell",
    bin: "pwsh",
    probe: ["-NoProfile", "-Command", "exit 0"],
    run: (word, args) => ["-NoProfile", "-NonInteractive", "-Command", `& ${word} ${args}; exit $LASTEXITCODE`],
  },
  {
    name: "cmd",
    bin: process.env.ComSpec || "cmd.exe",
    windowsOnly: true,
    probe: ["/d", "/c", "exit 0"],
    verbatim: true,
    run: (word, args) => ["/d", "/s", "/c", `"${word} ${args}"`],
  },
];

for (const shell of SHELLS) {
  const skip =
    (shell.windowsOnly && !WINDOWS && `${shell.name} runs only on Windows`) ||
    (shell.posixOnly && WINDOWS && `${shell.name} is not a Windows shell`) ||
    (!available(shell.bin, shell.probe) && `${shell.name} is not installed on this machine`);

  test(`${shell.name} runs the protocol's ospec word from a path with spaces`, { skip }, () => {
    const { project } = install();
    const word = shell.word ? shell.word(install().word) : install().word;
    const run = (args) =>
      spawnSync(shell.bin, shell.run(word, args), {
        cwd: os.tmpdir(),
        encoding: "utf8",
        timeout: 60000,
        windowsVerbatimArguments: Boolean(shell.verbatim),
      });

    const help = run("--help");
    assert.equal(help.status, 0, `${shell.name}: ${help.stderr}`);
    assert.match(help.stdout, /Usage:/);

    // An argument with a space arrives whole, and the CLI's exit code comes back.
    const refused = run(`next --root "${project}" --json`);
    assert.equal(refused.status, 1, `${shell.name}: ${refused.stdout}${refused.stderr}`);
    const answer = JSON.parse(refused.stdout);
    assert.equal(answer.error.code, "not-a-git-repo");
    assert.ok(answer.error.message.includes("a project"), answer.error.message);
  });
}
