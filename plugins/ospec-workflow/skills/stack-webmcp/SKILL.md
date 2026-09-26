---
name: stack-webmcp
description: "Trigger: WebMCP, document.modelContext, web tools, AI browser agent. Web Model Context Protocol client-side tool standard."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
capabilities: [webmcp]
---

# WebMCP Patterns

Web Model Context Protocol (WebMCP) standards and patterns for exposing client-side tools to AI agents within the browser (W3C Web Machine Learning CG).

## Activation Contract

Activate this skill when:
- Implementing or updating in-browser AI agent tools using WebMCP (`document.modelContext`)
- Exposing web application functionality (search, navigation, data extraction, actions) to AI agents
- Annotating declarative HTML forms with WebMCP attributes
- Reviewing client-side agent integration for security, schema correctness, or lifecycle handling
- Designing browser-mediated tools with permission gating and read-only annotations

## Hard Rules

1. **API Surface**: Target `document.modelContext.registerTool()` as the primary API; provide fallback alias check for `navigator.modelContext` for backward compatibility.
2. **Strict Schemas**: Every registered tool MUST declare an explicit JSON Schema `inputSchema` (`type: 'object'`, `properties`, `required`). Never allow untyped or unbounded inputs.
3. **Tool Name Constraints**: Tool names MUST be 1–128 characters using only ASCII alphanumeric (`[a-zA-Z0-9]`), underscore (`_`), hyphen (`-`), and dot (`.`).
4. **Safety Annotations**: Non-mutating tools (read, search, query) MUST set `annotations: { readOnlyHint: true }` to avoid prompting unnecessary confirmation modals.
5. **Cancellation & AbortSignal**: Execute callbacks MUST accept and respect `AbortSignal` for user-initiated or agent-initiated cancellation.
6. **Same-Origin & Permissions**: Never cross origin boundaries or exfiltrate private credentials. Sensitive actions require explicit user confirmation.
7. **Progressive Enhancement**: WebMCP initialization MUST be guarded by feature detection (`'modelContext' in document || 'modelContext' in navigator`).

## Decision Gates

| Scenario | Pattern / Approach | Key Requirement |
|---|---|---|
| Read-only query / search | `document.modelContext.registerTool()` | Set `readOnlyHint: true`, return structured JSON/string |
| State-changing action (checkout, submit) | `document.modelContext.registerTool()` | Omit `readOnlyHint`, validate input bounds, handle idempotency |
| Static HTML form submission | Declarative `<form toolname="..." tooldescription="...">` | Use `toolparameterdescription` on input controls |
| In-flight abort handling | Check `signal.aborted` / pass `signal` to `fetch()` | Return clean abort or throw DOMException `AbortError` |
| Browser lacks WebMCP support | Silent no-op / mock fallback | Guard with feature detection; do not break regular UX |

## Execution Steps

1. **Feature Detection**: Check if `document.modelContext` (or `navigator.modelContext`) is supported.
2. **Define Tool Manifest**: Formulate tool name, human-readable description, parameters with JSON Schema, and safety hints.
3. **Implement Callback**: Write asynchronous `execute(args, { signal })` function with input sanitization and error boundaries.
4. **Register Tool**: Call `await modelContext.registerTool({ name, description, inputSchema, annotations, execute })`.
5. **Listen to Lifecycle**: Handle page cleanup or `toolchange` events when tools are dynamically added or removed.

## Output Contract

When writing WebMCP integration code:
- Emit valid ES module / TypeScript code compatible with browser environments.
- Provide JSON Schemas with explicit property types and descriptions.
- Include proper error handling returning serialized diagnostic messages.

## References

- [WebMCP W3C Specification & Security Reference](references/spec-and-security.md)
- [WebMCP Tool Registration Template](assets/webmcp-template.ts)
- [Declarative Form Example](assets/declarative-form.html)
