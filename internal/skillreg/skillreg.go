// Package skillreg is a Go port of scripts/lib/skill-registry.js.
// It discovers skills in a plugin root, computes a deterministic fingerprint,
// and reads/writes a versioned JSON cache.
package skillreg

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// CacheVersion is the schema version written to the registry cache.
const CacheVersion = 2

// ── public types ──────────────────────────────────────────────────────────────

// SkillEntry holds the parsed metadata for a single skill.
type SkillEntry struct {
	ID           string   `json:"id"`
	Path         string   `json:"path"`
	Triggers     []string `json:"triggers"`
	CompactRules []string `json:"compact_rules"`
	Capabilities []string `json:"capabilities"`
}

// FingerprintPath pairs a file's absolute path with its workspace-relative
// portable path (forward-slash separated) for deterministic hashing.
// Content, when non-nil, lets CalculateFingerprint hash bytes already read
// during discovery instead of re-reading the file.
type FingerprintPath struct {
	AbsolutePath string
	RelativePath string
	Content      []byte
}

// DiscoveryResult is returned by DiscoverSkills.
type DiscoveryResult struct {
	// FingerprintPaths is the sorted set of all files included in the
	// fingerprint (SKILL.md + _shared/*.md + rules/*.md).
	FingerprintPaths []FingerprintPath
	// Skills is the filtered, sorted list of non-sdd, non-shared skills.
	Skills []SkillEntry
}

// ── regex ─────────────────────────────────────────────────────────────────────

var (
	frontmatterRe   = regexp.MustCompile(`(?s)^---\r?\n(.*?)\r?\n---\r?\n?`)
	triggerRe       = regexp.MustCompile(`(?i)\bTrigger:\s*(.+)$`)
	rulesSectionRe  = regexp.MustCompile(`(?i)\b(?:(?:hard|critical|core|decision)\s+)?(?:rules|patterns|constraints|gates)\b`)
	headingRe       = regexp.MustCompile(`^#{2,4}\s+(.+?)\s*$`)
	bulletRe        = regexp.MustCompile(`^\s*(?:[-*+]|\d+\.)\s+`)
	tableSepRe      = regexp.MustCompile(`^\|[\s:|-]+\|$`)
	tableRowRe      = regexp.MustCompile(`^\|.+\|$`)
)

// ── DiscoverSkills ────────────────────────────────────────────────────────────

// DiscoverOptions mirrors the discoverSkills options in skill-registry.js.
// The zero value walks root/skills with no required-skill guard.
type DiscoverOptions struct {
	// SkillsRoot overrides the bundle's own skills directory. Global Codex
	// installs split scripts (~/.codex/ospec-workflow) from skills
	// (~/.agents/skills); source and generated bundles keep root/skills.
	SkillsRoot string
	// RequireSkills fails discovery when the skills root holds no SKILL.md,
	// so a broken bundle cannot replace a working registry cache with the
	// fingerprint of an empty input set.
	RequireSkills bool
}

