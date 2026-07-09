"use strict";

// Pure transform: reshapes the canonical VS Code-format plugin source into a
// target-native file collection. NO filesystem, network, or process side
// effects; the input `files` is never mutated. All IO lives in
// scripts/configure/cli.js. Composes the per-concern transforms below, driven
// entirely by the declarative target profile. See design.md / specs/target-generator.

const { parse, serialize, getField, stripKeys, setScalar, setArray, setBlockMap } = require("./frontmatter.js");
const { resolveModel, OMIT } = require("./model-resolver.js");

// A file collection is an array of { path, content:string }.

function transform({ files, profile, models } = {}) {
  if (!Array.isArray(files)) {
    throw new TypeError("files must be an array of { path, content }");
  }
  if (!profile || typeof profile !== "object") {
    throw new TypeError("profile must be a non-null object");
  }
  const rulesContent = collectRules(files, profile);
  const out = [];

  for (const file of files) {
    const handled = handleFile(file, profile, models, rulesContent);
    if (handled === null) {
      continue; // dropped (e.g. rules inlined elsewhere, or folded into AGENTS.md)
    }
    out.push(handled);
  }

  // Files synthesized from collected source data (not 1:1 with any input): the
  // opencode.json config (schema + mcp + instructions), the plugin shim, and a
  // synthesized AGENTS.md for the codex-style "to-agents-md" rules strategy.
  for (const synthesized of synthesizeFiles(files, profile, rulesContent)) {
    out.push(synthesized);
  }

  // Sort by path so the output is deterministic regardless of the input's
  // filesystem-dependent read order (stable across OSes and CI runners).
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { files: out };
}

function handleFile(file, profile, models, rulesContent) {
  const { path } = file;

  if (isDropped(path, profile)) {
    return null; // artifact the target does not consume (e.g. plugin manifest/hooks)
  }

  if (profile.manifest && path === profile.manifest.location) {
    return reshapeManifest(file, profile);
  }

  if (profile.hooks && profile.hooks.shape === "nested" && path === (profile.hooks.location || "hooks/hooks.json")) {
    return nestHooks(file);
  }

  if (profile.hooks && profile.hooks.format === "copilot" && path === (profile.hooks.source || "hooks/hooks.json")) {
    return copilotHooks(file, profile);
  }

  if (profile.hooks && profile.hooks.format === "codex" && path === (profile.hooks.source || "hooks/hooks.json")) {
    return codexHooks(file, profile);
  }

  if (isRulesFile(path)) {
    if (profile.rules && isInlineStrategy(profile.rules.strategy)) {
      return null; // content folded into the orchestrator agent/skill
    }
    if (profile.rules && profile.rules.strategy === "to-instructions") {
      return toInstructionFile(file, profile);
    }
    if (profile.rules && profile.rules.strategy === "to-instructions-config") {
      return toInstructionConfigFile(file, profile);
    }
    if (profile.rules && profile.rules.strategy === "to-agents-md") {
      return null; // folded into the synthesized AGENTS.md (ADR-001)
    }
    return { path, content: file.content };
  }

  if (isAgent(path, profile)) {
    if (profile.orchestrator && profile.orchestrator.emitAs === "skill" && agentBaseName(path, profile) === profile.orchestrator.agent) {
      return emitOrchestratorSkill(file, profile, rulesContent);
    }
    if (profile.agentFile.format === "toml") {
      return handleAgentToml(file, profile, models);
    }
    return handleAgent(file, profile, models);
  }

  if (isCommand(path, profile)) {
    if (profile.commandFile.format === "skill") {
      return handleCommandSkill(file, profile);
    }
    return handleCommand(file, profile);
  }

  // .mcp.json for profiles with MCP placeholder normalization enabled.
  // Must sit before passthrough so profiles without mcpPlaceholders fall through.
  if (profile.mcpPlaceholders && path === ".mcp.json") {
    return normalizeMcpPlaceholders(file);
  }

  // Passthrough (skills, shared docs). Tool names are still substituted so no
  // foreign namespace survives anywhere in the generated tree.
  if (path.endsWith(".md")) {
    let content = file.content;
    if (profile.toolMap) {
      content = substituteProse(content, profile.toolMap);
    }
    content = substituteAgentNames(content, profile);
    return { path, content };
  }
  return { path, content: file.content };
}

// --- dispatch helpers ------------------------------------------------------

