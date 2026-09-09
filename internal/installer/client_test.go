package installer

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"testing"
)

func TestClientUsesV2PlanAndOpaqueRequest(t *testing.T) {
	c := NewClient("C:/repo")
	c.Run = func(_ context.Context, _ string, args []string, _ string, input []byte, out, _ io.Writer) (int, error) {
		if args[1] == "plan" {
			_, _ = out.Write([]byte(`{"version":2,"targets":[]}`))
			return 0, nil
		}
		var got InstallRequest
		if err := json.Unmarshal(input, &got); err != nil {
			t.Fatal(err)
		}
		if got.Mode != "inherited" || got.Selections == nil {
			t.Fatalf("request=%#v", got)
		}
		return 0, nil
	}
	if _, err := c.Plan(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Install(context.Background(), InstallRequest{Target: "antigravity", Mode: "inherited", Selections: map[string]Selection{}}, &bytes.Buffer{}, nil); err != nil {
		t.Fatal(err)
	}
}
