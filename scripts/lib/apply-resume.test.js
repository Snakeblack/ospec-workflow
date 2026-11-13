"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveRemainingTasks } = require("./apply-resume.js");

test("Phase 6: resolveRemainingTasks prevents re-execution of completed [x] tasks after restart", () => {
  const tasksContent = `
# Tasks
- [ ] 1.1 Create internal/auth/middleware.js
- [ ] 1.2 Add AuthConfig struct
- [ ] 1.3 Add auth routes
`;

  const session1Progress = `
## Implementation Progress
- [x] 1.1 Create internal/auth/middleware.js
- [~] 1.2 Add AuthConfig struct
`;

  const res1 = resolveRemainingTasks(tasksContent, session1Progress);

  assert.equal(res1.completed.length, 1);
  assert.equal(res1.completed[0].id, "1.1");

  assert.equal(res1.partial.length, 1);
  assert.equal(res1.partial[0].id, "1.2");

  assert.equal(res1.pending.length, 1);
  assert.equal(res1.pending[0].id, "1.3");

  // Remaining tasks to execute in session 2: only 1.2 (partial) and 1.3 (pending)! 1.1 MUST NOT be re-executed.
  assert.equal(res1.remaining.length, 2);
  assert.deepEqual(res1.remaining.map(t => t.id), ["1.2", "1.3"]);
});

test("Phase 6: resolveRemainingTasks handles task markdown updates in tasks.md", () => {
  const updatedTasksContent = `
# Tasks
- [x] 1.1 Create internal/auth/middleware.js
- [~] 1.2 Add AuthConfig struct
- [ ] 1.3 Add auth routes
`;

  const res2 = resolveRemainingTasks(updatedTasksContent, "");

  assert.equal(res2.completed.length, 1);
  assert.equal(res2.completed[0].id, "1.1");
  assert.equal(res2.remaining.length, 2);
  assert.deepEqual(res2.remaining.map(t => t.id), ["1.2", "1.3"]);
});

test("preserves verified work when a later apply batch appends progress", () => {
  const tasksContent = `
# Tasks
- [ ] 2.1 Update the lite contract
- [ ] 2.2 Merge previous apply progress
- [ ] 2.3 Verify acceptance evidence
`;
  const mergedProgress = `
## PR 1
- [x] 2.1 Update the lite contract

## PR 2
- [~] 2.2 Merge previous apply progress
`;

  const resumed = resolveRemainingTasks(tasksContent, mergedProgress);

  assert.deepEqual(resumed.completed.map((task) => task.id), ["2.1"]);
  assert.deepEqual(resumed.remaining.map((task) => task.id), ["2.2", "2.3"]);
});

test("ids with three or more levels stay distinct tasks", () => {
  const tasksContent = `
# Tasks
- [x] 1.2.1 Parse the header
- [ ] 1.2.2 Parse the body
- [ ] **1.10.3** Close the stream
`;
  const progress = "- [~] 1.2.2 Parse the body\n";

  const resumed = resolveRemainingTasks(tasksContent, progress);

  assert.deepEqual(resumed.tasks.map((task) => [task.id, task.description]), [
    ["1.2.1", "Parse the header"],
    ["1.2.2", "Parse the body"],
    ["1.10.3", "Close the stream"],
  ]);
  assert.deepEqual(resumed.completed.map((task) => task.id), ["1.2.1"]);
  assert.deepEqual(resumed.partial.map((task) => task.id), ["1.2.2"]);
  assert.deepEqual(resumed.remaining.map((task) => task.id), ["1.2.2", "1.10.3"]);
});

test("a checkbox whose id is not a dotted number comes back unparsed instead of disappearing", () => {
  const tasksContent = [
    "# Tasks",
    "- [ ] 1.1 Keep this one",
    "- [ ] T-3 Ship the release",
    "- [x] Write the docs",
    "- [ ] 1.2.3a Not an id either",
    "Plain prose with no checkbox",
    "Prose that mentions - [ ] inside a sentence",
  ].join("\r\n");

  const resumed = resolveRemainingTasks(tasksContent, "");

  assert.deepEqual(resumed.tasks.map((task) => task.id), ["1.1"]);
  assert.deepEqual(resumed.remaining.map((task) => task.id), ["1.1"]);
  assert.deepEqual(resumed.unparsed, [
    { line: 3, text: "- [ ] T-3 Ship the release" },
    { line: 4, text: "- [x] Write the docs" },
    { line: 5, text: "- [ ] 1.2.3a Not an id either" },
  ]);
});

test("a tasks file with every checkbox recognized reports nothing unparsed", () => {
  assert.deepEqual(resolveRemainingTasks("- [ ] 1 One\n- [ ] 2.1 Two\n", "").unparsed, []);
  assert.deepEqual(resolveRemainingTasks(undefined, undefined).unparsed, []);
});
