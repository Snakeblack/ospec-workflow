package agentidentity

import "testing"

// Tabla canónica de resolución: MISMA tabla byte-por-byte que
// scripts/lib/agent-identity.test.js (paridad E1, REQ-agent-identity-003).
// El caso `plugin-host:sdd-spec` es la REGRESIÓN del bug de prefijo de host
// que la igualdad estricta `sdd-${phase}` no reconocía.
var resolutionCases = []struct {
	name     string
	raw      string
	expected string
}{
	{"unprefixed sdd identity", "sdd-spec", "sdd-spec"},
	{"host prefix strip (regresion prefijo)", "plugin-host:sdd-spec", "sdd-spec"},
	{"review prefix strip", "host:review-runtime", "review-runtime"},
	{"trim whitespace", "  sdd-spec  ", "sdd-spec"},
	{"double prefix fails closed", "a:b:sdd-spec", Unresolved},
	{"empty prefix fails closed", ":sdd-spec", Unresolved},
	{"empty suffix fails closed", "host:", Unresolved},
	{"empty sdd suffix", "sdd-", Unresolved},
	{"empty string", "", Unresolved},
	{"blank string", "   ", Unresolved},
	{"foreign review name", "review-invented", Unresolved},
	{"unlisted review name", "review-reliability", Unresolved},
	{"bare sdd without suffix", "sdd", Unresolved},
	{"uppercase is foreign", "SDD-spec", Unresolved},
}

func TestResolveCanonicalAgentTable(t *testing.T) {
	for _, tc := range resolutionCases {
		if got := ResolveCanonicalAgent(tc.raw); got != tc.expected {
			t.Errorf("ResolveCanonicalAgent(%q) = %q, want %q", tc.raw, got, tc.expected)
		}
	}
}

func TestResolveCanonicalAgentReviewAllowlist(t *testing.T) {
	if len(ReviewAgents) != 6 {
		t.Fatalf("ReviewAgents: got %d entries, want 6", len(ReviewAgents))
	}
	for _, agent := range ReviewAgents {
		if got := ResolveCanonicalAgent(agent); got != agent {
			t.Errorf("ResolveCanonicalAgent(%q) = %q, want identity", agent, got)
		}
		if got := ResolveCanonicalAgent("host:" + agent); got != agent {
			t.Errorf("ResolveCanonicalAgent(host:%s) = %q, want %q", agent, got, agent)
		}
	}
}

var phaseKeyCases = []struct {
	canonical string
	expected  string
}{
	{"sdd-spec", "spec"},
	{"sdd-apply", "apply"},
	{"review-runtime", "review-runtime"},
	{"review-correction", "review-correction"},
	{"unknown-agent", ""},
	{Unresolved, ""},
}

func TestDerivePhaseKeyTable(t *testing.T) {
	for _, tc := range phaseKeyCases {
		if got := DerivePhaseKey(tc.canonical); got != tc.expected {
			t.Errorf("DerivePhaseKey(%q) = %q, want %q", tc.canonical, got, tc.expected)
		}
	}
}

// legacyEmitterOutput replica la lógica que hoy emiten los hooks para nombres
// sin prefijo (O1): strip `sdd-` / review self / "".
func legacyEmitterOutput(agentName string) string {
	review := map[string]bool{
		"review-change": true, "review-trust": true, "review-runtime": true,
		"review-evolution": true, "review-efficiency": true, "review-correction": true,
	}
	if len(agentName) >= 4 && agentName[:4] == "sdd-" {
		return agentName[4:]
	}
	if review[agentName] {
		return agentName
	}
	return ""
}

func TestO1CompatibilityUnprefixedNames(t *testing.T) {
	unprefixed := []string{
		"sdd-spec", "sdd-apply", "sdd-verify", "sdd-document", "sdd-orchestrator",
		"review-change", "review-trust", "review-runtime",
		"review-evolution", "review-efficiency", "review-correction",
	}
	if len(unprefixed) == 0 {
		t.Fatal("unprefixed set must be non-empty")
	}
	for _, name := range unprefixed {
		canonical := ResolveCanonicalAgent(name)
		if canonical != name {
			t.Errorf("identity: ResolveCanonicalAgent(%q) = %q", name, canonical)
		}
		if got := DerivePhaseKey(canonical); got != legacyEmitterOutput(name) {
			t.Errorf("phase key: DerivePhaseKey(%q) = %q, want legacy %q", name, got, legacyEmitterOutput(name))
		}
	}
}

// paritySet: set representativo del spec; DEBE afirmar el mismo mapa esperado
// que la tabla Parity E1 en scripts/lib/agent-identity.test.js.
var paritySet = []struct {
	raw               string
	expectedCanonical string
	expectedKey       string
}{
	{"sdd-spec", "sdd-spec", "spec"},
	{"host:sdd-spec", "sdd-spec", "spec"},
	{"review-runtime", "review-runtime", "review-runtime"},
	{"host:review-runtime", "review-runtime", "review-runtime"},
	{"review-invented", Unresolved, ""},
	{"plugin-host:sdd-spec", "sdd-spec", "spec"},
}

func TestParityE1RepresentativeNames(t *testing.T) {
	if len(paritySet) < 6 {
		t.Fatal("parity set must cover the representative spec inputs")
	}
	for _, tc := range paritySet {
		canonical := ResolveCanonicalAgent(tc.raw)
		if canonical != tc.expectedCanonical {
			t.Errorf("canonical: ResolveCanonicalAgent(%q) = %q, want %q", tc.raw, canonical, tc.expectedCanonical)
		}
		key := ""
		if canonical != Unresolved {
			key = DerivePhaseKey(canonical)
		}
		if key != tc.expectedKey {
			t.Errorf("phase key: %q -> %q, want %q", tc.raw, key, tc.expectedKey)
		}
	}
}
