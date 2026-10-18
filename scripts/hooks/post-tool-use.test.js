"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const { evaluatePostToolUse, withheldOutput } = require("./post-tool-use.js");

const HOOK = path.join(__dirname, "post-tool-use.js");
// Built at runtime so the repository never holds a real-format token.
const TOKEN = `ghp_${"aB3".repeat(12)}`;

function withEnv(vars, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("a Read response with a token comes back redacted with its shape", () => {
  const output = withEnv({ DISABLE_SECRET_REDACTION: undefined }, () => evaluatePostToolUse({
    tool_name: "Read",
    tool_response: { type: "text", file: { filePath: "/repo/.env", content: `A=1\nGH_TOKEN=${TOKEN}\n`, numLines: 3 } },
  }));
  assert.deepEqual(output.hookSpecificOutput.updatedToolOutput, {
    type: "text",
    file: { filePath: "/repo/.env", content: "A=1\nGH_TOKEN=[REDACTED:github-token]\n", numLines: 3 },
  });
  assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(output.hookSpecificOutput.additionalContext, /github-token/);
});

test("a read of a sensitive file redacts in sensitive-file mode", () => {
  const output = withEnv({ DISABLE_SECRET_REDACTION: undefined }, () => evaluatePostToolUse({
    tool_name: "Read",
    tool_input: { file_path: "/home/user/.aws/credentials" },
    tool_response: { type: "text", file: { filePath: "/home/user/.aws/credentials", content: "[default]\nregion = eu-west-1\naws_secret_access_key = wJalrXUtnFEMIK7MDENGbPxRfiCYzR4tQ7nLpK12\n" } },
  }));
  assert.equal(output.hookSpecificOutput.updatedToolOutput.file.content, "[default]\nregion = eu-west-1\naws_secret_access_key = [REDACTED:assigned-secret]\n");
  const plain = withEnv({ DISABLE_SECRET_REDACTION: undefined }, () => evaluatePostToolUse({
    tool_name: "Read",
    tool_input: { file_path: "/repo/settings.ini" },
    tool_response: { type: "text", file: { filePath: "/repo/settings.ini", content: "aws_secret_access_key = wJalrXUtnFEMIK7MDENGbPxRfiCYzR4tQ7nLpK12\n" } },
  }));
  assert.equal(plain, null, "outside a sensitive file the unquoted lowercase form stays");
});

test("an output without secrets, a missing response or the switch makes no decision", () => {
  withEnv({ DISABLE_SECRET_REDACTION: undefined }, () => {
    assert.equal(evaluatePostToolUse({ tool_name: "Bash", tool_response: { stdout: "ok", stderr: "" } }), null);
    assert.equal(evaluatePostToolUse({ tool_name: "Bash" }), null);
  });
  withEnv({ DISABLE_SECRET_REDACTION: "true" }, () => {
    assert.equal(evaluatePostToolUse({ tool_name: "Bash", tool_response: { stdout: TOKEN } }), null);
  });
});

test("withheldOutput replaces every string and keeps the rest of the shape", () => {
  const output = withheldOutput({ tool_response: { stdout: TOKEN, interrupted: false, lines: ["a"] } }, "boom");
  const value = output.hookSpecificOutput.updatedToolOutput;
  assert.equal(value.interrupted, false);
  assert.match(value.stdout, /Salida retenida.*boom/);
  assert.match(value.lines[0], /Salida retenida/);
  assert.equal(JSON.stringify(output).includes(TOKEN), false);
});

test("the hook process writes the redacted response and nothing for a clean one", () => {
  const env = { ...process.env };
  delete env.DISABLE_SECRET_REDACTION;
  const run = (payload) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8", env });
  const redacted = run({ tool_name: "Bash", tool_response: { stdout: `token ${TOKEN}`, stderr: "" } });
  assert.equal(redacted.status, 0);
  assert.equal(JSON.parse(redacted.stdout).hookSpecificOutput.updatedToolOutput.stdout, "token [REDACTED:github-token]");
  const clean = run({ tool_name: "Bash", tool_response: { stdout: "ok", stderr: "" } });
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout, "");
  const invalid = spawnSync(process.execPath, [HOOK], { input: "{not json", encoding: "utf8", env });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
});
