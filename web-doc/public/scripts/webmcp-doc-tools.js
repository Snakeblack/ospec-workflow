/**
 * WebMCP (Web Model Context Protocol) Integration for Starlight Documentation
 * Standard: W3C Web Machine Learning Community Group
 *
 * Exposes client-side tools directly to AI browsing agents (Gemini in Chrome,
 * Edge Copilot, AI extensions) via document.modelContext.
 */

(function () {
  if (typeof window === "undefined") return;

  const SDD_COMMANDS = [
    { command: "/sdd-init", phase: "init", description: "Initializes SDD project context, OpenSpec persistence, and testing capabilities." },
    { command: "/sdd-explore", phase: "explore", description: "Explores a change idea by investigating current code, options, and risks." },
    { command: "/sdd-propose", phase: "propose", description: "Creates a concise proposal with intent, scope, and rollback plan." },
    { command: "/sdd-spec", phase: "spec", description: "Writes SDD requirements and scenarios as OpenSpec deltas." },
    { command: "/sdd-clarify", phase: "clarify", description: "Reduces spec ambiguities via targeted questions before design." },
    { command: "/sdd-design", phase: "design", description: "Creates technical design with architecture decisions and testing strategy." },
    { command: "/sdd-tasks", phase: "tasks", description: "Breaks changes into concrete implementation tasks with a review budget." },
    { command: "/sdd-apply", phase: "apply", description: "Implements assigned tasks adhering to strict TDD and 400-line budget." },
    { command: "/sdd-verify", phase: "verify", description: "Verifies implementation against specs, design, tasks, and test evidence." },
    { command: "/sdd-archive", phase: "archive", description: "Archives verified change and initiates release publication flow." }
  ];

  const localToolsMap = new Map();

  // If browser does not have native document.modelContext, provide progressive polyfill
  if (!document.modelContext && (!navigator || !navigator.modelContext || typeof navigator.modelContext.registerTool !== "function")) {
    document.modelContext = {
      registerTool: async (tool) => {
        localToolsMap.set(tool.name, tool);
      },
      unregisterTool: async (name) => {
        localToolsMap.delete(name);
      },
      getTools: async () => {
        return Array.from(localToolsMap.values()).map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations
        }));
      },
      executeTool: async (name, args, context) => {
        const tool = localToolsMap.get(name);
        if (!tool) throw new Error(`WebMCP Tool "${name}" not found.`);
        return await tool.execute(args || {}, context);
      }
    };
    window.webMCP = document.modelContext;
  }

  async function registerWebMCPTools() {
    // Feature detection: check document.modelContext (W3C standard draft) and navigator.modelContext (legacy)
    const modelContext = (document && document.modelContext) || (navigator && navigator.modelContext);

    if (!modelContext || typeof modelContext.registerTool !== "function") {
      return;
    }

    try {
      // 1. Search Documentation Tool
      await modelContext.registerTool({
        name: "search_documentation",
        title: "Search Documentation",
        description: "Searches the ospec-workflow documentation (Spec-Driven Development, OpenSpec, TDD, agents, skills, hooks) using client-side Pagefind search.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query or keyword to look for in the documentation."
            }
          },
          required: ["query"]
        },
        annotations: {
          readOnlyHint: true
        },
        execute: async ({ query }, context) => {
          if (!query || typeof query !== "string") {
            return { error: "A valid string query parameter is required." };
          }

          try {
            // Check if pagefind is loaded or load it dynamically
            let pagefind = window.pagefind;
            if (!pagefind) {
              try {
                // Dynamic import with cache-busting / path resolution
                const basePath = window.location.pathname.startsWith("/ospec-workflow") ? "/ospec-workflow" : "";
                pagefind = await import(/* @vite-ignore */ `${basePath}/pagefind/pagefind.js`);
                if (pagefind.init) await pagefind.init();
              } catch {
                // Fallback: search DOM headings and text
                pagefind = null;
              }
            }

            if (pagefind && typeof pagefind.search === "function") {
              const searchResult = await pagefind.search(query);
              const dataResults = await Promise.all(
                (searchResult.results || []).slice(0, 5).map(async (r) => {
                  const data = await r.data();
                  return {
                    url: data.url,
                    title: data.meta?.title || "Documentation",
                    excerpt: data.excerpt?.replace(/<[^>]+>/g, "")
                  };
                })
              );
              return { query, count: dataResults.length, results: dataResults };
            }

            // Fallback DOM extraction
            const main = document.querySelector("main") || document.body;
            const text = main.innerText || "";
            return {
              query,
              fallback: true,
              currentPage: window.location.pathname,
              matches: text.toLowerCase().includes(query.toLowerCase())
            };
          } catch (err) {
            return { error: `Search failed: ${err.message}` };
          }
        }
      });

      // 2. Get Documentation Page Content Tool
      await modelContext.registerTool({
        name: "get_doc_page",
        title: "Get Documentation Page Content",
        description: "Retrieves the clean, structured content of a documentation page by path (e.g. '/quickstart', '/architecture/overview', '/rules-system/overview').",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "The relative path or URL of the documentation page (e.g. '/quickstart' or '/installation/setup')."
            }
          },
          required: ["path"]
        },
        annotations: {
          readOnlyHint: true
        },
        execute: async ({ path }, context) => {
          if (!path || typeof path !== "string") {
            return { error: "Path string is required." };
          }

          try {
            const signal = context && context.signal;
            const target = new URL(path, window.location.origin);
            if (target.origin !== window.location.origin) {
              return { error: "Security Error: Only same-origin documentation paths are allowed." };
            }
            if (target.protocol !== "http:" && target.protocol !== "https:") {
              return { error: "Security Error: Invalid URL protocol." };
            }

            const response = await fetch(target.href, { signal });
            if (!response.ok) {
              return { error: `HTTP ${response.status}: Failed to fetch page at ${path}` };
            }

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const mainContent = doc.querySelector("main .content") || doc.querySelector("main") || doc.body;

            // Strip scripts, styles, and non-content elements
            const cloned = mainContent.cloneNode(true);
            cloned.querySelectorAll("script, style, nav, .sidebar").forEach((el) => el.remove());

            const title = doc.querySelector("h1")?.innerText || doc.title || path;
            const textContent = (cloned.innerText || "").trim().slice(0, 15000); // 15k char safe window

            return {
              path,
              title,
              content: textContent
            };
          } catch (err) {
            return { error: `Failed to retrieve page: ${err.message}` };
          }
        }
      });

      // 3. List Documentation Topics Tool
      await modelContext.registerTool({
        name: "list_doc_topics",
        title: "List Documentation Topics",
        description: "Lists all available topics, categories, and navigation links in the documentation sidebar.",
        inputSchema: {
          type: "object",
          properties: {}
        },
        annotations: {
          readOnlyHint: true
        },
        execute: async () => {
          try {
            const sidebarLinks = Array.from(document.querySelectorAll("nav.sidebar a, .starlight-sidebar a, aside a"));
            const topics = sidebarLinks
              .filter((a) => a.getAttribute("href"))
              .map((a) => ({
                label: a.innerText.trim(),
                href: a.getAttribute("href")
              }))
              .filter((item, idx, arr) => item.label && arr.findIndex((t) => t.href === item.href) === idx);

            return {
              totalTopics: topics.length,
              topics
            };
          } catch (err) {
            return { error: `Failed to list topics: ${err.message}` };
          }
        }
      });

      // 4. Get SDD Commands Catalog Tool
      await modelContext.registerTool({
        name: "get_sdd_commands",
        title: "Get SDD Workflow Commands",
        description: "Returns the complete catalog of Spec-Driven Development (SDD) slash commands, phases, and execution descriptions.",
        inputSchema: {
          type: "object",
          properties: {
            phase: {
              type: "string",
              description: "Optional phase name filter (e.g., 'explore', 'spec', 'design', 'apply', 'verify', 'archive')."
            }
          }
        },
        annotations: {
          readOnlyHint: true
        },
        execute: async ({ phase }) => {
          if (phase && typeof phase === "string") {
            const filtered = SDD_COMMANDS.filter((cmd) => cmd.phase.toLowerCase() === phase.toLowerCase() || cmd.command.includes(phase.toLowerCase()));
            return { count: filtered.length, commands: filtered };
          }
          return { count: SDD_COMMANDS.length, commands: SDD_COMMANDS };
        }
      });

      console.info("[WebMCP] Successfully registered 4 documentation tools with document.modelContext.");
    } catch (e) {
      console.warn("[WebMCP] Tool registration failed:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registerWebMCPTools, { once: true });
  } else {
    registerWebMCPTools();
  }
})();
