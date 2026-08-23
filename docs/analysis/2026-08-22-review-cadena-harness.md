# Review de cadena del harness — eslabón por eslabón

> **Fecha:** 2026-08-22 · **Versión auditada:** 2.45.10 · **Commit base:** `b6ebcb9`
> **Método:** auditoría read-only con 4 exploradores en paralelo + verificación puntual del orquestador.
> **Alcance:** integridad de dependencias de la cadena completa del harness (manifiesto → assets → runtime → toolchain → estado OpenSpec → gobernanza), y comparación contra [`docs/roadmaps/harness-evolution.md`](../roadmaps/harness-evolution.md).
>
> ⚠️ **Este documento NO es autoridad.** Según la regla de precedencia de `docs/CLAUDE.md`: OpenSpec baseline y código probado > análisis arquitectónico > roadmap > targets > archivados. Este informe es capa 2; todo hallazgo debe verificarse contra código antes de actuar.

---

## 1. Mapa de la cadena analizada

```
[1] .plugin.json ──declara──► agents/ commands/ skills/ rules/ hooks/hooks.json .mcp.json
[2] hooks/hooks.json ──► scripts/hooks/ospec-hooks-launch.js ──► binario Go (cmd/ospec-hooks)
        │                                                        └─► internal/hooks (5 handlers) ──► internal/store, skillreg, rules, modelconfig…
        └─(fallback)──► scripts/hooks/{subcommand}.js (Node)
[3] session-start ──escribe──► .ospec/cache/skill-registry.cache.json ──lee──► orquestador (resolución de skills)
[4] sdd-orchestrator.agent.md ──despacha──► agents/sdd-*.agent.md ──consumen──► skills/_shared/*.md
[5] openspec/config.yaml (routing: 8 rutas) ──► scripts/lib/route-dispatcher.js ──► validate-phase.js (gates)
[6] openspec/changes/{change}/state.yaml + artefactos por fase + baseline openspec/specs/* (56 dominios)
[7] Gobernanza: AGENTS.md, docs/roadmaps/harness-evolution.md, openspec/memory/
[8] Toolchain: npm test → scripts/check.js (171 tests) · CI: validate-harness.yml / build-hooks.yml / publish-marketplace.yml
```

## 2. Veredicto por eslabón

| # | Eslabón | Veredicto | Riesgo principal |
|---|---------|-----------|------------------|
| 1 | Manifiesto → assets | ✅ **INTACTO** | Contradicción doc-vs-disco en meta-comandos |
| 2 | Runtime hooks Go | 🟡 **CONECTADO CON DERIVA BINARIA** | Todos los binarios locales son stale; exe raíz muerto |
| 3 | Cache sesión → skills | ✅ **FRESCO Y COHERENTE** | — |
| 4 | Toolchain Node | 🟡 **SÓLIDO CON PUNTOS CIEGOS CI** | Test normativo que nunca corre; lib muertas |
| 5 | Routing/gates | ✅ **COHERENCIA TOTAL** | Gate dormitorio; clave de contrato drift |
| 6 | Estado OpenSpec | 🟡 **VIVO CON BOOKKEEPING DESALINEADO** | Specs vaporware; baseline config↔manifest discrepan |
| 7 | Gobernanza | 🟡 **COHERENTE CON SALVEDADES** | Estado activo sin trackear en git |
| 8 | Toolchain CI | 🟡 **FUNCIONAL CON HUECOS** | Publish con `--no-validate`; sin `go vet` |

**Veredicto global:** la cadena está conectada extremo a extremo — cada eslabón está sujeto a otro y no existe ningún eslabón flotante de primer orden. Los problemas detectados no rompen la cadena: la **debilitan localmente** (deriva binaria, bookkeeping desalineado, deuda muerta acumulada) y varios **no están contemplados en el roadmap** (sección 5).

---

## 3. Hallazgos por eslabón

### Eslabón 1 — Manifiesto → assets: ✅ INTACTO

**Verificado sano:**
- Lockstep de versión perfecto en las 5 superficies: `.plugin.json`, `.claude-plugin/plugin.json` (byte-idénticos), `package.json`, `openspec/config.yaml` (`project.version`), CHANGELOG → todo en 2.45.10.
- 23 agentes ↔ disco ↔ comandos ↔ `models.yaml` ↔ tabla routing mutuamente consistentes; **cero agentes huérfanos**. Los 23 llevan frontmatter coherente (`# modelo intencionalmente omitido` — routing centralizado por diseño, ADR-20260725-005).
- Tabla de resolución de handlers circunstanciales ("SOLE resolution path"): los 10 archivos referenciados existen bajo `skills/_shared/`.

