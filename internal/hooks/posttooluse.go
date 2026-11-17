// posttooluse.go — PostToolUse (E1.27): censura los secretos de la salida de
// cualquier herramienta antes de que la vea el modelo, conservando la forma
// de la respuesta. Sin nada que censurar no escribe nada.
//
// PARIDAD: scripts/hooks/post-tool-use.js.
package hooks

import (
	"bytes"
	"encoding/json"
	"os"
	"sort"
	"strings"
)

func init() {
	Register(&postToolUseHandler{})
}

type postToolUseHandler struct{}

func (h *postToolUseHandler) Name() string { return "post-tool-use" }

var postToolUsePathKeys = []string{"file_path", "filePath", "path", "notebook_path"}

// readFiles returns the files a tool call reads. A file the name classifier
// flags (.env*, credentials, secrets.json…) is redacted in sensitive-file mode
// and a configuration file in its own mode, also when a shell command reads it
// (`cat .env`, `cat config/database.yml`).
func readFiles(toolInput map[string]interface{}, response interface{}) []string {
	var candidates []string
	for _, key := range postToolUsePathKeys {
		if value, ok := toolInput[key].(string); ok {
			candidates = append(candidates, value)
		}
	}
	if command, ok := toolInput["command"].(string); ok {
		candidates = append(candidates, shellReadFiles(command, shellFileExists)...)
	}
	if object, ok := response.(map[string]interface{}); ok {
		if file, ok := object["file"].(map[string]interface{}); ok {
			if filePath, ok := file["filePath"].(string); ok {
				candidates = append(candidates, filePath)
			}
		}
	}
	return candidates
}

func redactionNote(kinds []string) string {
	sorted := append([]string(nil), kinds...)
	sort.Strings(sorted)
	return "[ospec] Se censuraron secretos en esta salida (" + strings.Join(sorted, ", ") + "). El fichero real los conserva: no escribas el marcador [REDACTED:…] en ningún fichero."
}

// Run returns exit 1 without output when the payload cannot be read: without
// the response there is no shape to rewrite, and the launcher fails closed.
func (h *postToolUseHandler) Run(stdin []byte) ([]byte, int) {
	if os.Getenv("DISABLE_SECRET_REDACTION") == "true" {
		return nil, 0
	}
	var input struct {
		ToolInput    map[string]interface{} `json:"tool_input"`
		ToolResponse json.RawMessage        `json:"tool_response"`
	}
	if err := json.Unmarshal(stdin, &input); err != nil {
		return nil, 1
	}
	if len(input.ToolResponse) == 0 {
		return nil, 0
	}
	decoder := json.NewDecoder(bytes.NewReader(input.ToolResponse))
	decoder.UseNumber()
	var response interface{}
	if err := decoder.Decode(&response); err != nil {
		return nil, 1
	}
	value, kinds := redactDeep(response, redactOptionsFor(readFiles(input.ToolInput, response), shellDirectoryExists))
	if len(kinds) == 0 {
		return nil, 0
	}
	type hookOutput struct {
		HookEventName     string      `json:"hookEventName"`
		UpdatedToolOutput interface{} `json:"updatedToolOutput"`
		AdditionalContext string      `json:"additionalContext"`
	}
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	// JSON.stringify never escapes <, > or &: keep the bytes identical.
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(struct {
		HookSpecificOutput hookOutput `json:"hookSpecificOutput"`
	}{hookOutput{"PostToolUse", value, redactionNote(kinds)}}); err != nil {
		return nil, 1
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), 0
}