function isInlineStrategy(strategy) {
  return strategy === "inline-into-orchestrator";
}

// Strategies whose rules content is accumulated across all rules/*.md files
// rather than emitted 1:1 per file: inlined into the orchestrator (claude) or
// folded into a single synthesized AGENTS.md (codex, ADR-001).
function isAccumulateStrategy(strategy) {
  return isInlineStrategy(strategy) || strategy === "to-agents-md";
}

// A toolMap entry MAY be a degradation marker instead of a literal tool
// name/array: { degrade: "<fallback prose>" }. Declared for abstract tool
// names with no equivalent on a target (e.g. codex has no ask-tool).
function isDegradeMarker(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && typeof value.degrade === "string";
}

function isDropped(path, profile) {
  return Array.isArray(profile.drop) && profile.drop.some((prefix) => path === prefix || path.startsWith(prefix));
}

function isRulesFile(path) {
  return path.startsWith("rules/");
}

// Remap a category path onto a target directory, e.g.
// remapDir("agents/sdd-apply.agent.md", "agents/", ".github/agents") ->
// ".github/agents/sdd-apply.agent.md".
function remapDir(path, sourcePrefix, targetDir) {
  return `${targetDir}/${path.slice(sourcePrefix.length)}`;
}

function isAgent(path, profile) {
  return path.startsWith("agents/") && path.endsWith(profile.agentFile.from);
}

function isCommand(path, profile) {
  return path.startsWith("commands/") && path.endsWith(profile.commandFile.from);
}

function agentBaseName(path, profile) {
  return path.slice("agents/".length, path.length - profile.agentFile.from.length);
}

function renameExtension(path, { from, to }) {
  return from === to ? path : path.slice(0, path.length - from.length) + to;
}

// Parse a tracked { path, content } file as JSON, attaching the source path to
// any syntax error so a malformed config names the offending file instead of
// aborting the whole transform with an opaque SyntaxError.
function parseJsonFile(file) {
  let obj;
  try {
    obj = JSON.parse(file.content);
  } catch (err) {
    throw new Error(`${file.path}: invalid JSON: ${err.message}`);
  }
  if (obj === null || typeof obj !== "object") {
    throw new Error(`${file.path}: JSON content must be a non-null object`);
  }
  return obj;
}

// --- manifest --------------------------------------------------------------

function reshapeManifest(file, profile) {
  const obj = parseJsonFile(file);
  const { omitFields = [], dropFields = [], keepFields, outLocation, interface: iface } = profile.manifest;

  // Allowlist + rename branch (codex): keep only the declared keys, inject an
  // optional `interface` metadata block, and write to a renamed output path.
  // Preferred over an omit/drop deny-list because it is future-proof against
  // new canonical manifest keys and satisfies "no other top-level keys".
  if (Array.isArray(keepFields)) {
    const kept = {};
    for (const key of keepFields) {
      if (key in obj) {
        kept[key] = obj[key];
      }
    }
    if (iface) {
      kept.interface = iface;
    }
    return { path: outLocation || file.path, content: JSON.stringify(kept, null, 2) };
  }

  for (const key of omitFields) {
    if (typeof obj[key] === "string") {
      delete obj[key];
    }
  }
  for (const key of dropFields) {
    delete obj[key];
  }

  return { path: file.path, content: JSON.stringify(obj, null, 2) };
}

// --- hooks -----------------------------------------------------------------

function nestHooks(file) {
  const obj = parseJsonFile(file);
  const events = obj.hooks || {};
  const nested = {};

  for (const [event, entries] of Object.entries(events)) {
    nested[event] = [{ hooks: entries }];
  }

  return { path: file.path, content: JSON.stringify({ ...obj, hooks: nested }, null, 2) };
}

// Reshape the source hooks into GitHub Copilot CLI's project-hook schema at
// .github/hooks/hooks.json: { version, hooks: { <camelCaseEvent>: [ { type,
// bash, powershell, timeoutSec } ] } }. Events without a Copilot equivalent are
// dropped; the plugin-root path variable is stripped to a repo-relative command.
function copilotHooks(file, profile) {
  const obj = parseJsonFile(file);
  const events = obj.hooks || {};
  const eventMap = profile.hooks.eventMap || {};
  const stripVar = profile.hooks.stripPathVar;
  const out = {};

  for (const [event, entries] of Object.entries(events)) {
    const mapped = eventMap[event];
    if (!mapped) {
      continue; // no Copilot equivalent (e.g. PreCompact)
    }
    out[mapped] = entries.map((entry) => {
      const command = stripVar ? entry.command.split(stripVar).join("") : entry.command;
      const hook = { type: "command", bash: command, powershell: command };
      if (entry.timeout !== undefined) {
        hook.timeoutSec = entry.timeout;
      }
      return hook;
    });
  }

  return { path: profile.hooks.location, content: JSON.stringify({ version: 1, hooks: out }, null, 2) };
}

