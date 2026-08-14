"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { validate, validateInstalled } = require("./validate-antigravity.js");

function createFakeTree(files = {}) {
  const fileMap = new Map();
  const dirSet = new Set();

  for (const [rel, content] of Object.entries(files)) {
    const full = path.resolve("/dist", rel);
    fileMap.set(full, content);
    let p = path.dirname(full);
    while (p && p !== path.dirname(p)) {
      dirSet.add(p);
      p = path.dirname(p);
    }
  }

  return {
    existsSync(p) {
      const full = path.resolve(p);
      return fileMap.has(full) || dirSet.has(full);
    },
    readFileSync(p) {
      const full = path.resolve(p);
      if (!fileMap.has(full)) throw new Error(`ENOENT: ${p}`);
      return fileMap.get(full);
    },
    statSync(p) {
      const full = path.resolve(p);
      if (fileMap.has(full)) return { isFile: () => true, isDirectory: () => false };
      if (dirSet.has(full)) return { isFile: () => false, isDirectory: () => true };
      throw new Error(`ENOENT: ${p}`);
    },
    readdirSync(p, options) {
      const full = path.resolve(p);
      const entries = [];
      const childNames = new Set();
      for (const f of fileMap.keys()) {
        if (f.startsWith(full + path.sep)) {
          const seg = f.slice((full + path.sep).length).split(path.sep)[0];
          if (!childNames.has(seg)) {
            childNames.add(seg);
            const isDir = dirSet.has(path.join(full, seg));
            entries.push(
              options?.withFileTypes
                ? { name: seg, isFile: () => !isDir, isDirectory: () => isDir }
                : seg,
            );
          }
        }
      }
      return entries;
    },
  };
}

test("validate-antigravity passes for a valid generated tree", () => {
  const fakeFs = createFakeTree({
    "agents/sdd-apply.agent.md": "---\nname: sdd-apply\n---\nbody",
    "commands/sdd-propose.prompt.md": "---\nname: sdd-propose\n---\nbody",
    "rules/agent-rules.md": "# Rules",
    "skills/accessibility/SKILL.md": "---\nname: accessibility\n---\nbody",
    "scripts/hooks/ospec-hooks-launch.js": "console.log('hook')",
    "hooks.json": JSON.stringify({
      "ospec-session-start": {},
      "ospec-pre-tool-use": {},
      "ospec-pre-compact": {},
      "ospec-subagent-stop": {},
      "ospec-stop": {},
    }),
  });

  const res = validate(path.resolve("/dist"), { fs: fakeFs });
  assert.equal(res.errors.length, 0);
});

test("validate-antigravity flags missing required directories and forbidden paths", () => {
  const fakeFs = createFakeTree({
    ".claude-plugin/plugin.json": "{}",
  });

  const res = validate(path.resolve("/dist"), { fs: fakeFs });
  assert.ok(res.errors.some((e) => e.includes("missing required path")));
  assert.ok(res.errors.some((e) => e.includes("forbidden target residue")));
});
