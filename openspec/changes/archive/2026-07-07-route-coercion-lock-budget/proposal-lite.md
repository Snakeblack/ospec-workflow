# Proposal Lite: Coerción de routing conditions y coherencia de presupuesto lock/hook

## Change Class

small

## Intent

Cerrar dos quick-wins del Bloque 1.3 (Eje I del análisis del harness), ambos de la clase "contrato declarado sin enforcement":

- **I2 — coerción boolean-like en routing conditions**: dejar imposible que `bugfix`/`refactor`/`hotfix` caigan silenciosamente a `standard` por un desajuste de tipos string-vs-boolean, con un test que use la tabla real de `openspec/config.yaml`.
- **I3 — coherencia presupuesto lock vs timeout de hook**: el lock reclama locks huérfanos recién a `staleMs = 10000` (JS) / `10*time.Second` (Go), sobre el presupuesto de hook de 5s; `SessionStart` no declara timeout. Alinear presupuestos con test de coherencia y paridad Go/JS.

## Boundaries

- In scope (I2): documentar la coerción intencional en `matchConditions` y/o warning en `validateRouteTable` ante `"true"`/`"false"` string residual; test de contrato con ctx booleano contra la tabla real de config.yaml.
- In scope (I3): timeout explícito en `SessionStart` (hooks.json + fixtures golden); `staleMs` coherente con el presupuesto de hook; test que cruce hooks.json ↔ constantes de lock; paridad `internal/store/store.go`.
- Out of scope: el lint de contratos unificado (1.4); rediseñar el modelo de conditions o el mecanismo de lock; nuevos routes o gates.

## Discrepancias análisis vs. código actual

- **I2 ya mitigado parcialmente**: el parser `applySubfieldLine` (route-dispatcher.js:401-405) YA coacciona `"true"`/`"false"` a boolean vía `coerceBoolean` (fix W2, posterior al análisis v2.9.1). Config parseado NO llega a `matchConditions` con strings. El gap real remanente: (a) `matchConditions` usa igualdad estricta sin coerción, así que una tabla construida sin pasar por el parser sí puede fallar; (b) no hay test que fije el comportamiento end-to-end contra el config.yaml real; (c) `validateRouteTable` no advierte sobre string residual; (d) config.yaml aún escribe `"true"` entrecomillado (cosmético/engañoso).
- **I3 matiz**: el retry es 100×15ms ≈ 1.5s y luego procede best-effort SIN lock (no "muere por timeout"). Un lock huérfano de edad 1.5s–10s nunca se reclama dentro de la ventana de retry → la escritura ocurre sin lock (interleave/corrupción), no pérdida total. La incoherencia de presupuestos es real; el framing de "pérdida silenciosa garantizada" es más matizado.

## Affected Areas

| Area | Impact | Notes |
|------|--------|-------|
| `scripts/lib/route-dispatcher.js` | Modify | Doc de coerción en `matchConditions` y/o warning en `validateRouteTable` |
| `scripts/lib/route-dispatcher.test.js` | Modify | Test con la tabla real de config.yaml + ctx booleano |
| `openspec/config.yaml` | Modify | Opcional: desentrecomillar `"true"` en conditions (cosmético) |
| `hooks/hooks.json` + fixtures golden | Modify | Timeout explícito en `SessionStart` |
| `scripts/lib/ospec-state.js` | Modify | `staleMs` coherente con presupuesto de hook |
| `internal/store/store.go` | Modify | Paridad de la constante de reclamación |
| test de coherencia hooks.json ↔ lock | New | Cruce de presupuestos declarados |

## Acceptance Checks

- [ ] Un ctx con booleanos derivados matchea `bugfix`/`refactor`/`hotfix` en la tabla real de config.yaml (test rojo→verde).
- [ ] `validateRouteTable` (o doc) cubre el caso string `"true"`/`"false"`.
- [ ] `SessionStart` declara timeout en hooks.json y fixtures golden (paridad de targets).
- [ ] Existe un test que falla si `staleMs`/reclaim excede el presupuesto de hook.
- [ ] Constantes de lock JS y Go quedan coherentes (paridad verificada).
- [ ] `npm test` verde.

## Risks and Rollback

- Risk: Low — cambios acotados y advisory; bajar `staleMs` demasiado podría reclamar locks vivos bajo contención alta (mitigar manteniéndolo ≥ ventana de retry de 1.5s).
- Rollback: revert del commit del change; sin migraciones ni estado persistido afectado.
