// E1.51 open-change-nudge: the Go port of scripts/hooks/lib/idd-nudge.js.
// SessionStart tells the model which IDD changes are open, and Stop asks it
// once to continue a change the session moved that still has a step needing
// no answer from the user. The shared cases of internal/testdata/idd-nudge/
// keep both implementations identical.
package hooks

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/iddsession"
	"github.com/snakeblack/ospec-workflow/internal/ospecdir"
	"github.com/snakeblack/ospec-workflow/internal/store"
)

const (
	nudgeFile        = ".ospec/idd-nudge.json"
	disableNudgeEnv  = "DISABLE_IDD_NUDGE"
	maxNudgeSessions = 32
	maxNudgeAsked    = 32
	nudgeEmptyTree   = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
	nudgeGitTimeout  = 3 * time.Second
)

// nudgeActions are the steps the agent can take without the user.
var nudgeActions = map[string]bool{"satisfy-obligation": true, "declare-plan": true, "close": true}

var nudgeExcludes = []string{":(exclude,glob)idd/*/**", ":(exclude).ospec"}

func nudgeDisabled() bool {
	return os.Getenv(disableNudgeEnv) == "true"
}

// nudgeSessionKey is the session a hook payload belongs to; Cursor names it
// conversation_id.
func nudgeSessionKey(input map[string]any) string {
	for _, key := range []string{"sessionId", "session_id", "conversation_id"} {
		if value, ok := input[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return "unknown"
}

// nudgeContinuation tells whether the host says this turn already continues
// one a hook asked for.
func nudgeContinuation(input map[string]any) bool {
	for _, key := range []string{"stop_hook_active", "continuationActive", "continuation_active"} {
		if value, ok := input[key].(bool); ok && value {
			return true
		}
	}
	count, ok := input["loop_count"].(float64)
	return ok && count > 0 && count == float64(int64(count))
}

func runNudgeGit(root string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), nudgeGitTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", root, "-c", "core.quotePath=false"}, args...)...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		if line := firstNudgeLine(stderr.String()); line != "" {
			return nil, errors.New(line)
		}
		return nil, err
	}
	return out, nil
}