// DiscoverSkills walks the skills root and root/rules/ to collect fingerprint
// paths and parsed skill entries.  Missing directories are silently skipped.
// The zero DiscoverOptions walks root/skills with no required-skill guard.
func DiscoverSkills(root string, opts DiscoverOptions) (*DiscoveryResult, error) {
	absRoot := filepath.Clean(root)
	bundleSkillsRoot := filepath.Join(absRoot, "skills")
	skillsRoot := bundleSkillsRoot
	if opts.SkillsRoot != "" {
		skillsRoot = filepath.Clean(opts.SkillsRoot)
	}
	externalSkills := !samePath(bundleSkillsRoot, skillsRoot)
	rulesRoot := filepath.Join(absRoot, "rules")

	skillFiles, err := collectFiles(skillsRoot, func(abs string) bool {
		rel := toPortablePath(relativeTo(skillsRoot, abs))
		return filepath.Base(abs) == "SKILL.md" ||
			(strings.HasPrefix(rel, "_shared/") && strings.HasSuffix(abs, ".md"))
	})
	if err != nil {
		return nil, fmt.Errorf("skillreg.DiscoverSkills skills: %w", err)
	}

	// Optional project skills may be absent. A hook's required bundle must not
	// silently replace a working registry with the SHA of an empty input set.
	if opts.RequireSkills {
		if !containsSkillFile(skillFiles) {
			return nil, fmt.Errorf("no SKILL.md files found in required skills root: %s", skillsRoot)
		}
		if externalSkills && !hasOspecIdentity(skillsRoot, skillFiles) {
			return nil, fmt.Errorf("no OSpec identity anchors found in required external skills root: %s", skillsRoot)
		}
	}

	ruleFiles, err := collectFiles(rulesRoot, func(abs string) bool {
		return strings.HasSuffix(abs, ".md")
	})
	if err != nil {
		return nil, fmt.Errorf("skillreg.DiscoverSkills rules: %w", err)
	}

	// Build fingerprint paths sorted by relative path, reading each file once.
	// Skill files are namespaced under "skills/" relative to the (possibly
	// external) skills root; rule files stay relative to the plugin root.
	// An unreadable file keeps its fingerprint entry (with 0-byte content,
	// mirroring the JS implementation) but is skipped as a skill candidate.
	var fpPaths []FingerprintPath
	readOk := make(map[string]bool)
	for _, abs := range skillFiles {
		fp, ok := readFingerprintFile(abs, "skills/"+toPortablePath(relativeTo(skillsRoot, abs)))
		fpPaths = append(fpPaths, fp)
		readOk[fp.RelativePath] = ok
	}
	for _, abs := range ruleFiles {
		fp, ok := readFingerprintFile(abs, toPortablePath(relativeTo(absRoot, abs)))
		fpPaths = append(fpPaths, fp)
		readOk[fp.RelativePath] = ok
	}
	sort.Slice(fpPaths, func(i, j int) bool {
		return fpPaths[i].RelativePath < fpPaths[j].RelativePath
	})

	// Parse skills from files that satisfy shouldIncludeSkill and succeeded reading.
	var skills []SkillEntry
	for _, fp := range fpPaths {
		if !shouldIncludeSkill(fp.RelativePath) || !readOk[fp.RelativePath] {
			continue
		}
		attrs, body := parseFrontmatter(string(fp.Content))
		fallbackName := filepath.Base(filepath.Dir(fp.AbsolutePath))
		id := attrs["name"]
		if id == "" {
			id = fallbackName
		}
		// External skills keep their portable absolute path so injected
		// prompts can read them outside the plugin root.
		skillPath := fp.RelativePath
		if externalSkills {
			skillPath = toPortablePath(fp.AbsolutePath)
		}
		skills = append(skills, SkillEntry{
			ID:           id,
			Path:         skillPath,
			Triggers:     extractTriggers(attrs["description"], id),
			CompactRules: extractCompactRules(body),
			Capabilities: extractCapabilities(attrs["capabilities"]),
		})
	}
	sort.Slice(skills, func(i, j int) bool {
		return skills[i].ID < skills[j].ID
	})

	return &DiscoveryResult{FingerprintPaths: fpPaths, Skills: skills}, nil
}

// hasOspecIdentity reports whether an external skills root contains canonical
// OSpec identity anchors: _shared/*.md, skill-registry/SKILL.md, or
// .ospec-workflow-install.json in the skills root or its parent directory.
func hasOspecIdentity(skillsRoot string, skillFiles []string) bool {
	for _, file := range skillFiles {
		rel := toPortablePath(relativeTo(skillsRoot, file))
		if strings.HasPrefix(rel, "_shared/") && strings.HasSuffix(file, ".md") {
			return true
		}
		if rel == "skill-registry/SKILL.md" {
			return true
		}
	}
	manifest1 := filepath.Join(skillsRoot, ".ospec-workflow-install.json")
	if info, err := os.Stat(manifest1); err == nil && !info.IsDir() {
		return true
	}
	manifest2 := filepath.Join(filepath.Dir(skillsRoot), ".ospec-workflow-install.json")
	if info, err := os.Stat(manifest2); err == nil && !info.IsDir() {
		return true
	}
	return false
}

// readFingerprintFile loads a file's content once for hashing and skill
// parsing. An unreadable file keeps its fingerprint entry with 0 bytes
// (mirroring the JS implementation) but is skipped as a skill candidate;
// discovery degrades with a warning instead of failing session start.
func readFingerprintFile(abs, relativePath string) (FingerprintPath, bool) {
	fp := FingerprintPath{AbsolutePath: abs, RelativePath: relativePath}
	if data, err := os.ReadFile(abs); err == nil {
		fp.Content = data
		return fp, true
	} else {
		fmt.Fprintf(os.Stderr, "Warning: failed to read skill file %s: %v\n", abs, err)
		fp.Content = []byte{}
		return fp, false
	}
}

