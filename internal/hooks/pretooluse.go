// pre-tool-use hook handler.
// Ports evaluateToolUse and extractCommands
// from scripts/hooks/pre-tool-use.js.  Uses internal/rules for DENY/ASK logic.
package hooks

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/rules"
)

// gitCommitPatternRE matches "git commit" in any command string.
var gitCommitPatternRE = regexp.MustCompile(`(?i)\bgit\s+commit\b`)

// isRiskyAction mirrors isRiskyAction from scripts/hooks/lib/git-state.js.
// Returns true only when a command matches "git commit". File-write tools
// (Edit, Write, etc.) are no longer considered risky on their own: the guard
// behaves like a pre-commit check rather than firing on every edit.
func isRiskyAction(cmds []string) bool {
	for _, cmd := range cmds {
		if gitCommitPatternRE.MatchString(cmd) {
			return true
		}
	}
	return false
}

func init() {
	Register(&preToolUseHandler{})
}

type preToolUseHandler struct{}

func (h *preToolUseHandler) Name() string { return "pre-tool-use" }

// toolInput is the shape of the tool_input JSON object.
// command and commands can be mixed types so we use json.RawMessage.
type toolInput struct {
	Command  *string           `json:"command"`
	Commands []json.RawMessage `json:"commands"`
}

type preToolUseInput struct {
	ToolName       string    `json:"tool_name"`
	PermissionMode string    `json:"permission_mode"`
	ToolInput      toolInput `json:"tool_input"`
}

// extractCommands ports extractCommands from pre-tool-use.js:
// collects strings from tool_input.command (string) and tool_input.commands
// (array of strings or {command:string} objects).
func extractCommands(input *preToolUseInput) []string {
	if input == nil {
		return nil
	}
	var cmds []string
	if input.ToolInput.Command != nil {
		cmds = append(cmds, *input.ToolInput.Command)
	}
	for _, raw := range input.ToolInput.Commands {
		// Try string first.
		var s string
		if err := json.Unmarshal(raw, &s); err == nil {
			cmds = append(cmds, s)
			continue
		}
		// Try {command: string} object.
		var obj struct {
			Command string `json:"command"`
		}
		if err := json.Unmarshal(raw, &obj); err == nil && obj.Command != "" {
			cmds = append(cmds, obj.Command)
		}
	}
	return cmds
}

// makeDecision builds the hookSpecificOutput JSON blob.
func makeDecision(decision, reason string) []byte {
	type hookOutput struct {
		HookEventName            string `json:"hookEventName"`
		PermissionDecision       string `json:"permissionDecision"`
		PermissionDecisionReason string `json:"permissionDecisionReason"`
	}
	type output struct {
		HookSpecificOutput hookOutput `json:"hookSpecificOutput"`
	}
	out := output{
		HookSpecificOutput: hookOutput{
			HookEventName:            "PreToolUse",
			PermissionDecision:       decision,
			PermissionDecisionReason: reason,
		},
	}
	b, _ := json.Marshal(out)
	return b
}

func findWorkspaceRoot() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	dir := cwd
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return cwd
}

// resolveExistingFile returns the absolute path of a file-system path if it
// resolves to an existing regular file, trying first as-is and then relative
// to the workspace root. Returns ("", false) when neither location exists.
func resolveExistingFile(cleaned string) (string, bool) {
	if info, err := os.Stat(cleaned); err == nil && !info.IsDir() {
		if abs, err := filepath.Abs(cleaned); err == nil {
			return abs, true
		}
	}
	root := findWorkspaceRoot()
	rel := filepath.Join(root, cleaned)
	if info, err := os.Stat(rel); err == nil && !info.IsDir() {
		if abs, err := filepath.Abs(rel); err == nil {
			return abs, true
		}
	}
	return "", false
}

func extractPaths(v interface{}) []string {
	var paths []string
	var traverse func(x interface{})
	traverse = func(x interface{}) {
		if x == nil {
			return
		}
		switch val := x.(type) {
		case string:
			cleaned := val
			if strings.HasPrefix(cleaned, "file://") {
				cleaned = strings.TrimPrefix(cleaned, "file://")
				cleaned = strings.TrimPrefix(cleaned, "/")
			}
			if abs, ok := resolveExistingFile(cleaned); ok {
				paths = append(paths, abs)
			}
		case []interface{}:
			for _, item := range val {
				traverse(item)
			}
		case map[string]interface{}:
			for _, item := range val {
				traverse(item)
			}
		}
	}
	traverse(v)
	return paths
}

