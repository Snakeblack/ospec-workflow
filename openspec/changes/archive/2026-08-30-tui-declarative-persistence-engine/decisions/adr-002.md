# Architecture Decision Record (ADR-002)

## Context
Target definitions in `models.yaml` vary in structure across clients:
- `vscode` can be an array of strings (e.g. `["GPT-5.6 Sol (copilot)"]`) or a string.
- `codex` is a map with `model`, `model_reasoning_effort`, and `model_verbosity`.
- `claude`, `opencode`, and `cursor` are scalar strings.
- Future targets may have additional arbitrary parameters.

## Decision
Define `TierTargetConfig` and custom YAML unmarshal/marshal methods using `yaml.Node` to handle polymorphic formats losslessly, storing concrete structs for known complex targets (`CodexTierConfig`) and flexible string/slice/map handlers for other targets.

## Consequences
- 100% round-trip fidelity when reading and writing `models.yaml`.
- Unknown target keys and custom options are not dropped during serialization.