func firstNudgeLine(text string) string {
	return strings.TrimSpace(strings.SplitN(strings.TrimSpace(text), "\n", 2)[0])
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func untrackedNudgeEntry(root string, file []byte) (string, string) {
	full := filepath.Join(root, filepath.FromSlash(string(file)))
	info, err := os.Lstat(full)
	if err != nil {
		return "unreadable", sha256Hex(nil)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(full)
		if err != nil {
			return "unreadable", sha256Hex(nil)
		}
		return "untracked-symlink", sha256Hex([]byte(target))
	}
	content, err := os.ReadFile(full)
	if err != nil {
		return "unreadable", sha256Hex(nil)
	}
	return "untracked", sha256Hex(content)
}

// nudgeFingerprint is nudgeFingerprint of idd-nudge.js: the work tree (HEAD,
// the binary diff of tracked files and every untracked file, without
// idd/<change>/ or .ospec/) and the state of the open changes ids.
func nudgeFingerprint(root string, ids []string) (string, error) {
	// Outside a work tree git diff falls back to --no-index.
	if _, err := runNudgeGit(root, "rev-parse", "--is-inside-work-tree"); err != nil {
		return "", err
	}
	head := ""
	if out, err := runNudgeGit(root, "rev-parse", "--verify", "--quiet", "HEAD^{commit}"); err == nil {
		head = strings.TrimSpace(string(out))
	}
	label, base := head, head
	if head == "" {
		label, base = "none", nudgeEmptyTree
	}
	hash := sha256.New()
	io.WriteString(hash, "ospec-nudge/v1\x00head\x00"+label+"\x00")
	diff, err := runNudgeGit(root, append([]string{"diff", "--binary", "--no-color", "--no-ext-diff", "--no-renames", base, "--", "."}, nudgeExcludes...)...)
	if err != nil {
		return "", err
	}
	hash.Write(diff)
	listed, err := runNudgeGit(root, append([]string{"ls-files", "--others", "--exclude-standard", "-z", "--", "."}, nudgeExcludes...)...)
	if err != nil {
		return "", err
	}
	var files [][]byte
	for _, file := range bytes.Split(listed, []byte{0}) {
		if len(file) > 0 {
			files = append(files, file)
		}
	}
	sort.Slice(files, func(i, j int) bool { return bytes.Compare(files[i], files[j]) < 0 })
	for _, file := range files {
		kind, digest := untrackedNudgeEntry(root, file)
		io.WriteString(hash, "\x00"+kind+"\x00")
		hash.Write(file)
		io.WriteString(hash, "\x00"+digest)
	}
	sorted := append([]string(nil), ids...)
	sort.Strings(sorted)
	for _, id := range sorted {
		state, err := os.ReadFile(filepath.Join(root, "idd", id, "state.yaml"))
		if err != nil {
			state = nil
		}
		io.WriteString(hash, "\x00state\x00"+id+"\x00"+sha256Hex(state))
	}
	return "sha256:" + hex.EncodeToString(hash.Sum(nil)), nil
}

type nudgeSession struct {
	ID   string `json:"id"`
	Base string `json:"base"`
}

type nudgeAsked struct {
	Change      string `json:"change"`
	Fingerprint string `json:"fingerprint"`
}

type nudgeRecord struct {
	Sessions []nudgeSession `json:"sessions"`
	Asked    []nudgeAsked   `json:"asked"`
}

func nudgeText(raw json.RawMessage) (string, bool) {
	var value string
	if !strings.HasPrefix(strings.TrimSpace(string(raw)), "\"") || json.Unmarshal(raw, &value) != nil || value == "" {
		return "", false
	}
	return value, true
}

func nudgeObjects(raw json.RawMessage) []map[string]json.RawMessage {
	var list []json.RawMessage
	if json.Unmarshal(raw, &list) != nil {
		return nil
	}
	var objects []map[string]json.RawMessage
	for _, item := range list {
		var object map[string]json.RawMessage
		if json.Unmarshal(item, &object) == nil && object != nil {
			objects = append(objects, object)
		}
	}
	return objects
}

// readNudgeRecord returns the record, or an empty one when it is missing or
// unreadable; entries that are not well formed are dropped.
func readNudgeRecord(workspace string) nudgeRecord {
	record := nudgeRecord{Sessions: []nudgeSession{}, Asked: []nudgeAsked{}}
	data, err := os.ReadFile(filepath.Join(workspace, filepath.FromSlash(nudgeFile)))
	if err != nil {
		return record
	}
	var parsed map[string]json.RawMessage
	if json.Unmarshal(data, &parsed) != nil || parsed == nil {
		return record
	}
	for _, entry := range nudgeObjects(parsed["sessions"]) {
		id, okID := nudgeText(entry["id"])
		base, okBase := nudgeText(entry["base"])
		if okID && okBase {
			record.Sessions = append(record.Sessions, nudgeSession{ID: id, Base: base})
		}
	}
	for _, entry := range nudgeObjects(parsed["asked"]) {
		change, okChange := nudgeText(entry["change"])
		fingerprint, okFingerprint := nudgeText(entry["fingerprint"])
		if okChange && okFingerprint {
			record.Asked = append(record.Asked, nudgeAsked{Change: change, Fingerprint: fingerprint})
		}
	}
	return record
}

func lastNudge[T any](list []T, limit int) []T {
	if len(list) > limit {
		list = list[len(list)-limit:]
	}
	if list == nil {
		return []T{}
	}
	return list
}

func writeNudgeRecord(workspace string, record nudgeRecord) error {
	path := filepath.Join(workspace, filepath.FromSlash(nudgeFile))
	if err := ospecdir.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(nudgeRecord{
		Sessions: lastNudge(record.Sessions, maxNudgeSessions),
		Asked:    lastNudge(record.Asked, maxNudgeAsked),
	}); err != nil {
		return err
	}
	return store.WriteFileAtomic(path, buf.String())
}

func isIddProject(workspace string) bool {
	info, err := os.Stat(filepath.Join(workspace, "idd"))
	return err == nil && info.IsDir()
}

func nudgeIDs(entries []iddsession.Entry) []string {
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		ids = append(ids, entry.Change)
	}
	return ids
}

func renderNudgeSteps(entries []iddsession.Entry) string {
	lines := make([]string, 0, len(entries))
	for _, entry := range entries {
		lines = append(lines, "- `"+entry.Change+"`: "+entry.NextAction)
	}
	return strings.Join(lines, "\n")
}

func renderNudgeContext(entries []iddsession.Entry) string {
	return strings.Join([]string{
		"ospec: these IDD changes are open; their state is on disk and `ospec next --change <id>` gives each one's full next step:",
		renderNudgeSteps(entries),
		"A change is done only after `ospec close`.",
	}, "\n")
}