**Debilidades detectadas:**
1. **Contradicción meta-comandos:** el contrato del orquestador afirma que `/sdd-new`, `/sdd-continue`, `/sdd-foundation`… "won't appear in autocomplete", pero los cuatro meta-comandos existen como `commands/*.prompt.md` (se exponen como slash commands en cualquier host). Además `/sdd-foundation` está enumerado en el orquestador **sin archivo prompt.md**, y `/sdd-reconcile` existe como agente+comando pero **no aparece enumerado**. Los cuerpos delegan correctamente al orquestador (el comportamiento converge), pero el contrato documentado es falso en ambos sentidos.
2. **Directorio huérfano:** `global-instructions/` (AGENTS.md + CLAUDE.md) sin ningún consumidor en scripts/, agentes o configuración.
3. **Claim falso en docs:** `docs/target-capabilities.md:41` acredita al hook PreToolUse el consumo pasivo de `skills/_shared/token-budget.md`; no existe referencia en código.
4. Menores: pins viejos en `.mcp.json` (context7 `@1.0.31`, markitdown alpha), CRLF en `skills/**`.

### Eslabón 2 — Runtime hooks Go: 🟡 CONECTADO CON DERIVA BINARIA

**Verificado sano:**
- Paridad de registro perfecta **5 = 5 = 5**: eventos de `hooks/hooks.json` = `SUBCOMMANDS` del launcher = registro Go vía `init()`+`Register()`. Sin handler faltante ni sobrante.
- Resolución de binario robusta con fallback Node completo (`scripts/hooks/<sub>.js`), bypasses deliberados (codex subagent-stop; hooks federados), emisión no-bloqueante en fallo de spawn.
- Grafo de imports interno limpio: sin ciclos, sin paquetes muertos; los 8 packages alcanzables desde `main`.
- Dependencia inter-handler única y documentada: `stop ← pre-compact` (latest.md incrusta el session-summary).
- `internal/store` cumple la tabla de ownership de artefactos de `openspec/specs/hooks/spec.md` (cache←SessionStart, session-summary←PreCompact, latest.md←Stop).

**Debilidades detectadas:**
1. **Deriva binaria generalizada:** todos los binarios presentes se construyeron entre Jun 14–20; el último cambio en fuentes Go es Jul 25 (`c126cfe1`). Les falta la lógica actual de attestation SHA-256 de phase-costs y host-binding de subagent-stop. Solo la rama `release` lleva binarios frescos a usuarios; los builds locales de `dist/` copian binario stale incluso con mtime fresco (`dist/opencode/...` Aug 17 = bytes idénticos al build de Jun 19).
2. **Artefacto muerto de 4.6 MB:** `ospec-hooks.exe` en la raíz del repo no pertenece a ninguna cadena de resolución (no es candidato del launcher, no es destino de instalación, nadie lo referencia).
3. **Doble definición de "cambio activo":** `pretooluse.FindActiveChangeName` (substring literal `"status: active"`) vs `store.FindActiveChanges` (exclusión de estados terminales + orden mtime). Pueden divergir sobre qué change recibe `token-events.jsonl` vs `phase-costs.jsonl`.
4. **Canal telemetría write-only:** `.ospec/runtime/subagent-events.jsonl` es escrito por subagent-stop pero **ningún código lo lee**. El spec `token-budget-advisor/spec.md:42` además manda leer ese archivo para tokens acumulados, mientras ambas implementaciones usan `.ospec/session/{change}/token-events.jsonl` → **spec vs implementación divergentes**.
5. **Go carga CERO schemas:** `schemas/kernel/` (37 familias, manifest.json) no tiene wiring alguno en `internal/`/`cmd/`; todo el consumo es JS (`scripts/lib/kernel-schema-validator.js`, lifecycle-kernel). La autoridad de contratos kernel vive íntegramente fuera del runtime Go — coherente con specs (capas disjuntas), pero relevante para K11a si se espera enforcement nativo.
6. Residuos de trabajo en `.ospec/`: receipt de transacción fallida (`evil-change/`), diffs temporales `tmp-k3-4r-*`, cinco scripts helper sueltos.

### Eslabón 3 — Cache sesión → resolución de skills: ✅ FRESCO Y COHERENTE

- Cache generado 2026-08-20 > último cambio en `skills/` (2026-08-14): fresca, no stale.
- 60 entradas ⊆ 78 directorios SKILL.md; los 18 excluidos son exactamente `_shared`, `skill-registry` y los 16 `sdd-*` — exclusión **por diseño** (`shouldIncludeSkill`). Ningún id extraño. Estructura version 2 con fingerprint sha256 correcta.

