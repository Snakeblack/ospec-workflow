"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { validateNextTransition } = require("./next-transition.js");

function validExecuteTransition() {
  return {
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "ospec kernel repair-node --node-id=n1",
    arguments: [{ name: "node_id", value: "n1", token: "--node-id=n1" }],
  };
}

test("valid execute transition with command and tokens passes", () => {
  const result = validateNextTransition(validExecuteTransition());
  assert.equal(result.valid, true);
});

test("missing schema fails closed with a deterministic diagnostic", () => {
  const result = validateNextTransition(validExecuteTransition(), {
    schemaPath: path.join(__dirname, "missing-state-transition.schema.json"),
  });
  assert.deepEqual(result, {
    valid: false,
    errors: [
      {
        path: "/schema",
        rule: "schema-read",
        message: "state-transition schema could not be read",
      },
    ],
  });
});

test("unreadable schema fails closed with the same deterministic diagnostic", () => {
  const result = validateNextTransition(validExecuteTransition(), {
    readFileSync() {
      const error = new Error("platform-specific permission text");
      error.code = "EACCES";
      throw error;
    },
  });
  assert.deepEqual(result, {
    valid: false,
    errors: [
      {
        path: "/schema",
        rule: "schema-read",
        message: "state-transition schema could not be read",
      },
    ],
  });
});

test("corrupt schema JSON fails closed with a deterministic diagnostic", () => {
  const result = validateNextTransition(validExecuteTransition(), {
    readFileSync: () => "{not-json",
  });
  assert.deepEqual(result, {
    valid: false,
    errors: [
      {
        path: "/schema",
        rule: "schema-json",
        message: "state-transition schema contains invalid JSON",
      },
    ],
  });
});

test("unexpected loader programming errors are not converted into validation failures", () => {
  assert.throws(
    () =>
      validateNextTransition(validExecuteTransition(), {
        readFileSync() {
          throw new TypeError("programming bug");
        },
      }),
    /programming bug/
  );
});

test("unknown kind is rejected", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "run",
    operation: "x",
  });
  assert.equal(result.valid, false);
});

test("execute without command fails", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    arguments: [{ name: "node_id", token: "--node-id=n1" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /command/i.test(e.message) || e.rule === "required" || e.rule === "kind-execute"));
});

test("execute with empty command fails", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "   ",
  });
  assert.equal(result.valid, false);
});

test("execute with arguments missing token fails", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "ospec kernel repair-node --node-id=n1",
    arguments: [{ name: "node_id", value: "n1" }],
  });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.rule === "kind-execute" && /token/i.test(e.message) && e.path === "/arguments/0/token"
    )
  );
});

test("execute with whitespace-only argument token fails", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "ospec kernel repair-node --node-id=n1",
    arguments: [{ name: "node_id", value: "n1", token: "   " }],
  });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.rule === "kind-execute" && /token/i.test(e.message) && e.path === "/arguments/0/token"
    )
  );
});

test("execute rejects an argument token that is absent from the command", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "ospec kernel repair-node --node-id=n2",
    arguments: [{ name: "node_id", value: "n1", token: "--node-id=n1" }],
  });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.rule === "kind-execute" && e.path === "/arguments/0/token" && /command/i.test(e.message)
    )
  );
});

test("execute requires the token as an exact command argument, not a substring", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "ospec kernel repair-node --node-id=n10",
    arguments: [{ name: "node_id", value: "n1", token: "--node-id=n1" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === "/arguments/0/token"));
});

test("execute rejects a token that does not represent its named argument", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "ospec kernel repair-node --other=n1",
    arguments: [{ name: "node_id", value: "n1", token: "--other=n1" }],
  });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.rule === "kind-execute" && e.path === "/arguments/0/token" && /represent/i.test(e.message)
    )
  );
});

test("execute accepts quoted, positional, and boolean-flag argument tokens", () => {
  const quoted = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "label-node",
    command: 'ospec kernel label-node "--label=hello world"',
    arguments: [{ name: "label", value: "hello world", token: "--label=hello world" }],
  });
  const positional = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "ospec kernel repair-node n1",
    arguments: [{ name: "node_id", value: "n1", token: "n1" }],
  });
  const booleanFlag = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "ospec kernel repair-node --force",
    arguments: [{ name: "force", value: true, token: "--force" }],
  });
  assert.equal(quoted.valid, true);
  assert.equal(positional.valid, true);
  assert.equal(booleanFlag.valid, true);
});

test("execute rejects unclosed single and double quotes deterministically", () => {
  for (const quote of ['"', "'"]) {
    const result = validateNextTransition({
      schema_version: 1,
      kind: "execute",
      operation: "repair-node",
      command: `ospec kernel repair-node ${quote}--node-id=n1`,
      arguments: [{ name: "node_id", value: "n1", token: "--node-id=n1" }],
    });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (error) =>
          error.path === "/command" &&
          error.rule === "kind-execute" &&
          error.message === "execute command contains an unclosed quote"
      )
    );
  }
});

test("execute rejects non-scalar argument values that cannot be represented by one token", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "execute",
    operation: "repair-node",
    command: "ospec kernel repair-node --node-id=n1",
    arguments: [{ name: "node_id", value: { id: "n1" }, token: "--node-id=n1" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === "/arguments/0/token"));
});

test("collect without invented command passes", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "collect",
    operation: "await-model-result",
    arguments: [{ name: "admission", token: "admission:model" }],
  });
  assert.equal(result.valid, true);
});

test("collect inventing command for missing artifact fails", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "collect",
    operation: "await-artifact",
    command: "ospec kernel consume --artifact=missing.json",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "kind-collect"));
});

test("decide does not require command", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "decide",
    operation: "approve-size-exception",
  });
  assert.equal(result.valid, true);
});

test("stop forbids recovery command", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "stop",
    operation: "no-safe-continuation",
    command: "ospec kernel recover --auto",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "kind-stop"));
});

test("stop without command passes", () => {
  const result = validateNextTransition({
    schema_version: 1,
    kind: "stop",
    operation: "no-safe-continuation",
  });
  assert.equal(result.valid, true);
});