func renderNudgeReason(entries []iddsession.Entry) string {
	return strings.Join([]string{
		"ospec: these open IDD changes have a next step that needs no answer from the user:",
		renderNudgeSteps(entries),
		"Continue with them; a change is done only after `ospec close`. If you stopped to wait for the user's answer, say so and end your turn again. If a change was superseded or discarded, ask the user whether to abandon it with `ospec abandon --change <id> --reason \"<why>\"`.",
	}, "\n")
}

// nudgeStart is what SessionStart adds for the open IDD changes.
type nudgeStart struct {
	additionalContext string
	systemMessage     string
}

// sessionStartNudge is sessionStartNudge of idd-nudge.js: it records the
// fingerprint the session starts from in an IDD project and returns the open
// changes for the model and the user. On Cursor the hook runs before every
// prompt, so only the first one of a conversation gets them.
func sessionStartNudge(workspace string, input map[string]any, entries []iddsession.Entry, target string) *nudgeStart {
	if nudgeDisabled() || !isIddProject(workspace) {
		return nil
	}
	session := nudgeSessionKey(input)
	record := readNudgeRecord(workspace)
	known := false
	for _, entry := range record.Sessions {
		if entry.ID == session {
			known = true
			break
		}
	}
	if !known {
		// Without a base the first Stop of the session records one.
		if base, err := nudgeFingerprint(workspace, nudgeIDs(entries)); err == nil {
			record.Sessions = append(record.Sessions, nudgeSession{ID: session, Base: base})
			_ = writeNudgeRecord(workspace, record)
		}
	}
	if len(entries) == 0 || (target == "cursor" && known) {
		return nil
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, "`"+entry.Change+"`")
	}
	return &nudgeStart{
		additionalContext: renderNudgeContext(entries),
		systemMessage:     "ospec: open IDD changes: " + strings.Join(names, ", ") + ".",
	}
}

// stopNudge is stopNudge of idd-nudge.js: a reason asks the agent to
// continue, a warning says why it could not decide, neither asks nothing.
func stopNudge(workspace string, input map[string]any, entries []iddsession.Entry) (reason, warning string) {
	if nudgeDisabled() || len(entries) == 0 || nudgeContinuation(input) {
		return "", ""
	}
	var pending []iddsession.Entry
	for _, entry := range entries {
		if entry.GateOpen {
			return "", ""
		}
		if nudgeActions[entry.Action] {
			pending = append(pending, entry)
		}
	}
	if len(pending) == 0 {
		return "", ""
	}
	fingerprint, err := nudgeFingerprint(workspace, nudgeIDs(entries))
	if err != nil {
		return "", "ospec did not ask to continue the open IDD changes: it could not read the work tree (" + nudgeError(err) + ")"
	}
	record := readNudgeRecord(workspace)
	session := nudgeSessionKey(input)
	var start *nudgeSession
	for i := range record.Sessions {
		if record.Sessions[i].ID == session {
			start = &record.Sessions[i]
			break
		}
	}
	unwritable := func(err error) string {
		return "ospec did not ask to continue the open IDD changes: it could not write " + nudgeFile + " (" + nudgeError(err) + ")"
	}
	if start == nil {
		record.Sessions = append(record.Sessions, nudgeSession{ID: session, Base: fingerprint})
		if err := writeNudgeRecord(workspace, record); err != nil {
			return "", unwritable(err)
		}
		return "", ""
	}
	if start.Base == fingerprint {
		return "", ""
	}
	asked := map[string]bool{}
	for _, entry := range record.Asked {
		asked[entry.Change+"\x00"+entry.Fingerprint] = true
	}
	var toAsk []iddsession.Entry
	for _, entry := range pending {
		if !asked[entry.Change+"\x00"+fingerprint] {
			toAsk = append(toAsk, entry)
			record.Asked = append(record.Asked, nudgeAsked{Change: entry.Change, Fingerprint: fingerprint})
		}
	}
	if len(toAsk) == 0 {
		return "", ""
	}
	if err := writeNudgeRecord(workspace, record); err != nil {
		return "", unwritable(err)
	}
	return renderNudgeReason(toAsk), ""
}

func nudgeError(err error) string {
	if line := firstNudgeLine(err.Error()); line != "" {
		return line
	}
	return "unknown error"
}