### Eslabón 4 — Toolchain Node: 🟡 SÓLIDO CON PUNTOS CIEGOS CI

**Verificado sano:**
- `check.js` ejecuta 171 tests + 7 generate+validate; matriz de targets completa (7 targets × cli/installer/validator/golden fixtures), sin target ni installer huérfano.
- Contract tests con blast radius real sobre archivos vivos: `commands-agents-contract` valida roster+rutas contra `commands/` real; `assumption-ledger-contract` escanea 5 archivos normativos y regenera 2 targets verificando supervivencia del protocolo; `selective-4r-parity` genera 6 dists y aplica 29 mutaciones dirigidas.

**Debilidades detectadas:**
1. **Test normativo que nunca corre:** `tests/integration/installation-convergence.test.js` está citado normativamente en `openspec/specs/install/spec.md` pero ningún workflow lo ejecuta (fuera del glob `scripts/**` de check.js). Igual: `test/e2e/` es un forwarder redundante con import sin uso.
2. **Lib muertas o test-only:** `filesystem-store.js`, `next-transition.js`, `verify-evidence-classification.js`, `kernel-aliases.js` (cero consumidores); `authority-canon.js` (**nombrada por spec** `harness-authority-canon` pero sin consumidores); `bridges.js`, `transition-parity.js`, `execution-graph/index.js`, `lifecycle-model.js` solo-tests.
3. **Runtime root sin ruta de invocación documentada:** `strict-tdd-evidence-remediation.js` se embarca en cada dist generado, pero ningún agente/skill/hook nombra su invocación — el contrato existe solo por el fence `json:strict-tdd-evidence` en prosa de skills.
4. **Clasificación duplicada:** `route-dispatcher.classifyChange` convive con `change-classification.classifyChange` (consumida solo por un checker K1) sin reutilización — análogo a la regla 3 del roadmap ("no dos kernels equivalentes") aplicada a primitives.
5. `package.json` mezcla `npm run` interno (p.ej. `reload:vscode`) frente a política pnpm del usuario.

### Eslabón 5 — Routing/gates: ✅ COHERENCIA TOTAL (mejor eslabón)

- Las 8 rutas de `config.yaml` usan solo fases ∈ `KNOWN_PHASES` (11) y gates ∈ `KNOWN_GATES` (5): **0 mismatches** fase↔agente↔validador. `validate-phase.js` es config-driven (sin listas hardcodeadas que derivar).
- Todos los 11 phases tienen su `agents/sdd-<fase>.agent.md`; los 6 agentes extra están fuera del vocabulario de rutas por diseño (orchestrator, clarify-gate, init, onboard, reconcile, document).

**Debilidades detectadas:**
1. **Gate dormitorio:** `review-workload` es gate conocido del dispatcher pero **ninguna ruta lo declara** — el guard de workload vive solo en prosa del orquestador, no en la tabla declarativa. Inconsistencia leve entre contrato declarativo y comportamiento real.
2. **Drift de clave de contrato (verificado por el orquestador):** el contrato de forwarding Strict TDD manda leer `strict_tdd: true` de `config.yaml`; el archivo real declara `tdd_mode: focused` + `rules.apply.tdd: true`. Existe degradación elegante (fallback a detección por archivos de proyecto), así que la cadena funciona — pero la clave documentada **no existe**, exactamente el tipo de deriva que la regla 19 del roadmap exige reconciliar conceptualmente antes de seguir.

### Eslabón 6 — Estado OpenSpec: 🟡 VIVO CON BOOKKEEPING DESALINEADO

**Verificado sano:**
- Capa de routing ↔ dispatcher ↔ agentes ↔ validador: plenamente coherente (ver eslabón 5).
- Cache de skills fresco y coherente (eslabón 3).
- `k5-reconciliation` está **vivo, no estancado**: creado hoy, ruta `bugfix` (la primera en ejecutar el 4R gate que los 4 changes K5 previos no ejecutaron), explore+tasks completados, siguiente fase `sdd-apply`. Avanzó durante esta misma auditoría (estado cambió `exploring-done → tasks-done` entre dos lecturas — sesión SDD concurrente).
- Profundidad de archive sana: 84 changes archivados, 5 más recientes todos de la familia K5/K4a.

