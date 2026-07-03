# ospec-workflow en 10 minutos — para el dev que llega a un repo con ospec

**La pregunta que respondés acá: ¿qué comandos me importan?**

## Los 4 que vas a usar todos los días

| Comando | Cuándo |
|---|---|
| `/sdd-new <cambio>` | Feature o cambio con entidad: ciclo completo con specs |
| `/sdd-lite <cambio>` | Fix chico o trivial: ciclo reducido sin specs/design |
| `/sdd-continue` | Retomar donde quedó (nueva sesión, post-compact, otro día) |
| `/sdd-verify` | Validar la implementación contra specs antes de PR |

También en lenguaje natural: "haceme un SDD para X" dispara lo mismo.

## Lo que el flujo te va a pedir (y por qué)

- **Preguntas de gate**: cerradas, con una opción recomendada que explica el
  racional, el trade-off y si es reversible. No las respondas en piloto
  automático: son las decisiones que después quedan en el approval ledger.
- **Modo de ejecución** (una vez por sesión): `interactive` (pausa entre fases)
  o `auto` (corre de punta a punta).
- **TDD estricto**: si el repo lo tiene activo, el código de producción no
  existe antes que su test en rojo. La evidencia queda en `apply-progress.md`.

## Reglas de commit que te van a rebotar

- Nada de atribución AI (`Co-Authored-By: Claude...`, 🤖, etc.) — el hook
  `commit-msg` lo rechaza.
- Con un change activo, añadí los trailers `Ospec-Change: {nombre}` y
  `Ospec-Task: N.N` (advisory por defecto; el flujo de apply los pone solo).

## Dónde mirar cuando algo no cierra

| Qué buscás | Dónde |
|---|---|
| En qué fase está el change | `openspec/changes/{nombre}/state.yaml` |
| Qué se decidió y por qué | `state.yaml` → `approvals`/`assumptions` + `docs/adr/` |
| El contrato de comportamiento | `openspec/changes/{nombre}/specs/**/spec.md` |
| Qué falta implementar | `openspec/changes/{nombre}/tasks.md` |
| Historia de changes cerrados | `openspec/changes/archive/` |
