package installer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"testing"
)

func TestClientPlanUsesArgumentVectorAndRepositoryCwd(t *testing.T) {
	var gotName, gotCwd string
	var gotArgs []string
	client := NewClient("C:/repo with spaces")
	client.Run = func(_ context.Context, name string, args []string, cwd string, _ []byte, stdout, _ io.Writer) (int, error) {
		gotName, gotCwd, gotArgs = name, cwd, append([]string(nil), args...)
		_, _ = stdout.Write([]byte(`{"version":1,"targets":[{"id":"codex","label":"Codex","installDescription":"x","agents":[{"id":"a","selectable":true,"inherited":false,"effective":{"model":"m"},"choices":[{"id":"choice","label":"M","value":["m"]}]}]}]}`))
		return 0, nil
	}

	plan, err := client.Plan(context.Background())
	if err != nil {
		t.Fatalf("Plan() error = %v", err)
	}
	if gotName != "node" || gotCwd != "C:/repo with spaces" {
		t.Fatalf("command = %q cwd = %q", gotName, gotCwd)
	}
	wantArgs := []string{"scripts/configure/installer-adapter.js", "plan"}
	if !reflect.DeepEqual(gotArgs, wantArgs) {
		t.Fatalf("args = %#v, want %#v", gotArgs, wantArgs)
	}
	if plan.Version != 1 || plan.Targets[0].Agents[0].Choices[0].Value == nil {
		t.Fatalf("plan did not retain typed raw choice value: %#v", plan)
	}
}

func TestClientInstallWritesJSONStdinAndPropagatesStreamsAndExitCode(t *testing.T) {
	client := NewClient("C:/repo")
	var gotArgs []string
	var gotInput []byte
	client.Run = func(_ context.Context, name string, args []string, cwd string, stdin []byte, stdout, stderr io.Writer) (int, error) {
		gotArgs = append([]string{name, cwd}, args...)
		gotInput = append([]byte(nil), stdin...)
		_, _ = stdout.Write([]byte("installer output"))
		_, _ = stderr.Write([]byte("installer warning"))
		return 7, errors.New("exit status 7")
	}
	var stdout, stderr bytes.Buffer
	code, err := client.Install(context.Background(), InstallRequest{Target: "codex", Selections: map[string]string{"agent": "choice"}}, &stdout, &stderr)
	if code != 7 || err == nil {
		t.Fatalf("Install() = (%d, %v), want exit 7 and error", code, err)
	}
	if stdout.String() != "installer output" || stderr.String() != "installer warning" {
		t.Fatalf("streams = %q / %q", stdout.String(), stderr.String())
	}
	if !reflect.DeepEqual(gotArgs, []string{"node", "C:/repo", "scripts/configure/installer-adapter.js", "install"}) {
		t.Fatalf("args = %#v", gotArgs)
	}
	var decoded InstallRequest
	if err := json.Unmarshal(gotInput, &decoded); err != nil {
		t.Fatalf("stdin is not JSON: %v", err)
	}
	if !reflect.DeepEqual(decoded, InstallRequest{Version: 1, Target: "codex", Selections: map[string]string{"agent": "choice"}}) {
		t.Fatalf("stdin request = %#v", decoded)
	}
}

func TestClientRejectsMalformedPlan(t *testing.T) {
	client := NewClient("C:/repo")
	client.Run = func(_ context.Context, _ string, _ []string, _ string, _ []byte, stdout, _ io.Writer) (int, error) {
		_, _ = stdout.Write([]byte(`{"version":2}`))
		return 0, nil
	}
	if _, err := client.Plan(context.Background()); err == nil {
		t.Fatal("Plan() accepted unsupported version")
	}
}

func TestClientInstallStreamsDiagnosticsBeforeRunnerReturns(t *testing.T) {
	client := NewClient("C:/repo")
	var stdout bytes.Buffer
	client.Run = func(_ context.Context, _ string, _ []string, _ string, _ []byte, out, _ io.Writer) (int, error) {
		_, _ = out.Write([]byte("first"))
		if stdout.String() != "first" {
			t.Fatalf("output was buffered until process exit: %q", stdout.String())
		}
		_, _ = out.Write([]byte(" second"))
		return 0, nil
	}
	if code, err := client.Install(context.Background(), InstallRequest{Target: "codex"}, &stdout, nil); code != 0 || err != nil {
		t.Fatalf("Install() = (%d, %v)", code, err)
	}
	if stdout.String() != "first second" {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestClientInstallProcessFailureCannotLookSuccessful(t *testing.T) {
	client := NewClient("C:/repo")
	client.Run = func(_ context.Context, _ string, _ []string, _ string, _ []byte, _, _ io.Writer) (int, error) {
		return 0, errors.New("process could not start")
	}
	if code, err := client.Install(context.Background(), InstallRequest{Target: "codex"}, nil, nil); code == 0 || err == nil {
		t.Fatalf("Install() = (%d, %v), want non-zero code and error", code, err)
	}
}