// containsSkillFile reports whether the collected files include any SKILL.md.
func containsSkillFile(files []string) bool {
	for _, file := range files {
		if filepath.Base(file) == "SKILL.md" {
			return true
		}
	}
	return false
}

// shouldIncludeSkill mirrors the JS shouldIncludeSkill filter.
func shouldIncludeSkill(relPath string) bool {
	parts := strings.Split(relPath, "/")
	if len(parts) < 2 {
		return false
	}
	if parts[0] != "skills" {
		return false
	}
	if !strings.HasSuffix(relPath, "/SKILL.md") {
		return false
	}
	dir := parts[1]
	if dir == "_shared" || dir == "skill-registry" {
		return false
	}
	if strings.HasPrefix(dir, "sdd-") {
		return false
	}
	// Generated SDD command skills live one level deeper (e.g.
	// skills/commands/sdd-apply/SKILL.md); they are fingerprinted but never
	// injected as utility rules.
	if strings.HasPrefix(parts[len(parts)-2], "sdd-") {
		return false
	}
	return true
}

// ── CalculateFingerprint ──────────────────────────────────────────────────────

// CalculateFingerprint computes a sha256 fingerprint over the sorted set of
// fingerprint paths.  The hash includes each file's relative path and content,
// matching the JS calculateFingerprint implementation.
func CalculateFingerprint(paths []FingerprintPath) (string, error) {
	sorted := make([]FingerprintPath, len(paths))
	copy(sorted, paths)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].RelativePath < sorted[j].RelativePath
	})

	h := sha256.New()
	for _, fp := range sorted {
		data := fp.Content
		if data == nil {
			var err error
			data, err = os.ReadFile(fp.AbsolutePath)
			if err != nil {
				data = []byte{}
			}
		}
		h.Write([]byte(fp.RelativePath))
		h.Write([]byte{0})
		h.Write(data)
		h.Write([]byte{0})
	}
	return fmt.Sprintf("sha256:%x", h.Sum(nil)), nil
}

// ── ReadCache / WriteCache ────────────────────────────────────────────────────

// ReadCache reads and JSON-decodes the cache at path.
// Returns (nil, nil) when the file is absent or contains invalid JSON.
func ReadCache(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("skillreg.ReadCache: %w", err)
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, nil // treat corrupted cache as a miss
	}
	return result, nil
}

// WriteCache atomically writes data as pretty-printed JSON + newline to path.
func WriteCache(path string, data map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("skillreg.WriteCache mkdir: %w", err)
	}
	bs, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("skillreg.WriteCache marshal: %w", err)
	}
	bs = append(bs, '\n')

	tmp, err := os.CreateTemp(filepath.Dir(path), ".cache-*")
	if err != nil {
		return fmt.Errorf("skillreg.WriteCache temp: %w", err)
	}
	tmpPath := tmp.Name()

	_, wErr := tmp.Write(bs)
	cErr := tmp.Close()
	if wErr != nil || cErr != nil {
		_ = os.Remove(tmpPath)
		if wErr != nil {
			return fmt.Errorf("skillreg.WriteCache write: %w", wErr)
		}
		return fmt.Errorf("skillreg.WriteCache close: %w", cErr)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("skillreg.WriteCache rename: %w", err)
	}
	return nil
}

// ── parsing helpers ───────────────────────────────────────────────────────────

// parseFrontmatter extracts the YAML frontmatter attributes and body.
func parseFrontmatter(content string) (attrs map[string]string, body string) {
	attrs = map[string]string{}
	// Single regex pass: capture the YAML block and the body start offset.
	inner := frontmatterRe.FindStringSubmatchIndex(content)
	if inner == nil {
		return attrs, content
	}
	yamlBlock := content[inner[2]:inner[3]]
	for _, line := range strings.Split(yamlBlock, "\n") {
		line = strings.TrimRight(line, "\r")
		sep := strings.IndexByte(line, ':')
		if sep == -1 {
			continue
		}
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') {
			continue
		}
		key := strings.TrimSpace(line[:sep])
		val := strings.TrimSpace(line[sep+1:])
		// Strip surrounding quotes.
		if n := len(val); n >= 2 {
			q := val[0]
			if (q == '"' || q == '\'') && val[n-1] == q {
				val = val[1 : n-1]
			}
		}
		attrs[key] = val
	}
	return attrs, content[inner[1]:]
}