function validateHooksObject(file, hooks) {
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) {
    throw new Error(`${file.path}: hooks must be a non-null object`);
  }
}

function validateHookEntries(file, event, entries) {
  if (!Array.isArray(entries)) {
    throw new Error(`${file.path}: hooks.${event} must be an array`);
  }
}

function quotePluginRootPath(command) {
  return command.replace(/(?<!")\$PLUGIN_ROOT\/[^\s"]+/g, (match) => `"${match}"`);
}

function rewriteCodexCommand(file, event, index, entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${file.path}: hooks.${event}[${index}] must be an object`);
  }
  if (typeof entry.command !== "string") {
    throw new Error(`${file.path}: hooks.${event}[${index}].command must be a string`);
  }

  const command = entry.command.split("${CLAUDE_PLUGIN_ROOT}").join("$PLUGIN_ROOT");
  return quotePluginRootPath(command);
}

// Reshape the source hooks for Codex: mapping events 1:1 PascalCase
// and substituting ${CLAUDE_PLUGIN_ROOT} with a quoted $PLUGIN_ROOT path.
function codexHooks(file, profile) {
  const obj = parseJsonFile(file);
  const events = obj.hooks;
  validateHooksObject(file, events);
  const out = {};

  for (const [event, entries] of Object.entries(events)) {
    validateHookEntries(file, event, entries);
    out[event] = entries.map((entry, index) => {
      const command = rewriteCodexCommand(file, event, index, entry);
      return {
        ...entry,
        command,
      };
    });
  }

  return { path: profile.hooks.location || file.path, content: JSON.stringify({ hooks: out }, null, 2) + "\n" };
}

// --- rules inlining --------------------------------------------------------

function collectRules(files, profile) {
  if (!profile.rules || !isAccumulateStrategy(profile.rules.strategy)) {
    return "";
  }

  const parts = [];
  for (const file of files) {
    if (isRulesFile(file.path)) {
      let body = parse(file.content).body.trim();
      if (profile.toolMap) {
        body = substituteProse(body, profile.toolMap);
      }
      body = substituteAgentNames(body, profile);
      parts.push(body);
    }
  }

  return parts.join("\n\n");
}

// --- orchestrator-as-skill (claude) ----------------------------------------

function emitOrchestratorSkill(file, profile, rulesContent) {
  const parsed = parse(file.content);
  let body = parsed.body;

  if (profile.toolMap) {
    body = substituteProse(body, profile.toolMap);
  }
  if (rulesContent) {
    body = body.replace(/\s*$/, "") + "\n\n" + rulesContent + "\n";
  }
  body = substituteAgentNames(body, profile);

  const nameField = getField(parsed.frontmatter, "name");
  const name = (nameField && nameField.value) || profile.orchestrator.agent;
  const descField = getField(parsed.frontmatter, "description");
  let description = profile.orchestrator.description || (descField && descField.value) || "";
  description = substituteAgentNames(description, profile);

  const frontmatter = [
    { key: "name", value: name, rawLines: [`name: ${name}`] },
    { key: "description", value: description, rawLines: [`description: ${JSON.stringify(description)}`] },
  ];

  return { path: profile.orchestrator.skillPath, content: serialize({ frontmatter, body }) };
}

// --- agents ----------------------------------------------------------------

function handleAgent(file, profile, models) {
  let { frontmatter, body } = parse(file.content);
  const nameField = getField(frontmatter, "name");
  const originalAgentName = nameField ? nameField.value : undefined;
  let agentName = originalAgentName;

  if (profile.orchestrator && profile.orchestrator.renameTo && originalAgentName === profile.orchestrator.agent) {
    agentName = profile.orchestrator.renameTo;
    frontmatter = setScalar(frontmatter, "name", agentName);
  }

  let newPath = renameExtension(file.path, profile.agentFile);
  if (profile.orchestrator && profile.orchestrator.renameTo && agentBaseName(file.path, profile) === profile.orchestrator.agent) {
    const ext = profile.agentFile.to;
    newPath = `agents/${profile.orchestrator.renameTo}${ext}`;
  }
  if (profile.agentDir) {
    newPath = remapDir(newPath, "agents/", profile.agentDir);
  }

  // Capture mode from user-invocable before it is stripped: the user-invocable
  // entry agent becomes a `primary` agent, every worker a `subagent`.
  let mode;
  if (profile.agentMode) {
    const invocable = getField(frontmatter, "user-invocable");
    mode = invocable && invocable.value === "false" ? profile.agentMode.subagent : profile.agentMode.primary;
  }

  if (profile.frontmatter && profile.frontmatter.stripKeys) {
    frontmatter = stripKeys(frontmatter, profile.frontmatter.stripKeys);
  }

  if (mode) {
    frontmatter = setScalar(frontmatter, "mode", mode);
  }

  if (profile.setAgentFrontmatter) {
    for (const [key, value] of Object.entries(profile.setAgentFrontmatter)) {
      frontmatter = setScalar(frontmatter, key, value);
    }
  }

  if (profile.toolMap) {
    frontmatter = profile.toolsAsMap
      ? mapToolsFrontmatterAsMap(frontmatter, profile.toolMap, profile.dropTools)
      : mapToolsFrontmatter(frontmatter, profile.toolMap, profile.dropTools);
    body = substituteProse(body, profile.toolMap);
  }

  body = substituteAgentNames(body, profile);

  if (profile.model && originalAgentName) {
    const resolved = resolveModel(originalAgentName, profile.id, models);
    if (resolved !== OMIT) {
      frontmatter = Array.isArray(resolved)
        ? setArray(frontmatter, "model", resolved)
        : setScalar(frontmatter, "model", resolved);
    }
  }

  return { path: newPath, content: serialize({ frontmatter, body }) };
}

// --- agents: TOML emission (codex-style profiles, agentFile.format:"toml") -

// Derive sandbox_mode from the agent's existing `tools` capability declaration
// (read pre-strip, like the `mode` derivation from user-invocable above): a
// grant that includes the write-capable tool (default "edit") is
// workspace-write; every other agent (the 4R reviewers, read-only workers) is
// read-only. No new frontmatter field is introduced solely for this purpose
// (REQ-codex-target-003).
function deriveSandboxMode(tools, profile) {
  const config = profile.sandboxByCapability || {};
  const writeTool = config.writeTool || "edit";
  const write = config.write || "workspace-write";
  const read = config.read || "read-only";
  return Array.isArray(tools) && tools.includes(writeTool) ? write : read;
}

// agents/<name>.agent.md -> profile.agentFile.to (e.g. .codex/agents/<name>.toml).
// Frontmatter name/description become top-level TOML keys, the body folds into
// `developer_instructions`, sandbox_mode derives from tools[], and model/
// model_reasoning_effort resolve via the existing fail-soft resolveModel (OMIT
// when models.yaml has no column for this target — 5.1 has none for codex, so
// both keys are simply absent). The emitted file is excluded from the profile's
// plugin manifest bundle: reshapeManifest's keepFields allowlist never
// references agents, so this exclusion falls out of that allowlist naturally.
function handleAgentToml(file, profile, models) {
  const { frontmatter, body } = parse(file.content);
  const nameField = getField(frontmatter, "name");
  const name = nameField ? nameField.value : undefined;
  const descField = getField(frontmatter, "description");
  const description = descField ? descField.value : "";
  const toolsField = getField(frontmatter, "tools");
  const tools = toolsField && Array.isArray(toolsField.value) ? toolsField.value : [];

  const fields = {
    name,
    description,
    sandbox_mode: deriveSandboxMode(tools, profile),
  };

  if (name) {
    const resolved = resolveModel(name, profile.id, models);
    if (resolved !== OMIT) {
      const isObject = typeof resolved === "object" && resolved !== null && !Array.isArray(resolved);
      fields.model = isObject ? resolved.model : (Array.isArray(resolved) ? resolved[0] : resolved);
      if (isObject && resolved.model_reasoning_effort) {
        fields.model_reasoning_effort = resolved.model_reasoning_effort;
      }
    }
  }

  let devInstructions = body;
  if (profile.toolMap) {
    devInstructions = substituteProse(devInstructions, profile.toolMap);
  }
  devInstructions = substituteAgentNames(devInstructions, profile);
  fields.developer_instructions = devInstructions.replace(/\s+$/, "") + "\n";

  let newPath = renameExtension(file.path, profile.agentFile);
  if (profile.agentDir) {
    newPath = remapDir(newPath, "agents/", profile.agentDir);
  }

  return { path: newPath, content: serializeAgentToml(fields) };
}

// Escape a TOML basic string scalar: backslash then double quote.
function tomlEscapeScalar(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Escape a TOML multi-line basic string body: backslash, then any `"""` run
// (which would otherwise prematurely close the block) split with an escaped
// quote so it can never be mistaken for the closing delimiter.
function tomlEscapeMultiline(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"""/g, '""\\"');
}