var codeExtensions = map[string]bool{
	".js": true, ".go": true, ".json": true, ".yaml": true, ".yml": true,
	".md": true, ".ts": true, ".py": true, ".txt": true, ".rs": true,
	".c": true, ".cpp": true, ".h": true, ".html": true, ".css": true,
}

func estimateTokens(filePath string) int {
	info, err := os.Stat(filePath)
	if err != nil {
		return 0
	}
	bytes := info.Size()
	ext := strings.ToLower(filepath.Ext(filePath))
	if codeExtensions[ext] {
		return int(float64(bytes)/4.0 + 0.5)
	}
	return int((float64(bytes)/6.0)*1.3 + 0.5)
}

func FindActiveChangeName() string {
	root := findWorkspaceRoot()
	changesRoot := filepath.Join(root, "openspec", "changes")
	entries, err := os.ReadDir(changesRoot)
	if err != nil {
		return "unknown"
	}
	for _, entry := range entries {
		if entry.IsDir() && entry.Name() != "archive" {
			statePath := filepath.Join(changesRoot, entry.Name(), "state.yaml")
			content, err := os.ReadFile(statePath)
			if err == nil {
				if strings.Contains(string(content), "status: active") {
					return entry.Name()
				}
			}
		}
	}
	return "unknown"
}

type tokenEvent struct {
	T  int   `json:"t"`
	TS int64 `json:"ts"`
}

func getCumulativeTokens(changeName string) int {
	if changeName == "unknown" {
		return 0
	}
	root := findWorkspaceRoot()
	logPath := filepath.Join(root, ".ospec", "session", changeName, "token-events.jsonl")
	content, err := os.ReadFile(logPath)
	if err != nil {
		return 0
	}
	lines := strings.Split(string(content), "\n")
	total := 0
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		var ev tokenEvent
		if err := json.Unmarshal([]byte(trimmed), &ev); err == nil {
			total += ev.T
		}
	}
	return total
}

func recordTokens(changeName string, tokens int) {
	if changeName == "unknown" || tokens <= 0 {
		return
	}
	root := findWorkspaceRoot()
	logDir := filepath.Join(root, ".ospec", "session", changeName)
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return
	}
	logPath := filepath.Join(logDir, "token-events.jsonl")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return
	}
	defer f.Close()

	ev := tokenEvent{
		T:  tokens,
		TS: time.Now().UnixNano() / int64(time.Millisecond),
	}
	b, err := json.Marshal(ev)
	if err == nil {
		_, _ = f.Write(append(b, '\n'))
	}
}

