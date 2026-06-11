"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  computeImpact,
  parseAtlas,
  resolveMembers,
} = require("./workspace-atlas.js");

const SAMPLE_ATLAS = [
  "schema: workspace-federated",
  "version: 1",
  "members:",
  "  - id: api",
  "    path: ../services/api",
  "    role: backend",
  "    openspec_root: openspec",
  "  - id: web",
  "    path: ../apps/web",
  "    role: frontend",
  "contracts:",
  "  - id: api-public-v1",
  "    provider: api",
  "    consumers: [web]",
  "    surface: openapi",
].join("\n");

async function createWorkspace(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-atlas-"));

  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  return workspace;
}

test("parseAtlas returns empty collections for empty or non-string content", () => {
  assert.deepEqual(parseAtlas(""), { members: [], contracts: [] });
  assert.deepEqual(parseAtlas(null), { members: [], contracts: [] });
});

test("parseAtlas reads members and contracts from the supported subset", () => {
  const atlas = parseAtlas(SAMPLE_ATLAS);

  assert.equal(atlas.members.length, 2);
  assert.deepEqual(atlas.members[0], {
    id: "api",
    path: "../services/api",
    role: "backend",
    openspec_root: "openspec",
  });
  assert.equal(atlas.members[1].id, "web");
  assert.equal(atlas.contracts.length, 1);
  assert.equal(atlas.contracts[0].provider, "api");
  assert.deepEqual(atlas.contracts[0].consumers, ["web"]);
});

test("parseAtlas parses an empty inline consumers list", () => {
  const content = [
    "contracts:",
    "  - id: solo",
    "    provider: api",
    "    consumers: []",
  ].join("\n");

  assert.deepEqual(parseAtlas(content).contracts[0].consumers, []);
});

test("parseAtlas ignores unsupported nested shapes without throwing", () => {
  const content = [
    "members:",
    "  - id: api",
    "    path: ../api",
    "    metadata:",
    "      owner:",
    "        team: platform",
    "    role: backend",
  ].join("\n");
  const atlas = parseAtlas(content);

  assert.equal(atlas.members[0].id, "api");
  assert.equal(atlas.members[0].path, "../api");
  assert.equal(atlas.members[0].role, "backend");
});

test("resolveMembers resolves relative and absolute roots with default openspec_root", async (t) => {
  const workspace = await createWorkspace(t);
  const atlas = parseAtlas(
    [
      "members:",
      "  - id: rel",
      "    path: ../services/api",
      "  - id: abs",
      `    path: ${path.join(workspace, "external")}`,
    ].join("\n"),
  );

  const resolved = await resolveMembers(workspace, atlas);

  assert.equal(
    resolved[0].root,
    path.resolve(workspace, "../services/api", "openspec"),
  );
  assert.equal(
    resolved[1].root,
    path.resolve(workspace, "external", "openspec"),
  );
});

test("resolveMembers marks members reachable only when an openspec/changes dir exists", async (t) => {
  const workspace = await createWorkspace(t);

  await fs.mkdir(path.join(workspace, "member", "openspec", "changes"), {
    recursive: true,
  });
  const atlas = parseAtlas(
    [
      "members:",
      "  - id: present",
      "    path: member",
      "  - id: ghost",
      "    path: nowhere",
    ].join("\n"),
  );

  const resolved = await resolveMembers(workspace, atlas);
  const byId = Object.fromEntries(resolved.map((m) => [m.id, m]));

  assert.equal(byId.present.reachable, true);
  assert.equal(byId.ghost.reachable, false);
});

test("computeImpact returns the provider and all its consumers", () => {
  const atlas = parseAtlas(
    [
      "contracts:",
      "  - id: api-v1",
      "    provider: api",
      "    consumers: [web, mobile]",
    ].join("\n"),
  );

  assert.deepEqual(
    [...computeImpact(atlas, "api")].sort(),
    ["api", "mobile", "web"],
  );
});

test("computeImpact returns only itself for a leaf member", () => {
  const atlas = parseAtlas(
    [
      "contracts:",
      "  - id: api-v1",
      "    provider: api",
      "    consumers: [web]",
    ].join("\n"),
  );

  assert.deepEqual([...computeImpact(atlas, "web")], ["web"]);
});
