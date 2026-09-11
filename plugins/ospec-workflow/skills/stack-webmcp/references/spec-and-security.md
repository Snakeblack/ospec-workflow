# WebMCP W3C Specification & Security Reference

## 1. Specification Overview

WebMCP (Web Model Context Protocol) is an open web standard incubated within the **W3C Web Machine Learning Community Group** (co-authored by Google & Microsoft; Editors: Brandon Walderman [Microsoft], Khushal Sagar [Google], Dominic Farolino [Google]).

### Core Specification Details
- **Draft Status**: Draft Community Group Report (W3C CG-DRAFT).
- **Official Specification**: `https://webmachinelearning.github.io/webmcp/`
- **Official Repository**: `https://github.com/webmachinelearning/webmcp`
- **Key Difference from Anthropic MCP**: While Anthropic's MCP connects backend servers to AI models via stdio/HTTP transports, WebMCP connects websites directly to browser-based AI agents (e.g., Chrome AI, Edge Copilot, extensions) using the browser's execution environment and active user session.

## 2. API Surface Comparison

### Imperative API (`document.modelContext`)
```typescript
interface ModelContext {
  registerTool(options: ModelContextRegisterToolOptions): Promise<void>;
  unregisterTool(name: string): Promise<void>;
  getTools(): Promise<RegisteredTool[]>;
  executeTool(name: string, args: Record<string, unknown>, options?: ModelContextExecuteToolOptions): Promise<unknown>;
}

interface ModelContextRegisterToolOptions {
  name: string; // 1-128 chars: [a-zA-Z0-9_.-]
  title?: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (args: Record<string, unknown>, context?: { signal?: AbortSignal }) => Promise<unknown> | unknown;
}
```

### Declarative API (HTML Form Extensions)
Allows browsers to automatically synthesize tools from semantic HTML forms:
```html
<form 
  action="/api/search" 
  method="GET"
  toolname="search_docs" 
  tooldescription="Searches documentation articles by keyword">
  <input 
    type="text" 
    name="q" 
    toolparameterdescription="The search keywords or technical topic" 
    required />
  <button type="submit">Search</button>
</form>
```

## 3. Security and Privacy Guidelines (W3C Section 6)

1. **Prompt Injection & Tool Poisoning**:
   - Tool descriptions and schemas are consumed directly by LLMs. Never interpolate unvetted user input into tool descriptions or titles.
   - Use `annotations.untrustedContentHint: true` when returning user-generated or third-party content.

2. **Over-Parameterization**:
   - Limit input schemas strictly to parameters required by the function. Do not expose internal IDs, secrets, or administrative parameters to AI agents.

3. **Read-Only Hints (`readOnlyHint`)**:
   - Explicitly declare `readOnlyHint: true` for idempotent tools (searches, reading pages, checking status).
   - This signal allows the browser or agent to execute safely without blocking the user for approval on benign read actions.

4. **Permissions Policy**:
   - WebMCP adheres to browser origin boundaries and Permissions Policy: `permissions-policy: tools=*` or `tools=(self)`.
   - Cross-origin iframes cannot invoke or register tools unless explicitly delegated.

5. **Lifecycle & Cancellation**:
   - Always propagate `AbortSignal` to asynchronous I/O operations (`fetch`, IndexedDB, Pagefind) to gracefully cancel requests if the agent or user aborts.
