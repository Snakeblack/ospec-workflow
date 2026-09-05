/**
 * WebMCP Client-side Tool Registration Template
 * Standard: W3C Web Machine Learning Community Group
 */

export interface WebMCPToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (args: Record<string, unknown>, context?: { signal?: AbortSignal }) => Promise<unknown> | unknown;
}

/**
 * Safe initializer for WebMCP with progressive enhancement.
 */
export async function initializeWebMCP(tools: WebMCPToolDefinition[]): Promise<boolean> {
  // Feature detection: check document.modelContext (current spec) and navigator.modelContext (legacy fallback)
  const modelContext = (document as unknown as { modelContext?: { registerTool: (t: WebMCPToolDefinition) => Promise<void> } }).modelContext
    || (navigator as unknown as { modelContext?: { registerTool: (t: WebMCPToolDefinition) => Promise<void> } }).modelContext;

  if (!modelContext || typeof modelContext.registerTool !== "function") {
    console.debug("[WebMCP] document.modelContext not supported in this browser environment.");
    return false;
  }

  for (const tool of tools) {
    try {
      await modelContext.registerTool(tool);
      console.debug(`[WebMCP] Registered tool: ${tool.name}`);
    } catch (err) {
      console.warn(`[WebMCP] Failed to register tool "${tool.name}":`, err);
    }
  }

  return true;
}
