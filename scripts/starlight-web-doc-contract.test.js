"use strict";

// Static contract test for the starlight-web-doc change (Option D of
// sdd-document: OpenWiki + Starlight web scaffold).
//
// Anchors the new normative prose and the scaffold asset file set as
// load-bearing strings/paths so drift fails `npm test` instead of silently
// regressing. Mirrors scripts/archive-move-fingerprint-contract.test.js.
//
// This test is fully static: no LLM invocation, no sub-agent execution.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

const SKILL_PATH = path.join(ROOT, "skills", "sdd-document", "SKILL.md");
const OPTION_D_PATH = path.join(
  ROOT,
  "skills",
  "sdd-document",
  "references",
  "option-d-starlight.md"
);
const ROUTE_DOCUMENT_PATH = path.join(ROOT, "skills", "_shared", "route-document.md");
const WEB_DOC_TEMPLATE_DIR = path.join(
  ROOT,
  "skills",
  "sdd-document",
  "assets",
  "web-doc-template"
);

test("skills/sdd-document/SKILL.md offers Option D at the gate and accepts scope_choice A|B|C|D", () => {
  assert.ok(fs.existsSync(SKILL_PATH), "SKILL.md must exist");
  const content = fs.readFileSync(SKILL_PATH, "utf8");

  assert.match(content, /Option D/, "SKILL.md gate must offer Option D");
  assert.match(
    content,
    /scope_choice["\s:]*.*A\s*\|\s*B\s*\|\s*C\s*\|\s*D/,
    "SKILL.md must document scope_choice accepting A|B|C|D"
  );
});

test("skills/sdd-document/SKILL.md points to the Option D procedure reference", () => {
  const content = fs.readFileSync(SKILL_PATH, "utf8");
  assert.match(
    content,
    /references\/option-d-starlight\.md/,
    "SKILL.md must point to references/option-d-starlight.md for the full Option D procedure"
  );
});

test("skills/sdd-document/SKILL.md sandbox section states the dual-directory SET for scope D", () => {
  const content = fs.readFileSync(SKILL_PATH, "utf8");
  assert.match(
    content,
    /openwiki\/[\s\S]{0,80}web-doc\//,
    "SKILL.md Step 5 must state the {openwiki/, web-doc/} SET for scope D"
  );
});

test("skills/sdd-document/references/option-d-starlight.md exists and documents the copy-if-missing scaffold rule", () => {
  assert.ok(
    fs.existsSync(OPTION_D_PATH),
    "skills/sdd-document/references/option-d-starlight.md must exist"
  );
  const content = fs.readFileSync(OPTION_D_PATH, "utf8");

  assert.match(
    content,
    /copy-if-missing|only if.{0,40}missing|writes each scaffold file only if/i,
    "option-d-starlight.md must document the copy-if-missing (write-if-missing) scaffold rule"
  );
  assert.match(
    content,
    /MUST NOT run `?npm create astro`?|MUST NOT run any (?:installer|package-manager)/i,
    "option-d-starlight.md must forbid running installers (npm create astro / npm install)"
  );
  assert.match(
    content,
    /openwiki\/\.last-update\.json/,
    "option-d-starlight.md must document .last-update.json living under openwiki/ for scope D"
  );
  assert.match(
    content,
    /dual[- ]director(?:y|ies)|\{openwiki\/,\s*web-doc\/\}/i,
    "option-d-starlight.md must document the dual-directory sandbox note"
  );
});

test("skills/sdd-document/assets/web-doc-template/ ships the exact scaffold file set", () => {
  const expectedFiles = [
    "package.json",
    "astro.config.mjs",
    "content.config.ts",
    "tsconfig.json",
    path.join("src", "styles", "custom.css"),
    path.join("scripts", "sync-openwiki.mjs"),
  ];

  for (const relFile of expectedFiles) {
    const absFile = path.join(WEB_DOC_TEMPLATE_DIR, relFile);
    assert.ok(fs.existsSync(absFile), `scaffold asset must exist: ${relFile}`);
  }
});

test("skills/sdd-document/assets/web-doc-template/package.json wires predev/prebuild to the sync script", () => {
  const pkgPath = path.join(WEB_DOC_TEMPLATE_DIR, "package.json");
  assert.ok(fs.existsSync(pkgPath), "template package.json must exist");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  assert.ok(pkg.scripts, "template package.json must declare a scripts block");
  assert.match(
    pkg.scripts.predev || "",
    /node scripts\/sync-openwiki\.mjs/,
    "predev must invoke the sync script"
  );
  assert.match(
    pkg.scripts.prebuild || "",
    /node scripts\/sync-openwiki\.mjs/,
    "prebuild must invoke the sync script"
  );
  assert.ok(pkg.dependencies && pkg.dependencies.astro, "template package.json must pin astro");
  assert.ok(
    pkg.dependencies && pkg.dependencies["@astrojs/starlight"],
    "template package.json must pin @astrojs/starlight"
  );
});

test("skills/_shared/route-document.md documents Option D, dual-dir resolution, and J5 over the SET", () => {
  assert.ok(fs.existsSync(ROUTE_DOCUMENT_PATH), "route-document.md must exist");
  const content = fs.readFileSync(ROUTE_DOCUMENT_PATH, "utf8");

  assert.match(content, /Option D/, "route-document.md §1 must list Option D");

  const outputDirSection = content.match(
    /#### 3\. Output-dir resolution([\s\S]*?)(?:\r?\n#### 4\.)/
  );
  assert.ok(outputDirSection, "route-document.md must contain a '#### 3. Output-dir resolution' section");
  assert.match(
    outputDirSection[1],
    /openwiki\/[\s\S]{0,80}web-doc\/|\{openwiki\/,\s*web-doc\/\}/,
    "§3 must resolve scope D to the dual-directory pair {openwiki/, web-doc/}"
  );

  const j5Section = content.match(/#### 6\. J5[\s\S]*$/);
  assert.ok(j5Section, "route-document.md must contain the '#### 6. J5' section");
  assert.match(
    j5Section[0],
    /web-doc\//,
    "route-document.md §6 J5 must scope the sandbox inventory check to web-doc/ as well as openwiki/ for scope D"
  );
});

test("skills/_shared/route-document.md §4 point 2 clarifies .last-update.json is openwiki/-only for scope D (4R remediation #9)", () => {
  const content = fs.readFileSync(ROUTE_DOCUMENT_PATH, "utf8");
  const persistenceSection = content.match(/#### 4\. Persistence([\s\S]*?)(?:\r?\n#### 5\.)/);
  assert.ok(persistenceSection, "route-document.md must contain a '#### 4. Persistence' section");
  assert.match(
    persistenceSection[1],
    /openwiki\/[\s\S]{0,40}ONLY|ONLY[\s\S]{0,40}openwiki\//i,
    "§4 point 2 must disambiguate that .last-update.json is written under openwiki/ ONLY for scope D"
  );
  assert.match(
    persistenceSection[1],
    /never written under\s*`?web-doc\/`?|never.{0,20}web-doc\//i,
    "§4 point 2 must explicitly state .last-update.json is never written under web-doc/"
  );
});

test("skills/sdd-document/references/option-d-starlight.md documents partial-scaffold-materialization recovery (4R remediation #10)", () => {
  const content = fs.readFileSync(OPTION_D_PATH, "utf8");
  assert.match(
    content,
    /Partial-materialization recovery/i,
    "option-d-starlight.md §3 must document a partial-materialization recovery policy"
  );
  assert.match(
    content,
    /retry that single\s*file write once|retry.{0,30}once/i,
    "the recovery policy must retry the failing scaffold file write once before giving up"
  );
  assert.match(
    content,
    /presence.{0,60}never proof|never proof.{0,60}(complete|valid)/i,
    "the recovery policy must state that a file's mere presence is never proof it is complete or valid"
  );
});