// Minimal, dependency-free TOML serializer for the flat agent shape: scalar
// `key = "…"` lines plus a trailing `developer_instructions` multiline basic
// string. Node 22 ships no core TOML writer and the project forbids runtime
// dependencies (CommonJS pure), so this mirrors the constrained-subset
// `parseModels` approach already used in cli.js.
function serializeAgentToml(fields) {
  const lines = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === "developer_instructions" || value === undefined || value === null) {
      continue;
    }
    lines.push(`${key} = "${tomlEscapeScalar(value)}"`);
  }
  if (fields.developer_instructions !== undefined) {
    lines.push(`developer_instructions = """\n${tomlEscapeMultiline(fields.developer_instructions)}"""`);
  }
  return lines.join("\n") + "\n";
}

// --- commands --------------------------------------------------------------

function handleCommand(file, profile) {
  let newPath = renameExtension(file.path, profile.commandFile);
  if (profile.commandDir) {
    newPath = remapDir(newPath, "commands/", profile.commandDir);
  }
  let { frontmatter, body } = parse(file.content);

  if (profile.frontmatter) {
    const strip = [
      ...(profile.frontmatter.stripKeys || []),
      ...(profile.frontmatter.commandStripKeys || []),
    ];
    if (strip.length > 0) {
      frontmatter = stripKeys(frontmatter, strip);
    }
  }

  if (profile.toolMap) {
    frontmatter = mapToolsFrontmatter(frontmatter, profile.toolMap, profile.dropTools);
    body = substituteProse(body, profile.toolMap);
  }

  if (profile.commandVars && profile.commandVars.style === "positional") {
    // opencode has no named arguments: map each distinct ${input:name} to a
    // positional $1/$2 (by first appearance) and bare ${input} to $ARGUMENTS.
    const order = [];
    body = body.replace(/\$\{input:([A-Za-z0-9_-]+)\}/g, (_match, name) => {
      let index = order.indexOf(name);
      if (index === -1) {
        order.push(name);
        index = order.length - 1;
      }
      return "$" + (index + 1);
    });
    body = body.replace(/\$\{input\}/g, "$ARGUMENTS");
  } else if (profile.commandVars) {
    const named = [];
    body = body.replace(/\$\{input:([A-Za-z0-9_-]+)\}/g, (_match, name) => {
      named.push(name);
      return "$" + name;
    });
    body = body.replace(/\$\{input\}/g, "$ARGUMENTS");
    if (named.length > 0) {
      // `arguments` (space-separated names) is what actually enables `$name`
      // substitution in Claude; `argument-hint` is only the autocomplete hint.
      frontmatter = setScalar(frontmatter, "arguments", named.join(" "));
      // Plain names (no [..] — that parses as a YAML array). argument-hint is only the
      // autocomplete hint; `arguments` is what enables substitution.
      frontmatter = setScalar(frontmatter, "argument-hint", named.join(" "));
    }
  }

  if (profile.frontmatter && profile.frontmatter.commandRouting) {
    const addKeys = profile.frontmatter.commandRouting.addKeys || {};
    for (const [key, value] of Object.entries(addKeys)) {
      frontmatter = setScalar(frontmatter, key, value);
    }
  }

  // Update command routing if orchestrator is renamed:
  if (profile.orchestrator && profile.orchestrator.renameTo) {
    const agentField = getField(frontmatter, "agent");
    if (agentField && agentField.value === profile.orchestrator.agent) {
      frontmatter = setScalar(frontmatter, "agent", profile.orchestrator.renameTo);
    }
  }

  body = substituteAgentNames(body, profile);
  const descField = getField(frontmatter, "description");
  if (descField && descField.value) {
    frontmatter = setScalar(frontmatter, "description", substituteAgentNames(descField.value, profile));
  }

  return { path: newPath, content: serialize({ frontmatter, body }) };
}

