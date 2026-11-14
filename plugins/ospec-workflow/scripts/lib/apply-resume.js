"use strict";

/**
 * Deterministic task resume helper for sdd-apply.
 * Parses tasks.md content and apply-progress.md content to resolve
 * completed [x], partial [~], and pending [ ] tasks.
 *
 * A task id is a dotted number of any depth (`1`, `2.1`, `1.2.3`), the form
 * sdd-tasks writes. A tasks.md checkbox line without one is returned in
 * `unparsed` (1-based line and trimmed text) instead of being dropped.
 *
 * @param {string} tasksContent - Raw text of tasks.md
 * @param {string} [applyProgressContent] - Raw text of apply-progress.md
 * @returns {{ tasks: Array<{id: string, description: string}>, completed: Array<{id: string, description: string}>, partial: Array<{id: string, description: string}>, pending: Array<{id: string, description: string}>, remaining: Array<{id: string, description: string}>, unparsed: Array<{line: number, text: string}> }}
 */
// A list item that opens with a checkbox; a mention of `- [ ]` inside prose is not one.
const CHECKBOX = /^\s*-\s*\[[ x~]\]/i;
const TASK_LINE = /-\s*\[([ x~])\]\s*\*?\*?(\d+(?:\.\d+)*)\*?\*?\s+(.+)$/i;

function resolveRemainingTasks(tasksContent = "", applyProgressContent = "") {
  if (typeof tasksContent !== "string") {
    tasksContent = "";
  }
  if (typeof applyProgressContent !== "string") {
    applyProgressContent = "";
  }

  const completedSet = new Set();
  const partialSet = new Set();

  // Parse apply-progress.md entries: e.g. "- [x] 1.1 ..." or "- [~] 1.2 ..."
  const progressLines = applyProgressContent.split(/\r?\n/);
  for (const line of progressLines) {
    const match = line.match(TASK_LINE);
    if (match && match[1] !== " ") {
      const mark = match[1].toLowerCase();
      const id = match[2];
      if (mark === "x") {
        completedSet.add(id);
      } else if (mark === "~") {
        partialSet.add(id);
      }
    }
  }

  const tasks = [];
  const unparsed = [];
  const taskLines = tasksContent.split(/\r?\n/);
  for (const [index, line] of taskLines.entries()) {
    const match = line.match(TASK_LINE);
    if (!match && CHECKBOX.test(line)) {
      unparsed.push({ line: index + 1, text: line.trim() });
    }
    if (match) {
      const markInTask = match[1].toLowerCase();
      const id = match[2];
      const description = match[3].trim();
      if (markInTask === "x") {
        completedSet.add(id);
      } else if (markInTask === "~") {
        if (!completedSet.has(id)) {
          partialSet.add(id);
        }
      }
      tasks.push({ id, description });
    }
  }

  const completed = [];
  const partial = [];
  const pending = [];
  const remaining = [];

  for (const t of tasks) {
    if (completedSet.has(t.id)) {
      completed.push({ ...t, status: "x" });
    } else if (partialSet.has(t.id)) {
      partial.push({ ...t, status: "~" });
      remaining.push({ ...t, status: "~" });
    } else {
      pending.push({ ...t, status: " " });
      remaining.push({ ...t, status: " " });
    }
  }

  return {
    tasks,
    completed,
    partial,
    pending,
    remaining,
    unparsed,
  };
}

module.exports = {
  resolveRemainingTasks,
};
