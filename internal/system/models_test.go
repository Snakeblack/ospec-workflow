package system_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/system"
)

func TestQueryLocalOllama_MockServer(t *testing.T) {
	mockResponse := map[string]any{
		"models": []map[string]any{
			{
				"name":        "llama3.2:latest",
				"size":        2000000000,
				"modified_at": time.Now().Format(time.RFC3339),
				"details": map[string]any{
					"family": "llama",
				},
			},
			{
				"name":        "qwen2.5-coder:32b",
				"size":        19000000000,
				"modified_at": time.Now().Format(time.RFC3339),
				"details": map[string]any{
					"family": "qwen2",
				},
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(mockResponse)
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	online, models, err := system.QueryLocalOllama(ctx, server.URL)
	if err != nil {
		t.Fatalf("unexpected error querying mock Ollama: %v", err)
	}
	if !online {
		t.Fatalf("expected Ollama to be online")
	}
	if len(models) != 2 {
		t.Fatalf("expected 2 models, got %d", len(models))
	}
	if models[0].Name != "llama3.2:latest" {
		t.Errorf("model[0] name = %q, want 'llama3.2:latest'", models[0].Name)
	}
	if models[1].Family != "qwen2" {
		t.Errorf("model[1] family = %q, want 'qwen2'", models[1].Family)
	}
}

func TestQueryLocalOllama_Offline(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	// Query an invalid port
	online, _, _ := system.QueryLocalOllama(ctx, "http://127.0.0.1:59999")
	if online {
		t.Errorf("expected offline for closed port")
	}
}

func TestInspectProviders_EnvKeys(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant-mock-key")
	t.Setenv("OPENAI_API_KEY", "")

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	providers, _ := system.InspectProviders(ctx)

	var anthropic, openai *system.ProviderSpec
	for i := range providers {
		if providers[i].ID == "anthropic" {
			anthropic = &providers[i]
		}
		if providers[i].ID == "openai" {
			openai = &providers[i]
		}
	}

	if anthropic == nil || !anthropic.IsAvailable {
		t.Errorf("expected anthropic to be available with ANTHROPIC_API_KEY set")
	}
	if openai == nil || openai.IsAvailable {
		t.Errorf("expected openai to be unavailable with empty OPENAI_API_KEY")
	}
}

func TestInspectModelsFull(t *testing.T) {
	rep := system.InspectModelsFull(".")
	if len(rep.Providers) == 0 {
		t.Errorf("expected providers list to not be empty")
	}
}