// --- commands: invocable skill emission (codex-style profiles) -------------

// Front-load the trigger phrase within the first 80 characters of a skill
// description. Codex truncates descriptions under progressive disclosure once
// many skills are installed, so the invocable name must not be buried behind a
// preamble. If the command's bare name does not appear in the description at
// all, or already appears within the budget, the description is returned
// unchanged (covers the common case where the description already opens with
// an action verb, e.g. "Create implementation tasks…").
function frontLoadDescription(description, name, limit = 80) {
  const idx = description.toLowerCase().indexOf(name.toLowerCase());
  if (idx === -1 || idx < limit) {
    return description;
  }
  return `$${name}: ${description}`;
}

// commands/<name>.prompt.md -> skills/commands/<name>/SKILL.md, invocable as
// $<name> via the frontmatter `name:` field (the invocation name is
// unaffected by the `commands/` output directory prefix). The `commands/`
// namespace is REQUIRED — never the bare skills/<name>/SKILL.md path — because
// that bare path is already the established output for pre-existing
// context-doc skills (phase-agent docs referenced by literal path from agent
// prose); most SDD commands share a base name with one of those, so emitting
// at the bare path would silently collide (REQ-codex-target-004,
// REQ-generator-002). Named ${input:x} variables rewrite to positional
// $1/$ARGUMENTS (the same substitution style already used by the opencode
// profile), the `agent:` routing key becomes an explicit prose spawn
// instruction (the key itself is dropped from the emitted frontmatter — Codex
// skills have no routing key), and the description is front-loaded for
// progressive disclosure.
function handleCommandSkill(file, profile) {
  const base = file.path.slice("commands/".length, file.path.length - profile.commandFile.from.length);
  const newPath = `skills/commands/${base}/SKILL.md`;
  let { frontmatter, body } = parse(file.content);

  const agentField = getField(frontmatter, "agent");
  frontmatter = stripKeys(frontmatter, ["agent", "target", "tools", "argument-hint"]);

  if (agentField && agentField.value) {
    body = `\nSpawn the \`${agentField.value}\` agent to carry out this skill.\n` + body;
  }

  const order = [];
  body = body.replace(/\$\{input:([A-Za-z0-9_-]+)\}/g, (_match, name) => {
    let index = order.indexOf(name);
    if (index === -1) {
      order.push(name);
      index = order.length - 1;
    }
    return "$" + (index + 1);
  });
  body = body.replace(/\$\{input\}/g, "$ARGUMENTS");

  if (profile.toolMap) {
    body = substituteProse(body, profile.toolMap);
  }
  body = substituteAgentNames(body, profile);

  frontmatter = setScalar(frontmatter, "name", base);
  const descField = getField(frontmatter, "description");
  if (descField && descField.value) {
    const description = substituteAgentNames(descField.value, profile);
    frontmatter = setScalar(frontmatter, "description", frontLoadDescription(description, base));
  }

  return { path: newPath, content: serialize({ frontmatter, body }) };
}