**Debilidades detectadas:**
1. **Vaporware confirmado (specs sin implementación ni consumidor):**
   - `sdd-baseline-federation-contract` — 0 menciones fuera de sí misma.
   - `unified-baseline-gate` — 0 menciones fuera de sí misma.
   - `federated-baseline-orchestration` — solo docs, cero código.
   - `federation-c1-hardening` — una mención doc, cero código.
   De 56 dominios: ~49 implementados, ~6 finos, 2 vaporware + 2 code-orphaned.
2. **Bookkeeping baseline desalineado:** `config.yaml` lista `domains_done: 10`; `_baseline/manifest.md` documenta solo 8 en el Domain Map (`orchestrator-evals` y `contract-lint` ausentes). El protocolo de fingerprints asume manifest fiel.
3. **Bloque `context` de config.yaml factualmente stale:** dice "20 unit/integration test files" cuando hay 171; declara `raw_command: node --test scripts/**` cuando `npm test` resuelve a `node scripts/check.js`. Este bloque alimenta decisiones de sesión.
4. **Spec delta mal ubicada:** `openspec/specs/hooks-runtime/spec.md` es un documento "# Delta for hooks — MODIFIED Requirements" guardado en baseline — estructuralmente pertenece a un change, no a specs/.
5. **Contradicción de escritura en memoria:** `conventions.md` dice "agents ONLY read"; el spec `project-memory` dice "SDD phases append newest-first"; `known-issues.md` es claramente agent-written. Tres fuentes, tres reglas.
6. **Estado de gobernanza sin trackear:** `openspec/changes/k5-reconciliation/` completo (state.yaml, exploration.md, tasks.md) está **untracked en git** — la pieza de cierre del gap histórico del 4R existe solo en disco.

### Eslabones 7–8 — Gobernanza y CI: 🟡 COHERENTES CON SALVEDADES

- `AGENTS.md` post-archive flow se cumplió para v2.45.10 (4 archivos en lockstep), pero la fila K5 del roadmap es la única `done` **sin versión de publicación citada** en su entrada histórica (paso 1 del flujo se saltó en la serie v2.45.7→v2.45.9).
- Bounded review lifecycle declarado no fue aplicado históricamente en 4 changes K5 archivados (sin lineage 4R) — reconocido, y `k5-reconciliation` existe precisamente para cerrarlo retroactivamente.
- CI: `validate-harness.yml` corre los 171 tests en matriz 3-OS; `build-hooks.yml` corre `go test ./...` + cross-compile **pero solo cuando cambian rutas Go** (los binarios pueden quedar stale silenciosamente si el release usa un checkout donde Go no cambió desde hace semanas); `publish-marketplace.yml` construye con **`--no-validate` explícito**; sin `go vet`/`gofmt`; paridad Go↔JS mantenida por espejo manual de casos, no ejecución cruzada.

---

## 4. ¿Todo bien conectado? ¿Tiene sentido?

**Sí, estructuralmente.** Cada eslabón está sujeto a otro: el manifiesto ancla assets; los hooks anclan el launcher que ancla el binario que ancla los handlers que anclan el cache; el orquestador ancla agentes que anclan skills compartidas; la tabla routing ancla fases que anclan agentes y validadores; el estado state.yaml ancla la continuidad entre fases. No hay ciclos, no hay paquetes muertos en Go, no hay agentes huérfanos.

Lo que sí existe es **deuda de coherencia** en tres frentes: (a) lo que se *distribuye* (binarios, dist) va por detrás de lo que se *desarrolla*; (b) lo que se *declara* (specs vaporware, claims de docs, claves de config) va por delante o fuera de lo que *existe*; (c) trabajo muerto acumulado sin dueño (lib consumerless, telemetría sin reader, residuos).

---

## 5. Gaps NO contemplados en el roadmap harness-evolution

Comparado bloque a bloque (K1–K12, lanes, gotchas vigentes):