// extractTriggers parses the "Trigger: X, Y" fragment from description.
func extractTriggers(description, fallback string) []string {
	m := triggerRe.FindStringSubmatch(description)
	if m == nil {
		return []string{fallback}
	}
	var triggers []string
	for _, part := range strings.FieldsFunc(m[1], func(r rune) bool { return r == ',' || r == ';' }) {
		part = strings.TrimSpace(part)
		if part != "" {
			triggers = append(triggers, part)
		}
	}
	if len(triggers) == 0 {
		return []string{fallback}
	}
	return triggers
}

// extractCapabilities parses the "capabilities: [cap1, cap2]" metadata from YAML.
func extractCapabilities(raw string) []string {
	str := strings.TrimSpace(raw)
	if strings.HasPrefix(str, "[") {
		str = str[1:]
	}
	if strings.HasSuffix(str, "]") {
		str = str[:len(str)-1]
	}
	var caps []string
	for _, part := range strings.FieldsFunc(str, func(r rune) bool { return r == ',' || r == ';' }) {
		part = strings.TrimSpace(part)
		if part != "" {
			caps = append(caps, part)
		}
	}
	if caps == nil {
		return []string{} // ensure it serializes as [] instead of null
	}
	return caps
}

// extractCompactRules extracts up to 15 rules from a rules/constraints section.
func extractCompactRules(body string) []string {
	lines := strings.Split(body, "\n")
	var rules []string
	seen := map[string]bool{}
	inRulesSection := false

	addRule := func(raw string) {
		r := strings.TrimSpace(bulletRe.ReplaceAllString(raw, ""))
		if r != "" && !seen[r] {
			seen[r] = true
			rules = append(rules, r)
		}
	}

	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if hm := headingRe.FindStringSubmatch(line); hm != nil {
			inRulesSection = rulesSectionRe.MatchString(hm[1])
			continue
		}
		if !inRulesSection {
			continue
		}
		if bulletRe.MatchString(line) {
			addRule(line)
			continue
		}
		if tableRowRe.MatchString(line) && !tableSepRe.MatchString(line) {
			cols := strings.Split(line, "|")
			if len(cols) > 2 {
				cols = cols[1 : len(cols)-1]
			}
			for i, c := range cols {
				cols[i] = strings.TrimSpace(c)
			}
			label := strings.ToLower(cols[0])
			if len(cols) >= 2 && label != "rule" && label != "gate" {
				addRule(cols[0] + ": " + strings.Join(cols[1:], " - "))
			}
		}
	}

	// Fallback: all bullets if no rules section matched.
	if len(rules) == 0 {
		for _, line := range lines {
			if bulletRe.MatchString(line) {
				addRule(line)
			}
			if len(rules) >= 15 {
				break
			}
		}
	}

	if len(rules) > 15 {
		rules = rules[:15]
	}
	if rules == nil {
		return []string{} // JS always yields an array; keep the cache shape identical
	}
	return rules
}

// ── fs helpers ────────────────────────────────────────────────────────────────

// collectFiles recursively walks root and returns files passing include.
// Missing root directory is silently ignored.
func collectFiles(root string, include func(abs string) bool) ([]string, error) {
	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return err
		}
		if !info.IsDir() && include(path) {
			files = append(files, path)
		}
		return nil
	})
	if err != nil && errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	// Sort entries within each directory for determinism (Walk already sorts).
	sort.Strings(files)
	return files, err
}

// relativeTo returns the path of abs relative to base, using os-specific
// separators.
func relativeTo(base, abs string) string {
	rel, err := filepath.Rel(base, abs)
	if err != nil {
		return abs
	}
	return rel
}

// samePath reports whether two cleaned paths identify the same location.
func samePath(a, b string) bool {
	rel, err := filepath.Rel(a, b)
	return err == nil && rel == "."
}

// toPortablePath converts OS path separators to forward slashes.
func toPortablePath(p string) string {
	return filepath.ToSlash(p)
}
