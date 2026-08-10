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
