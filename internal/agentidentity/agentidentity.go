// Package agentidentity is the Go mirror of scripts/lib/agent-identity.js
// (REQ-agent-identity-001/003): canonical resolution of a registered agent
// name, possibly host/plugin-prefixed, to exactly one harness canonical agent
// or to the Unresolved sentinel. Same closed set, same prefix grammar and same
// failure semantics as the JS authority; parity is enforced by mirrored test
// tables in both runtimes. Pure functions, no I/O, no registry.
package agentidentity

import (
	"regexp"
	"strings"
)

// Unresolved is the fail-closed sentinel returned for any name outside the
// harness-owned closed set. Never throws/panics: consumers apply their own
// skip/reject policy.
const Unresolved = "unresolved"

// ReviewAgents is the closed-world allowlist of first-party review lifecycle
// agents (byte-identical to REVIEW_AGENTS in scripts/lib/agent-identity.js).
var ReviewAgents = [...]string{
	"review-change",
	"review-trust",
	"review-runtime",
	"review-evolution",
	"review-efficiency",
	"review-correction",
}

var reviewAgentSet = func() map[string]bool {
	set := make(map[string]bool, len(ReviewAgents))
	for _, agent := range ReviewAgents {
		set[agent] = true
	}
	return set
}()

// sddAgentPattern mirrors /^sdd-[a-z][a-z0-9-]*$/ (non-empty suffix).
var sddAgentPattern = regexp.MustCompile(`^sdd-[a-z][a-z0-9-]*$`)

// ResolveCanonicalAgent resolves a registered agent name to exactly one
// canonical harness agent or to Unresolved. A registered name may carry at
// most one host/plugin prefix expressed as everything before a single ":"
// separator; the remainder — not the prefix — decides ownership. Malformed,
// double-prefixed or foreign names fail closed.
func ResolveCanonicalAgent(rawName string) string {
	name := strings.TrimSpace(rawName)
	if name == "" {
		return Unresolved
	}

	bareName := name
	if strings.Contains(name, ":") {
		parts := strings.Split(name, ":")
		// Exactly one separator with non-empty prefix and non-empty
		// remainder, else the name is malformed/foreign and fails closed.
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return Unresolved
		}
		bareName = parts[1]
	}

	if reviewAgentSet[bareName] || sddAgentPattern.MatchString(bareName) {
		return bareName
	}

	return Unresolved
}

// DerivePhaseKey derives the phase key from a canonical agent name: strips
// "sdd-" for phase agents; allowlisted review agents are their own phase key;
// everything else yields "". Semantics preserved verbatim from the prior
// hook-local derivePhaseKey copy so unprefixed output stays identical (O1).
func DerivePhaseKey(canonicalAgent string) string {
	if strings.HasPrefix(canonicalAgent, "sdd-") {
		return strings.TrimPrefix(canonicalAgent, "sdd-")
	}
	if reviewAgentSet[canonicalAgent] {
		return canonicalAgent
	}
	return ""
}
