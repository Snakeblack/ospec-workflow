# Architecture Decision Record (ADR-004)

## Context
The TUI needs to display and allow instant switching of model presets (`cheap`, `default`, `premium`). In the codebase, presets define policies across all agents, while `models.yaml` holds the single canonical policy truth.

## Decision
Define `Preset` profiles mapping canonical agent roles to tiers. When `ApplyPreset(name)` is called, `ModelsManager` updates all agents in `models.yaml` according to the preset definition, while preserving custom target definitions in `tiers`. `GetActivePreset()` compares the current agent table against preset profiles to identify whether the system is in `cheap`, `default`, `premium`, or a customized state (`custom`).

## Consequences
- Fast and predictable preset switching.
- Transparent reporting in TUI header badges.
- Keeps `models.yaml` as the single canonical source of truth.
