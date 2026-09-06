// Package installer contains the process boundary used by the installer TUI.
package installer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
)

const protocolVersion = 1

// ProcessRunner is the small seam around os/exec. stdin is supplied as a
// complete payload so callers cannot accidentally introduce shell parsing.
type ProcessRunner func(ctx context.Context, name string, args []string, cwd string, stdin []byte, stdout, stderr io.Writer) (int, error)

// Client invokes the Node adapter from the repository checkout.
type Client struct {
	NodePath    string
	AdapterPath string
	RepoDir     string
	Run         ProcessRunner
}

// NewClient returns a client using the repository's fixed adapter path.
func NewClient(repoDir string) *Client {
	return &Client{NodePath: "node", AdapterPath: "scripts/configure/installer-adapter.js", RepoDir: repoDir}
}

type Plan struct {
	Version int      `json:"version"`
	Targets []Target `json:"targets"`
}

type Target struct {
	ID                 string  `json:"id"`
	Label              string  `json:"label"`
	InstallDescription string  `json:"installDescription"`
	Agents             []Agent `json:"agents"`
}

type Agent struct {
	ID         string          `json:"id"`
	Selectable bool            `json:"selectable"`
	Inherited  bool            `json:"inherited"`
	Effective  json.RawMessage `json:"effective"`
	Choices    []Choice        `json:"choices"`
}

type Choice struct {
	ID    string          `json:"id"`
	Label string          `json:"label"`
	Value json.RawMessage `json:"value"`
}

type InstallRequest struct {
	Version    int               `json:"version,omitempty"`
	Target     string            `json:"target"`
	Selections map[string]string `json:"selections"`
}

// Plan requests a read-only adapter plan and validates its protocol version.
func (c *Client) Plan(ctx context.Context) (Plan, error) {
	var stdout, stderr bytes.Buffer
	code, err := c.run(ctx, []string{"plan"}, nil, &stdout, &stderr)
	if err != nil || code != 0 {
		return Plan{}, processError("plan", code, err, stderr.String())
	}
	var plan Plan
	if err := json.Unmarshal(stdout.Bytes(), &plan); err != nil {
		return Plan{}, fmt.Errorf("installer plan: decode response: %w", err)
	}
	if plan.Version != protocolVersion {
		return Plan{}, fmt.Errorf("installer plan: unsupported protocol version %d", plan.Version)
	}
	return plan, nil
}

// Install delegates the reviewed request and streams native diagnostics to the
// supplied writers. A non-zero adapter exit is returned as both code and error.
func (c *Client) Install(ctx context.Context, request InstallRequest, stdout, stderr io.Writer) (int, error) {
	request.Version = protocolVersion
	payload, err := json.Marshal(request)
	if err != nil {
		return 0, fmt.Errorf("installer install: encode request: %w", err)
	}
	if stdout == nil {
		stdout = io.Discard
	}
	if stderr == nil {
		stderr = io.Discard
	}
	code, runErr := c.run(ctx, []string{"install"}, payload, stdout, stderr)
	if runErr != nil || code != 0 {
		if code == 0 {
			code = -1
		}
		return code, processError("install", code, runErr, "")
	}
	return code, nil
}

func (c *Client) run(ctx context.Context, args []string, stdin []byte, stdout, stderr io.Writer) (int, error) {
	if c == nil {
		return 0, errors.New("installer client is nil")
	}
	if c.NodePath == "" || c.AdapterPath == "" || c.RepoDir == "" {
		return 0, errors.New("installer client: node path, adapter path, and repository directory are required")
	}
	runner := c.Run
	if runner == nil {
		runner = defaultProcessRunner
	}
	commandArgs := append([]string{c.AdapterPath}, args...)
	return runner(ctx, c.NodePath, commandArgs, c.RepoDir, stdin, stdout, stderr)
}

func defaultProcessRunner(ctx context.Context, name string, args []string, cwd string, stdin []byte, stdout, stderr io.Writer) (int, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = cwd
	cmd.Stdin = bytes.NewReader(stdin)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	err := cmd.Run()
	if err == nil {
		return 0, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), err
	}
	return -1, err
}

func processError(operation string, code int, runErr error, diagnostics string) error {
	if runErr == nil && code == 0 {
		return nil
	}
	if runErr != nil && diagnostics != "" {
		return fmt.Errorf("installer %s (exit %d): %w: %s", operation, code, runErr, diagnostics)
	}
	if runErr != nil {
		return fmt.Errorf("installer %s (exit %d): %w", operation, code, runErr)
	}
	return fmt.Errorf("installer %s exited with status %d", operation, code)
}
