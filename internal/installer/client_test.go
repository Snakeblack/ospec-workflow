package installer

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"testing"
)

func TestClientUsesV3PlanAndTierModels(t *testing.T) {
	c := NewClient("C:/repo")
	c.Run = func(_ context.Context, _ string, args []string, _ string, input []byte, out, _ io.Writer) (int, error) {
		if args[1] == "plan" {
			_, _ = out.Write([]byte(`{"version":3,"targets":[]}`))
			return 0, nil
		}
		var got InstallRequest
		if err := json.Unmarshal(input, &got); err != nil {
			t.Fatal(err)
		}
		if got.Version != 3 || got.Target != "codex" || got.Models["premium"] != "gpt-x" || got.Models["cheap"] != "" {
			t.Fatalf("request=%#v", got)
		}
		return 0, nil
	}
	if _, err := c.Plan(context.Background()); err != nil {
		t.Fatal(err)
	}
	request := InstallRequest{Target: "codex", Models: map[string]string{"premium": "gpt-x", "default": "", "cheap": ""}}
	if _, err := c.Install(context.Background(), request, &bytes.Buffer{}, nil); err != nil {
		t.Fatal(err)
	}
}

func TestClientRejectsAnotherProtocolVersion(t *testing.T) {
	c := NewClient("C:/repo")
	c.Run = func(_ context.Context, _ string, _ []string, _ string, _ []byte, out, _ io.Writer) (int, error) {
		_, _ = out.Write([]byte(`{"version":2,"targets":[]}`))
		return 0, nil
	}
	if _, err := c.Plan(context.Background()); err == nil {
		t.Fatal("a v2 plan must be rejected")
	}
}