// --- tool-name substitution ------------------------------------------------

function mapToolsFrontmatter(frontmatter, toolMap, dropTools) {
  const field = getField(frontmatter, "tools");
  if (!field || !Array.isArray(field.value)) {
    return frontmatter;
  }

  const drop = new Set(dropTools || []);
  const mapped = [];
  for (const tool of field.value) {
    if (drop.has(tool)) {
      continue; // tool has no equivalent on this target; remove from the grant
    }
    const replacement = toolMap[tool];
    if (isDegradeMarker(replacement)) {
      continue; // degraded ask-tool: no tool name is emitted for it
    }
    if (replacement === undefined) {
      mapped.push(tool);
    } else if (Array.isArray(replacement)) {
      mapped.push(...replacement);
    } else {
      mapped.push(replacement);
    }
  }

  return setArray(frontmatter, "tools", mapped);
}

// Like mapToolsFrontmatter, but emits the opencode `tools:` MAP shape (tool ->
// true) instead of an array. Abstract tools expand to their built-in name(s);
// duplicates (e.g. read -> read appearing twice) collapse to one entry.
function mapToolsFrontmatterAsMap(frontmatter, toolMap, dropTools) {
  const field = getField(frontmatter, "tools");
  if (!field || !Array.isArray(field.value)) {
    return frontmatter;
  }

  const drop = new Set(dropTools || []);
  const seen = new Set();
  const entries = [];
  for (const tool of field.value) {
    if (drop.has(tool)) {
      continue;
    }
    const replacement = toolMap[tool];
    if (isDegradeMarker(replacement)) {
      continue; // degraded ask-tool: no tool name is emitted for it
    }
    const names = replacement === undefined ? [tool] : Array.isArray(replacement) ? replacement : [replacement];
    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name);
        entries.push([name, true]);
      }
    }
  }

  return setBlockMap(frontmatter, "tools", entries);
}