| # | Gap | Por qué el roadmap no lo cubre |
|---|-----|-------------------------------|
| G1 | **Frescura e integridad de distribución binaria** | Ninguna K-block cubre stamp de versión/freshness-check del binario ospec-hooks ni la ventana stale entre fuente Go y release. K11a expande adapters, no distribución. Hoy un checkout nuevo puede ejecutar un binario de junio contra fuentes de julio sin señal alguna. |
| G2 | **Invariant "active change" unificada en runtime** | P0 invariantes (K1) no contempla la divergencia de las DOS definiciones de cambio activo dentro del mismo binario Go (pretooluse vs store). Es exactamente el tipo de invariante cross-handler que K1 debiera listar. |
| G3 | **Retirada de canales telemetría muertos** | P25/K12 contemplan eventos no autoritativos y escala, pero no registran como deuda un sink write-only (`subagent-events.jsonl`) ni la divergencia spec-token-budget vs implementación. |
| G4 | **Destino de specs vaporware de federación** | La lane R4 existe en el mapa, pero `sdd-baseline-federation-contract`, `unified-baseline-gate`, `federated-baseline-orchestration` y `federation-c1-hardening` no tienen destino explícito en la tabla "iniciativas antiguas → línea nueva" (regla 17: el roadmap registra propuesta y estado — estas no aparecen). La regla "No queda ninguna iniciativa sin destino explícito" se incumple a nivel specs/. |
| G5 | **Integridad del pipeline propio (meta-CI)** | Gates B–F validan el producto; ninguno valida el pipeline: installation-convergence normativo sin runner, publish `--no-validate`, ausencia de `go vet`, path-filtering que permite stale silencioso. |
| G6 | **Reconciliación de claves de contrato config** | Regla 19 exige reconciliación conceptual ante discrepancias; la clave `strict_tdd` documentada en el contrato del orquestador vs `tdd_mode`/`rules.apply.tdd` reales es un caso vigente sin change ni entrada en gotchas. |
| G7 | **Fiabilidad del bookkeeping de baseline** | El protocolo de fingerprints (ADR-20260705-005) asume manifest fiel; hoy config↔manifest discrepan (10 vs 8 dominios). Irónico: `unified-baseline-gate` era el spec de esto y es vaporware. |
| G8 | **Higiene estructural de artefactos de gobernanza** | Delta specs alojadas en baseline (hooks-runtime), residuos en `.ospec/`, directorios huérfanos (`global-instructions/`, `test/e2e`), binario muerto en raíz: ninguna lane cubre limpieza de superficie de gobierno. |

---

## 6. Recomendaciones priorizadas

**P1 — Cerrar brechas activas (riesgo de comportamiento divergente):**
1. Reconstruir binarios (`npm run build:hooks`) y eliminar `ospec-hooks.exe` de la raíz; añadir stamp de versión al binario + chequeo de frescura en el launcher (G1).
2. Unificar detección de cambio activo: `pretooluse.FindActiveChangeName` debe delegar en `store.FindActiveChanges` (G2).
3. Ejecutar `installation-convergence.test.js` en CI (o retirarle carácter normativo en specs/install) y correr `test/e2e` o eliminarlo (G5).

**P2 — Reconciliar contratos declarados:**
4. Decidir y documentar la clave canónica TDD (`strict_tdd` vs `tdd_mode`), actualizar el contrato del orquestador o config.yaml (G6).
5. Alinear `domains_done` (10) ↔ `_baseline/manifest.md` (8) y refrescar el bloque `context` de config.yaml (171 tests) (G7).
6. Mover `hooks-runtime` delta spec fuera de baseline; resolver destino de las 4 specs vaporware (promover a lane R4/K-block o marcar `rejected/superseded`) (G4).

**P3 — Higiene de deuda muerta:**
7. Decidir lector o retirada de `.ospec/runtime/subagent-events.jsonl` + reconciliar spec token-budget-advisor con la implementación real (G3).
8. Eliminar o documentar lib consumerless (`filesystem-store`, `next-transition`, `verify-evidence-classification`, `kernel-aliases`, `authority-canon`) y deduplicar `classifyChange`.
9. Documentar la ruta de invocación de `strict-tdd-evidence-remediation.js` o retirarlo de los runtime roots.
10. Limpiar residuos de `.ospec/`, `git add` de `k5-reconciliation/`, resolver `global-instructions/` (integrarlo o eliminarlo).

**P4 — Documentación:**
11. Corregir claim de `target-capabilities.md:41` (token-budget.md); resolver contradicción meta-comandos (archivos vs "no autocomplete"); añadir `/sdd-reconcile` a la enumeración o documentar su omisión.
12. Añadir versión de publicación a la fila histórica K5 del roadmap.

---

## 7. Anexo — Lo que está especialmente bien conectado

- Paridad 5=5=5 de registro de hooks (json ↔ launcher ↔ registry Go) con fallback Node completo.
- Coherencia total de la tabla de routing declarativa con dispatcher, agentes y validador config-driven.
- Contract tests con blast radius real (roster, ledger, 4R parity con 29 mutaciones × 6 targets).
- Lockstep de versiones en 5 superficies simultáneas.
- Cache de skills con fingerprint sha256, exclusiones por diseño y frescura verificable.
- Archive con 84 changes trazables y familia K5 con remediaciones encadenadas y documentadas.

*Fin del informe. Generado como análisis (capa 2 de precedencia); contrastar contra código/OpenSpec antes de actuar.*
