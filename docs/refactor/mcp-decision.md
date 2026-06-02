# MCP Configuration Decision

Decision date: 2026-06-02

## Decision

Retain `.mcp.json` in the Agent Plugin package.

This repository is a VS Code Agent Plugin refactor, not a VS Code extension refactor. The MCP configuration adds external documentation context that cannot be provided by static plugin instructions, agents, or skills alone. It should not be replaced with VS Code extension APIs or Language Model Tools.

`.plugin/plugin.json` already references the MCP configuration through:

```json
"mcpServers": ".mcp.json"
```

No manifest change is required for this task.

## Reviewed Files

| File | Finding |
| --- | --- |
| `.mcp.json` | Contains a top-level `mcpServers` object with one Context7 server. |
| `.plugin/plugin.json` | Already declares `"mcpServers": ".mcp.json"`. |
| `skills/context7-mcp/SKILL.md` | Defines the use case: fetch current library/framework documentation and API examples through Context7 tools. |

## Server Classification

| Server | Classification | Decision | Rationale |
| --- | --- | --- | --- |
| `io.github.upstash/context7` | optional | retain | The core SDD workflow can run without Context7, but the `context7-mcp` skill needs it to fetch current external library/framework documentation instead of relying only on static model knowledge. This is external context, not declarative plugin content. |

## Runtime Requirements

The retained Context7 MCP server is configured as a stdio server:

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["@upstash/context7-mcp@1.0.31"],
  "env": {
    "CONTEXT7_API_KEY": "${input:CONTEXT7_API_KEY}"
  }
}
```

Required runtime environment:

| Requirement | Purpose |
| --- | --- |
| Node.js and npm/npx | Runs the Context7 MCP package through `npx`. |
| Network access | Allows the MCP server to fetch external documentation context. |
| `CONTEXT7_API_KEY` | Supplies the Context7 API key via the VS Code input variable used in `.mcp.json`. |

Expected MCP-backed tools for the skill workflow:

| Tool | Purpose |
| --- | --- |
| `resolve-library-id` | Resolves a library or framework name to the best Context7 library ID. |
| `query-docs` | Fetches relevant documentation for the selected library ID and user query. |

## Non-Goals

This task does not introduce or migrate to VS Code extension APIs. In particular, it does not add:

- `src/extension.ts`
- extension `package.json`
- `vscode.lm`
- `registerTool`
- `ChatParticipant`
- `contributes.languageModelTools`

## Final Rationale

Keep `.mcp.json` because it provides an optional, external documentation capability for library/framework questions. The plugin manifest already points to the MCP configuration, and the current MCP dependency is narrowly scoped to the Context7-backed skill rather than being required for the whole SDD workflow.
