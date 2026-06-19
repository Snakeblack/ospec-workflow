"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { analyzeGeneralBaseline } = require("./lib/workspace-general-baseline.js");

async function createMockWorkspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-general-baseline-"));
  
  // Create coordinator files
  const openspecDir = path.join(root, "coordinator", "openspec");
  await fs.mkdir(openspecDir, { recursive: true });
  
  const workspaceYaml = [
    "schema: workspace-federated",
    "version: 1",
    "members:",
    "  - id: api",
    "    path: ../services/api",
    "  - id: web",
    "    path: ../apps/web",
  ].join("\n");
  
  await fs.writeFile(path.join(openspecDir, "workspace.yaml"), workspaceYaml, "utf8");

  // Create member directories
  const apiDir = path.join(root, "services", "api");
  const webDir = path.join(root, "apps", "web");
  await fs.mkdir(apiDir, { recursive: true });
  await fs.mkdir(webDir, { recursive: true });

  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return {
    root,
    coordinatorRoot: path.join(root, "coordinator"),
    workspaceYamlPath: path.join(openspecDir, "workspace.yaml"),
    apiDir,
    webDir,
  };
}

test("analyzeGeneralBaseline parses aligned and misaligned dependencies from package.json", async (t) => {
  const ws = await createMockWorkspace(t);
  
  // Set up package.json for api
  const apiPkg = {
    dependencies: {
      "express": "^4.18.2",
      "lodash": "^4.17.21",
    }
  };
  await fs.writeFile(path.join(ws.apiDir, "package.json"), JSON.stringify(apiPkg), "utf8");

  // Set up package.json for web
  const webPkg = {
    dependencies: {
      "express": "^4.18.2",
      "lodash": "^4.17.15",
      "react": "^18.2.0",
    }
  };
  await fs.writeFile(path.join(ws.webDir, "package.json"), JSON.stringify(webPkg), "utf8");

  // Run analysis
  await analyzeGeneralBaseline(ws.workspaceYamlPath, ws.coordinatorRoot);

  // Check generated file
  const reportPath = path.join(ws.coordinatorRoot, "docs", "architecture", "shared-baseline.md");
  const reportContent = await fs.readFile(reportPath, "utf8");

  // Assert aligned react and express
  assert.match(reportContent, /express[\s\S]*?\^4\.18\.2/, "Should list express as aligned");
  assert.match(reportContent, /react[\s\S]*?\^18\.2\.0/, "Should list react as aligned");

  // Assert misaligned lodash
  assert.match(reportContent, /lodash/, "lodash should be in the report");
  assert.match(reportContent, /api[\s\S]*?\^4\.17\.21/, "lodash version in api should be reported");
  assert.match(reportContent, /web[\s\S]*?\^4\.17\.15/, "lodash version in web should be reported");
});

test("analyzeGeneralBaseline parses dependencies from go.mod", async (t) => {
  const ws = await createMockWorkspace(t);

  const apiGoMod = [
    "module github.com/user/api",
    "",
    "go 1.20",
    "",
    "require (",
    "    github.com/gin-gonic/gin v1.9.0",
    "    golang.org/x/crypto v0.6.0",
    ")",
  ].join("\n");
  await fs.writeFile(path.join(ws.apiDir, "go.mod"), apiGoMod, "utf8");

  const webGoMod = [
    "module github.com/user/web",
    "",
    "go 1.20",
    "",
    "require (",
    "    github.com/gin-gonic/gin v1.8.2",
    ")",
  ].join("\n");
  await fs.writeFile(path.join(ws.webDir, "go.mod"), webGoMod, "utf8");

  await analyzeGeneralBaseline(ws.workspaceYamlPath, ws.coordinatorRoot);

  const reportPath = path.join(ws.coordinatorRoot, "docs", "architecture", "shared-baseline.md");
  const reportContent = await fs.readFile(reportPath, "utf8");

  assert.match(reportContent, /github\.com\/gin-gonic\/gin/, "gin-gonic should be analyzed");
  assert.match(reportContent, /v1\.9\.0/, "gin version v1.9.0 should be reported");
  assert.match(reportContent, /v1\.8\.2/, "gin version v1.8.2 should be reported");
});
