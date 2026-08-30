# Archive Report: TUI Declarative Persistence Engine (Option B: yaml.v3)

## Summary

The change `2026-08-30-tui-declarative-persistence-engine` implements Milestone 2 of the `ospec` Go TUI roadmap. It delivers the standalone declarative persistence engine in package `internal/config/` for parsing, mutating, applying presets, and saving `models.yaml`, model profiles (`profiles/models/*.yaml`), and `openspec/config.yaml` using `gopkg.in/yaml.v3` with atomic temporary-file-and-rename guarantees.

## Archive Operations

1. **Spec Promotion:**
   - Promoted `specs/tui-declarative-persistence/spec.md` to `openspec/specs/tui-declarative-persistence/spec.md`.
2. **ADR Promotions:**
   - Promoted 4 ADRs into `docs/adr/` (`adr-20260830-005` to `adr-20260830-008`).
3. **Change Artifacts Archived:**
   - Change directory moved to `openspec/changes/archive/2026-08-30-tui-declarative-persistence-engine/`.
