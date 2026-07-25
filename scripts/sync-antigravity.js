"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SOURCE_ROOT = path.resolve(__dirname, "..");
const TARGET_ROOT = "C:\\Users\\sn4ke\\.gemini\\config";

console.log(`Syncing ospec-workflow from ${SOURCE_ROOT} to ${TARGET_ROOT}...`);

// 1. Sync Agents
const sourceAgentsDir = path.join(SOURCE_ROOT, "agents");
const targetAgentsDir = path.join(TARGET_ROOT, "agents");
if (fs.existsSync(sourceAgentsDir)) {
  fs.mkdirSync(targetAgentsDir, { recursive: true });
  const agentFiles = fs.readdirSync(sourceAgentsDir);
  for (const file of agentFiles) {
    if (file.endsWith(".md")) {
      const src = path.join(sourceAgentsDir, file);
      const dest = path.join(targetAgentsDir, file);
      fs.copyFileSync(src, dest);
    }
  }
  console.log(`✓ Copied ${agentFiles.length} agents to ${targetAgentsDir}`);
}

// 2. Sync Skills
const sourceSkillsDir = path.join(SOURCE_ROOT, "skills");
const targetSkillsDir = path.join(TARGET_ROOT, "skills");
if (fs.existsSync(sourceSkillsDir)) {
  fs.cpSync(sourceSkillsDir, targetSkillsDir, { recursive: true, force: true });
  console.log(`✓ Copied skills tree to ${targetSkillsDir}`);
}

// 3. Sync Scripts
const sourceScriptsDir = path.join(SOURCE_ROOT, "scripts");
const targetScriptsDir = path.join(TARGET_ROOT, "scripts");
if (fs.existsSync(sourceScriptsDir)) {
  fs.cpSync(sourceScriptsDir, targetScriptsDir, { recursive: true, force: true });
  console.log(`✓ Copied scripts tree to ${targetScriptsDir}`);
}

// 4. Synthesize AGENTS.md
const rulesDir = path.join(SOURCE_ROOT, "rules");
let compiledRules = "";

if (fs.existsSync(rulesDir)) {
  const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md")).sort();
  for (const file of ruleFiles) {
    const content = fs.readFileSync(path.join(rulesDir, file), "utf8").trim();
    compiledRules += content + "\n\n---\n\n";
  }
}

const agentsMdPath = path.join(SOURCE_ROOT, "AGENTS.md");
if (fs.existsSync(agentsMdPath)) {
  const agentsMdContent = fs.readFileSync(agentsMdPath, "utf8").trim();
  compiledRules += agentsMdContent + "\n";
}

const targetAgentsMd = path.join(TARGET_ROOT, "AGENTS.md");
fs.writeFileSync(targetAgentsMd, compiledRules, "utf8");
console.log(`✓ Synthesized AGENTS.md at ${targetAgentsMd}`);

// 5. Update hooks.json
const hooksConfig = {
  "ospec-session-start": {
    "enabled": true,
    "SessionStart": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": `node ${targetScriptsDir.replace(/\\/g, "/")}/hooks/ospec-hooks-launch.js session-start`,
            "timeout": 10
          }
        ]
      }
    ]
  },
  "ospec-pre-tool-use": {
    "enabled": true,
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": `node ${targetScriptsDir.replace(/\\/g, "/")}/hooks/ospec-hooks-launch.js pre-tool-use`,
            "timeout": 10
          }
        ]
      }
    ]
  },
  "ospec-pre-compact": {
    "enabled": true,
    "PreCompact": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": `node ${targetScriptsDir.replace(/\\/g, "/")}/hooks/ospec-hooks-launch.js pre-compact`,
            "timeout": 10
          }
        ]
      }
    ]
  },
  "ospec-subagent-stop": {
    "enabled": true,
    "SubagentStop": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": `node ${targetScriptsDir.replace(/\\/g, "/")}/hooks/ospec-hooks-launch.js subagent-stop`,
            "timeout": 10
          }
        ]
      }
    ]
  },
  "ospec-stop": {
    "enabled": true,
    "Stop": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": `node ${targetScriptsDir.replace(/\\/g, "/")}/hooks/ospec-hooks-launch.js stop`,
            "timeout": 10
          }
        ]
      }
    ]
  }
};

const targetHooksJson = path.join(TARGET_ROOT, "hooks.json");
fs.writeFileSync(targetHooksJson, JSON.stringify(hooksConfig, null, 2) + "\n", "utf8");
console.log(`✓ Updated hooks.json at ${targetHooksJson}`);

console.log("\nAntigravity global configuration sync completed successfully!");
