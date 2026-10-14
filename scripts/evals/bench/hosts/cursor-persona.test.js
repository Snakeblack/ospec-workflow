"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { askCursorPersona, cursorPersonaArgs, parseCursorPersona } = require("./cursor-persona.js");

const scenario = {
  brief: "Quiero prioridades.",
  facts: [{ id: "F1", text: "Por defecto, media." }],
};

test("cursorPersonaArgs asks in an empty workspace without granting edits", () => {
  const args = cursorPersonaArgs({ model: "grok-4.7-high" });
  assert.ok(args.includes("--print"));
  assert.ok(args.includes("--mode") && args[args.indexOf("--mode") + 1] === "ask");
  assert.equal(args[args.indexOf("--model") + 1], "grok-4.7-high");
  assert.ok(!args.includes("--force"));
  assert.ok(!args.includes("--yolo"));
});

test("parseCursorPersona reads the reply from a result envelope, a fence, or a JSON line", () => {
  const reply = { kind: "question", answer: "Por defecto, media.", facts_disclosed: ["F1"], deviates_from_recommendation: false };
  const parsed = parseCursorPersona(JSON.stringify({ result: `\`\`\`json\n${JSON.stringify(reply)}\n\`\`\``, usage: { input_tokens: 3, output_tokens: 4 } }), scenario);
  assert.equal(parsed.reply.kind, "question");
  assert.deepEqual(parsed.reply.facts_disclosed, ["F1"]);
  assert.equal(parsed.usage.input, 3);
  assert.equal(parsed.usage.output, 4);
  assert.throws(() => parseCursorPersona("no json here", scenario), /reply object/);
});

test("askCursorPersona runs in the empty directory and removes it", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bench-cursor-"));
  const seen = [];
  const spawnImpl = (executable, args, options) => {
    seen.push({ executable, args, cwd: options.cwd });
    const child = new (require("node:events").EventEmitter)();
    child.stdout = new (require("node:events").EventEmitter)();
    child.stderr = new (require("node:events").EventEmitter)();
    child.stdin = { on() {}, end() {} };
    child.kill = () => {};
    process.nextTick(() => {
      child.stdout.emit("data", Buffer.from(JSON.stringify({
        result: { kind: "stopped", answer: "Sigue.", facts_disclosed: [], deviates_from_recommendation: false },
      })));
      child.emit("close", 0);
    });
    return child;
  };
  const { reply } = await askCursorPersona({
    model: "grok-4.7-high",
    scenario,
    goal: "terminado",
    message: "listo",
    executable: "agent",
    spawnImpl,
    workspace: root,
  });
  assert.equal(reply.kind, "stopped");
  assert.equal(seen[0].cwd, root);
  assert.ok(seen[0].args.includes("--workspace"));
  assert.equal(seen[0].args[seen[0].args.indexOf("--workspace") + 1], root);
  assert.ok(fs.existsSync(root), "a caller-owned workspace is kept");
  fs.rmSync(root, { recursive: true, force: true });
});
