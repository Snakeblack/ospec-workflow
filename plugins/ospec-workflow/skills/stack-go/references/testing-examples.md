# Go Testing Examples

One example per kind of test of [testing.md](testing.md). Names are
placeholders: keep the shape and change the code.

## Table of cases

```go
func TestParseDuration(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want time.Duration
		err  error
	}{
		{name: "minutes and seconds", in: "2m30s", want: 150 * time.Second},
		{name: "zero", in: "0s", want: 0},
		{name: "empty", in: "", err: ErrEmpty},
		{name: "negative", in: "-5s", err: ErrNegative},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ParseDuration(tc.in)
			if !errors.Is(err, tc.err) {
				t.Fatalf("ParseDuration(%q) error = %v, want %v", tc.in, err, tc.err)
			}
			if got != tc.want {
				t.Errorf("ParseDuration(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}
```

## Files

```go
func TestSaveWritesTheReport(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "report.json")

	if err := Save(path, Report{Total: 3}); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"total": 3`) {
		t.Errorf("report = %s, want the total", data)
	}
}
```

## A helper

```go
func newStore(t *testing.T) *Store {
	t.Helper()
	store, err := Open(filepath.Join(t.TempDir(), "store.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}
```

## Injected time

```go
func TestTokenExpires(t *testing.T) {
	now := time.Date(2030, 1, 1, 12, 0, 0, 0, time.UTC)
	issuer := Issuer{Now: func() time.Time { return now }}

	token := issuer.Issue(time.Hour)
	now = now.Add(61 * time.Minute)

	if issuer.Valid(token) {
		t.Error("token still valid after its lifetime")
	}
}
```

## HTTP handler and client

```go
func TestHealthHandler(t *testing.T) {
	rec := httptest.NewRecorder()
	HealthHandler(rec, httptest.NewRequest(http.MethodGet, "/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestClientReportsServerErrors(t *testing.T) {
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusServiceUnavailable)
	}))
	defer remote.Close()

	_, err := NewClient(remote.URL).Fetch(context.Background())
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}
```

## Fuzz

```go
func FuzzParseDuration(f *testing.F) {
	for _, seed := range []string{"2m30s", "0s", "", "-5s"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, in string) {
		got, err := ParseDuration(in)
		if err == nil && got < 0 {
			t.Errorf("ParseDuration(%q) = %v without an error", in, got)
		}
	})
}
```

## Golden file

```go
var update = flag.Bool("update", false, "rewrite the golden files")

func TestRenderSummary(t *testing.T) {
	got := RenderSummary(sampleReport())
	golden := filepath.Join("testdata", "summary.golden")

	if *update {
		if err := os.WriteFile(golden, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatal(err)
	}
	if got != string(want) {
		t.Errorf("summary differs from %s\n%s", golden, got)
	}
}
```

## Integration test

```go
func TestMigrateAgainstPostgres(t *testing.T) {
	if testing.Short() {
		t.Skip("needs a database")
	}
	// ...
}
```

## Bubble Tea: one transition

```go
func TestEnterOpensTheSelectedItem(t *testing.T) {
	model := NewMenu([]string{"install", "update"})

	next, cmd := model.Update(tea.KeyMsg{Type: tea.KeyDown})
	next, cmd = next.Update(tea.KeyMsg{Type: tea.KeyEnter})

	menu := next.(Menu)
	if menu.Opened != "update" {
		t.Errorf("opened %q, want update", menu.Opened)
	}
	if cmd == nil {
		t.Fatal("enter returned no command")
	}
	if _, ok := cmd().(startedMsg); !ok {
		t.Errorf("command returned %T, want startedMsg", cmd())
	}
}
```

## Bubble Tea: a whole interaction

```go
func TestQuitFromTheMenu(t *testing.T) {
	tm := teatest.NewTestModel(t, NewMenu([]string{"install", "update"}), teatest.WithInitialTermSize(80, 24))

	teatest.WaitFor(t, tm.Output(), func(out []byte) bool {
		return bytes.Contains(out, []byte("install"))
	})
	tm.Send(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("q")})
	tm.WaitFinished(t, teatest.WithFinalTimeout(2*time.Second))

	if menu := tm.FinalModel(t).(Menu); !menu.Quitting {
		t.Error("the program finished without quitting")
	}
}
```

## Commands

```bash
go test ./...                                  # the whole module
go test -race ./...                            # with the race detector
go test -short ./...                           # without slow or external tests
go test -run 'TestParseDuration/negative' ./internal/clock
go test -fuzz FuzzParseDuration -fuzztime 30s ./internal/clock
go test -cover ./...
go test -run TestRenderSummary -update ./internal/report
```
