# ospec-workflow en 10 minutos — para el tech lead que evalúa

**La pregunta que respondes aquí: ¿qué me garantiza esto?**

## Qué es

Un harness de spec-driven development (SDD) multi-target (Claude Code, VS Code,
Copilot CLI, opencode): la IA actúa como un senior que acompaña — quita
ambigüedades, pregunta decisiones con racional/trade-off/reversibilidad, y
nunca desarrolla "lo que ella considere". Todo el estado vive en `openspec/`
versionado con el repo: sin DB, sin servicios, sin build.

## Garantías verificables

| Garantía | Mecanismo | Dónde auditarlo |
|---|---|---|
| Ningún gate se auto-aprueba | approval ledger: solo `AskUserQuestion` o entrada persistida | `state.yaml` → `approvals:` |
| Toda suposición queda trazada | assumption ledger + regla de materialidad | `state.yaml` → `assumptions:` |
| Requirement → task → commit → test | REQ ids + trailers + Traceability Matrix | `verify-report.md` |
| Código revisado en 4 ejes | gate 4R (risk/readability/reliability/resilience) | `state.yaml` → `gates:` |
| Test-first demostrable | Strict TDD con tabla de evidencia por task | `apply-progress.md` |
| Nada se decide dos veces distinto | baseline specs + detección de drift | `openspec/specs/**` + aviso pre-commit |
| Colisiones multi-equipo detectadas antes de codear | gate de colisión entre changes activos | `state.yaml` → `collisions:` |

## Qué NO hace

- No auto-aprueba nada, ni en CI (degrada a halt + reporte).
- No mueve estado fuera de git.
- No garantiza lo mismo en todos los hosts: ver `docs/target-capabilities.md`
  (las protecciones de lifecycle hooks son plenas solo en Claude Code; los git
  hooks cubren todos los targets).

## Cómo evaluarlo en tu repo (30 min)

1. `/sdd-init` — detecta stack y pregunta la escala (`solo`/`team`/`enterprise`).
2. `/sdd-lite <algo trivial>` — mira el ciclo mínimo y sus artefactos.
3. Abre `openspec/changes/archive/` de este mismo repo: cada feature del harness
   se construyó con el harness; ese es el argumento de auditoría real.