// rules/<name>.instructions.md -> <profile.rules.dir>/<name>.instructions.md, made
// always-on with an applyTo glob (the .github/instructions/ format).
function toInstructionFile(file, profile) {
  let { frontmatter, body } = parse(file.content);
  if (profile.toolMap) {
    body = substituteProse(body, profile.toolMap);
  }
  body = substituteAgentNames(body, profile);
  // setScalar quotes the glob itself ("**" starts with a YAML indicator);
  // passing the raw value avoids double-quoting it.
  frontmatter = setScalar(frontmatter, "applyTo", profile.rules.applyTo);
  const base = file.path.slice("rules/".length);
  return { path: `${profile.rules.dir}/${base}`, content: serialize({ frontmatter, body }) };
}

// rules/<name>.instructions.md -> <profile.rules.dir>/<name>.instructions.md as
// PLAIN markdown (frontmatter dropped): opencode injects the whole file as
// instruction text via opencode.json "instructions", so VS Code-only frontmatter
// (applyTo/description) would just be noise. The file is wired in by
// synthesizeConfig's instructions glob.
function toInstructionConfigFile(file, profile) {
  let { body } = parse(file.content);
  if (profile.toolMap) {
    body = substituteProse(body, profile.toolMap);
  }
  body = substituteAgentNames(body, profile);
  const base = file.path.slice("rules/".length);
  return { path: `${profile.rules.dir}/${base}`, content: body.replace(/^\s+/, "") };
}

// --- synthesized files (opencode.json + plugin) ----------------------------

// Files built from collected source data rather than mapped 1:1 from an input.
function synthesizeFiles(files, profile, rulesContent) {
  const out = [];

  if (profile.config) {
    out.push(synthesizeConfig(files, profile));
  }
  if (profile.plugin) {
    out.push({ path: profile.plugin.location, content: profile.plugin.source });
  }
  if (profile.rules && profile.rules.strategy === "to-agents-md" && rulesContent) {
    const location = profile.rules.outLocation || "AGENTS.md";
    out.push({ path: location, content: rulesContent.replace(/\s+$/, "") + "\n" });
  }

  return out;
}

// Build the root opencode.json: $schema + mcp (transformed from the source
// .mcp.json) + instructions glob. opencode does NOT read .mcp.json, so its server
// definitions are folded in here under the opencode `mcp` schema.
function synthesizeConfig(files, profile) {
  const config = { $schema: profile.config.schema };

  if (profile.config.mcpFrom) {
    const mcpFile = files.find((file) => file.path === profile.config.mcpFrom);
    if (mcpFile) {
      const servers = transformMcpServers(parseJsonFile(mcpFile).mcpServers);
      if (Object.keys(servers).length > 0) {
        config.mcp = servers;
      }
    }
  }

  if (profile.config.instructionsGlob && files.some((file) => isRulesFile(file.path))) {
    config.instructions = [profile.config.instructionsGlob];
  }

  return { path: profile.config.location, content: JSON.stringify(config, null, 2) };
}

// .mcp.json {mcpServers:{name:{command,args,env}|{url,headers}}} -> opencode `mcp`
// {name:{type:"local",command:[cmd,...args],environment,enabled}} or remote.
function transformMcpServers(mcpServers) {
  const out = {};
  for (const [name, server] of Object.entries(mcpServers || {})) {
    if (!server || typeof server !== "object") {
      continue;
    }
    if (typeof server.url === "string" && server.url) {
      const remote = { type: "remote", url: server.url, enabled: true };
      if (server.headers && Object.keys(server.headers).length > 0) {
        remote.headers = mapVarValues(server.headers);
      }
      out[name] = remote;
    } else if (typeof server.command === "string" && server.command) {
      const command = [server.command, ...(Array.isArray(server.args) ? server.args : [])];
      const local = { type: "local", command, enabled: true };
      if (server.env && Object.keys(server.env).length > 0) {
        local.environment = mapVarValues(server.env);
      }
      out[name] = local;
    }
  }
  return out;
}