// applyPermissionMode degrades advisory `ask` decisions to `allow` plus a
// top-level systemMessage when the session runs in bypassPermissions: a hook
// `ask` overrides the user's chosen permission mode, so keeping it would
// re-introduce the prompts the user explicitly opted out of. `deny` decisions
// are the hard safety floor and are never degraded. Ports applyPermissionMode
// from scripts/hooks/pre-tool-use.js.
// REQ-hooks-005: on the codex target, ASK is unsupported by the host. The
// wrapper signals this via OSPEC_TARGET=codex (no permission_mode field
// exists on that host), treated as bypass-equivalent so every ask branch
// degrades identically to permission_mode:"bypassPermissions". DENY stays
// undegraded, same as the existing bypass path.
func applyPermissionMode(out []byte, permissionMode string) []byte {
	if permissionMode != "bypassPermissions" && os.Getenv("OSPEC_TARGET") != "codex" {
		return out
	}
	var decoded struct {
		HookSpecificOutput struct {
			HookEventName            string `json:"hookEventName"`
			PermissionDecision       string `json:"permissionDecision"`
			PermissionDecisionReason string `json:"permissionDecisionReason"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.Unmarshal(out, &decoded); err != nil {
		return out
	}
	if decoded.HookSpecificOutput.PermissionDecision != "ask" {
		return out
	}
	type hookOutput struct {
		HookEventName            string `json:"hookEventName"`
		PermissionDecision       string `json:"permissionDecision"`
		PermissionDecisionReason string `json:"permissionDecisionReason"`
	}
	type output struct {
		SystemMessage      string     `json:"systemMessage"`
		HookSpecificOutput hookOutput `json:"hookSpecificOutput"`
	}
	degraded := output{
		SystemMessage: "[ospec advisory] " + decoded.HookSpecificOutput.PermissionDecisionReason,
		HookSpecificOutput: hookOutput{
			HookEventName:            decoded.HookSpecificOutput.HookEventName,
			PermissionDecision:       "allow",
			PermissionDecisionReason: decoded.HookSpecificOutput.PermissionDecisionReason,
		},
	}
	b, err := json.Marshal(degraded)
	if err != nil {
		return out
	}
	return b
}

func (h *preToolUseHandler) Run(stdin []byte) ([]byte, int) {
	var input preToolUseInput
	if err := json.Unmarshal(stdin, &input); err != nil {
		return makeDecision("ask",
			"The safety hook could not inspect this tool call: "+err.Error()), 0
	}
	out, code := h.run(&input, stdin)
	return applyPermissionMode(out, input.PermissionMode), code
}

func (h *preToolUseHandler) run(input *preToolUseInput, stdin []byte) ([]byte, int) {

	if os.Getenv("DISABLE_AGENT_SHIELD") != "true" {
		var rawInput struct {
			ToolInput map[string]interface{} `json:"tool_input"`
		}
		_ = json.Unmarshal(stdin, &rawInput)

		paths := extractPaths(rawInput.ToolInput)
		for _, filePath := range paths {
			// Bloqueo/advertencia por nombre de archivo (secretscan.go)
			if class := classifySensitiveFile(filePath); class != nil {
				if class.action == "deny" {
					return makeDecision("deny", "Acceso denegado: El archivo es una clave privada o configuración sensible del sistema y no puede ser leído por el agente."), 0
				}
				return makeDecision("ask", "Advertencia de seguridad: Se detectó un posible archivo de entorno o secreto. ¿Está seguro de permitir su lectura?"), 0
			}

			// Escaneo de contenido (tokens conocidos + credenciales genéricas)
			if matched, _ := scanFileForSecrets(filePath); matched {
				return makeDecision("ask", "Advertencia de seguridad: El contenido de este archivo parece contener credenciales o tokens. ¿Está seguro de permitir su lectura?"), 0
			}
		}
	}

	if os.Getenv("DISABLE_TOKEN_ADVISOR") != "true" {
		var rawInput struct {
			ToolInput map[string]interface{} `json:"tool_input"`
		}
		_ = json.Unmarshal(stdin, &rawInput)

		paths := extractPaths(rawInput.ToolInput)
		currentTokens := 0
		for _, p := range paths {
			currentTokens += estimateTokens(p)
		}

		if currentTokens > 50000 {
			reason := fmt.Sprintf("El archivo solicitado excede el límite de tokens sugerido de 50,000 (%d tokens estimados). ¿Desea continuar con su lectura?", currentTokens)
			return makeDecision("ask", reason), 0
		}

		changeName := FindActiveChangeName()
		cumulativeTokens := getCumulativeTokens(changeName)
		if cumulativeTokens+currentTokens > 150000 {
			reason := fmt.Sprintf("El consumo acumulado de tokens de la sesión (%d tokens) excede el umbral crítico de 150,000 tokens. Se recomienda forzar una compactación antes de continuar.", cumulativeTokens+currentTokens)
			return makeDecision("ask", reason), 0
		}

		if currentTokens > 0 {
			recordTokens(changeName, currentTokens)
		}
	}

	cmds := extractCommands(input)

	// Step 5 — DENY rules take priority (only when commands are present).
	if len(cmds) > 0 {
		for _, cmd := range cmds {
			action, reason := rules.Evaluate(cmd)
			if action == "deny" {
				return makeDecision("deny", reason), 0
			}
		}
	}

	// Step 5b — Git collaboration guard: fires only for git commit commands;
	// file-write tools no longer trigger it on their own.
	if os.Getenv("DISABLE_GIT_COLLABORATION_GUARD") != "true" {
		if isRiskyAction(cmds) {
			ctx5b, cancel5b := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel5b()
			gs := resolveGitState(ctx5b)
			onDefault := gs.DefaultBranch != nil && gs.CurrentBranch != nil &&
				*gs.DefaultBranch == *gs.CurrentBranch
			if onDefault || (gs.Dirty != nil && *gs.Dirty) {
				branchName := ""
				if gs.CurrentBranch != nil {
					branchName = *gs.CurrentBranch
				}
				advisory := composeAdvisory(onDefault, gs.Dirty, branchName)
				return makeDecision("ask", advisory), 0
			}
		}
	}

	// No commands present — allow without reaching the ASK/ALLOW pass.
	// Step 5b only ever fires for commands matching `git commit`, so tools with
	// no command payload (Edit, Write, etc.) always fall through to here.
	if len(cmds) == 0 {
		return makeDecision("allow", "Tool did not include a command payload."), 0
	}

	// Step 6 — ASK rules (only if no deny or guard match).
	for _, cmd := range cmds {
		action, reason := rules.Evaluate(cmd)
		if action == "ask" {
			return makeDecision("ask", reason), 0
		}
	}

	return makeDecision("allow", "Command payload passed the safety policy."), 0
}