// Rewrite VS Code-style placeholders in config string values to opencode's
// {env:NAME} interpolation: ${input:NAME}, ${env:NAME}, and bare ${NAME} all
// become {env:NAME}. opencode has no input-prompt placeholder, so a secret that
// VS Code would prompt for is sourced from the environment instead.
function toOpencodeVars(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/\$\{(?:input:|env:)?([A-Za-z_][A-Za-z0-9_]*)\}/g, "{env:$1}");
}

function mapVarValues(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = toOpencodeVars(value);
  }
  return out;
}

// Rewrite VS Code input placeholders to the env-expansion form Claude Code and
// Copilot CLI both understand: ${input:NAME} -> ${NAME:-} (empty default keeps
// host config parseable when NAME is unset). Mirrors toOpencodeVars.
// Function replacer avoids any $-token ambiguity in the replacement string.
function toEnvExpansion(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{input:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name) => "${" + name + ":-}");
}

// Like mapVarValues but accepts a mapper fn instead of always using toOpencodeVars.
// Allows normalizeMcpPlaceholders to reuse the object-walk pattern with toEnvExpansion.
function mapVarValuesWith(obj, fn) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = fn(value);
  }
  return out;
}

// Parse .mcp.json, rewrite only env/args/url/headers string values via
// toEnvExpansion, reserialize. command is intentionally NOT rewritten
// (it is an executable path, not a secret value — ${input:…} placeholders
// are not expected there). Returns a fresh { path, content } — input file
// is never mutated.
function normalizeMcpPlaceholders(file) {
  const obj = parseJsonFile(file);
  for (const server of Object.values(obj.mcpServers || {})) {
    if (!server || typeof server !== "object") continue;
    if (server.env) server.env = mapVarValuesWith(server.env, toEnvExpansion);
    if (Array.isArray(server.args)) server.args = server.args.map(toEnvExpansion);
    if (typeof server.url === "string") server.url = toEnvExpansion(server.url);
    if (server.headers) server.headers = mapVarValuesWith(server.headers, toEnvExpansion);
  }
  return { path: file.path, content: JSON.stringify(obj, null, 2) };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

// Match a tool name as a distinct token: not flanked by word chars or a slash.
function tokenRegExp(key) {
  return new RegExp(`(?<![\\w/])${escapeRegExp(key)}(?![\\w/])`, "g");
}

// Substitute tool names in prose. Namespaced names (containing `/`) are
// unambiguous tool references and are replaced everywhere — this is what keeps a
// generated tree free of `vscode/` strings. Generic names (read, edit, agent)
// collide with ordinary English, so they are replaced ONLY inside backtick code
// spans, where they are explicit tool references — never in bare prose.
function substituteProse(body, toolMap) {
  let out = body;
  const keys = Object.keys(toolMap).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const replacement = toolMap[key];

    if (isDegradeMarker(replacement)) {
      // Degradation marker (e.g. codex's askQuestions / AskUserQuestion -> chat
      // protocol): replace every distinct tool-token occurrence with the
      // declared fallback instruction text, never with a bare tool-name
      // substitution. This intentionally covers plain prose tokens too, not
      // only backticked ones, because cross-target docs often mention the
      // abstract AskUserQuestion alias without code formatting.
      out = out.replace(tokenRegExp(key), replacement.degrade);
      continue;
    }

    const primary = Array.isArray(replacement) ? replacement[0] : replacement;
    if (key.includes("/")) {
      out = out.replace(tokenRegExp(key), primary);
    } else {
      out = out.replace(new RegExp("`" + escapeRegExp(key) + "`", "g"), "`" + primary + "`");
    }
  }

  return out;
}

function substituteAgentNames(body, profile) {
  if (profile.orchestrator && profile.orchestrator.renameTo) {
    const from = profile.orchestrator.agent;
    const to = profile.orchestrator.renameTo;
    return body.replace(new RegExp(escapeRegExp(from), "g"), to);
  }
  return body;
}

module.exports = { transform, serializeAgentToml };
