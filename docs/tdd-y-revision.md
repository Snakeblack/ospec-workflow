# Strict TDD y revision

Este workflow protege dos cosas que se rompen enseguida con IA: calidad de tests y carga de review.

La IA puede escribir mucho codigo rapido. Precisamente por eso necesita frenos. No por miedo, sino porque queremos que el resultado se pueda verificar, revisar y mantener.

## Strict TDD

El modo activo decide qué declaración manda. Si existe `idd/config.yaml` y su `mode` no es `sdd`, el modo es **IDD**; en otro caso, **SDD**. Cada modo lee solo su propia declaración.

- **IDD**: `strict_tdd` de `idd/config.yaml` (`scripts/lib/idd-config.js:121`). Si la clave está declarada, manda su valor. Si no, decide el perfil de equipo `team:` del mismo fichero (`scripts/lib/team-profile.js`): `solo` → false; `small` y `multi-team` → true; `experience: junior` → true. Sin `team:` y sin la clave, es false. Con Strict TDD activo, cada cambio cuya intención no sea `docs` ni `refactor` (`scripts/lib/idd-signals.js:92,268`) recibe la obligación `tdd-red-green`: un test que falla antes del código y pasa después, registrado con `ospec run --obligation tdd-red-green` (`scripts/lib/idd-next.js:43-44`).
- **SDD** (`mode: sdd`, o sin `idd/config.yaml`): `testing.tdd_mode` de `openspec/config.yaml` (`standard`, `focused` o `strict`, resuelto con `resolveTddMode`). `sdd-init` lo escribe desde el perfil `team:` (`solo` → `standard`, `small` → `focused`, `multi-team` → `strict`, `junior` → `strict`) o, con la clave antigua `scale:`, desde la escala (`solo` → `standard`, `team` → `focused`, `enterprise` → `strict`). Solo `strict` activa el ciclo de abajo; `focused` se pasa a `sdd-apply` como TDD focalizado (`agents/sdd-orchestrator.agent.md:414`). Un test runner no activa el modo: si no se pueden ejecutar comandos, la tarea queda como `STATIC_VALIDATED` o `DEFERRED` (`rules/sdd-strict-tdd.instructions.md`).

En modo SDD, con `strict` activo, `sdd-apply` debe seguir este ciclo por tarea:

```text
SAFETY NET -> RED -> GREEN -> TRIANGULATE -> REFACTOR
```

| Paso | Que exige |
| --- | --- |
| Safety Net | Ejecutar tests existentes relevantes antes de tocar codigo existente. |
| RED | Escribir primero un test que falle o que apunte a codigo aun inexistente. |
| GREEN | Implementar lo minimo para que el test pase y ejecutar el test. |
| TRIANGULATE | Anadir casos distintos para forzar logica real, no hardcode. |
| REFACTOR | Mejorar el codigo manteniendo tests verdes. |

TDD no es "hacer tests". TDD es disenar desde comportamiento. Si escribes el codigo primero y luego un test que lo acompana, eso puede ser testing, pero no es TDD.

### Guardas locales en Git (Pre-commit Hook)

Para asegurar que las reglas del ciclo Strict TDD no se pasen por alto, el arnés incluye un hook de pre-commit (`scripts/hooks/pre-commit-hook.js`) que actúa como validador local de Git:
- **Control de Strict TDD**: El hook usa una sola fuente, la del modo activo (`scripts/lib/precommit-strict.js`): en IDD, `strict_tdd` de `idd/config.yaml` (con el default del perfil `team:`); en SDD, o sin `idd/config.yaml`, `testing.tdd_mode: strict` de `openspec/config.yaml`. Con Strict TDD activo, si hay archivos de producción preparados (`.go` o `.js` bajo `internal/`, `cmd/`, `scripts/hooks/` o `scripts/lib/`), exige que el commit incluya también al menos un archivo de test (`*_test.go` o `*.test.js`, de cualquier ruta, no necesariamente el correspondiente) o un `tasks.md`, de cualquier ruta (`scripts/hooks/pre-commit-hook.js:232-259`). Es una comprobación de ficheros preparados: no ejecuta tests ni verifica el orden RED → GREEN. La obligación `tdd-red-green` de IDD se comprueba aparte, con `ospec run`. Si `idd/config.yaml` no se puede parsear, el hook no exige tests (`scripts/lib/precommit-strict.js:31-32`).
- **Validación del workspace**: Ejecuta `scripts/check.js --staged` (solo lo preparado) por defecto; con `OSPEC_PRECOMMIT_FULL=true` ejecuta `scripts/check.js` completo. Si falla, el commit se rechaza antes de la comprobación de Strict TDD.
- **Diagnóstico**: `ospec doctor` (check `strict-tdd-hook`, `scripts/lib/ospec-doctor.js:488-510`) avisa cuando el hook está instalado y la otra fuente también existe y dice lo contrario. No cambia el comportamiento del hook. Sin hook instalado, solo informa de que la guarda estaría activa.
- **Instalación y bypass**: Instala el hook con `npm run setup:git-hooks`. `DISABLE_OSPEC_PRECOMMIT=true` omite todo el hook, incluida la guarda de Strict TDD (`pre-commit-hook.js:29-33`); `DISABLE_AGENT_SHIELD=true` solo omite el escaneo de secretos; `git commit --no-verify` omite el hook entero.

## Evidencia obligatoria (SDD)

En modo SDD con Strict TDD, `sdd-apply` debe guardar la tabla `TDD Cycle Evidence` en `apply-progress.md` (IDD registra su evidencia con `ospec run`):

```markdown
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
```

`sdd-verify` despues comprueba esa evidencia contra archivos y ejecuciones reales. Si falta o no se puede probar, es CRITICAL.

En paralelo, `tasks.md` refleja el estado real del trabajo:

- `[ ]` no empezado
- `[~]` implementado pero con verificacion local pendiente
- `[x]` implementado y verificado localmente

`apply-progress.md` ya no se trata como snapshot descartable. `sdd-apply` debe leer el progreso previo y hacer merge append-first para no perder evidencia historica.

## Niveles de evidencia en verify (SDD)

`sdd-verify` clasifica cada escenario con la evidencia mas fuerte que puede probar:

| Nivel | Que demuestra |
| --- | --- |
| `runtime-test` | Un test automatizado se ejecuto y paso. |
| `static-proof` | Build, typecheck, schema validation o equivalente prueba el comportamiento. |
| `inspection-proof` | La inspeccion del codigo vincula el escenario con rutas concretas y una justificacion tecnica. |
| `manual-proof` | Hubo verificacion manual registrada. |
| `no-proof` | No hay evidencia creible. |

Regla dura:

- Un MUST necesita `runtime-test` o un `static-proof` aceptado.
- Un SHOULD puede pasar con `inspection-proof`, pero deja WARNING.
- Un MAY puede vivir con evidencia mas debil si la limitacion queda documentada.
- `no-proof` es CRITICAL para MUST y WARNING para SHOULD/MAY.

## Veredictos y routing (SDD)

El cierre de verify es uno de estos:

| Veredicto | Uso |
| --- | --- |
| `PASS` | No hay hallazgos que bloqueen y la evidencia cumple el nivel exigido. |
| `PASS WITH WARNINGS` | El cambio es aceptable, pero quedan riesgos o pruebas mas debiles de lo ideal. |
| `FAIL` | Hay CRITICAL, tareas core incompletas o falta evidencia obligatoria. |

Cada CRITICAL o WARNING debe salir con pista de origen: `code-bug`, `tasks-gap`, `design-gap` o `spec-gap`. Eso evita el antipatron de "arreglar cualquier cosa" sin tocar la fuente real del problema.

`sdd-archive` solo puede cerrar cambios con `PASS` o con `PASS WITH WARNINGS` cuando esos riesgos quedan aceptados o convertidos en follow-up. `FAIL` bloquea archive.

## Calidad de aserciones (SDD)

No todo test cuenta. Un test malo es peor que nada porque da confianza falsa. En IDD, la regla equivalente es «Tests by risk» de `skills/idd/SKILL.md:148`.

Patrones prohibidos:

| Patron | Por que no vale |
| --- | --- |
| `expect(true).toBe(true)` | No ejecuta codigo de produccion. |
| Render sin assert de comportamiento | Solo prueba que no explota. |
| Assert solo de tipo o existencia | No verifica salida concreta. |
| Loop que puede iterar cero veces | La asercion puede no ejecutarse nunca. |
| Assert de clases CSS | Acopla a implementacion visual, no a comportamiento. |

Un test valido llama codigo de produccion, verifica una salida especifica y fallaria si la logica estuviera mal.

## Capas de test (SDD)

La capa se elige por el comportamiento:

| Comportamiento | Capa preferida |
| --- | --- |
| Calculo, transformacion, regla pura | Unit |
| Render, interaccion de componente, estado local | Integration o unit con mocks pequenos |
| Flujo entre componentes, API, provider, router | Integration |
| Journey critico de usuario | E2E si existe; si no, integration |

Si una capa no existe, se degrada a la siguiente disponible. Lo que no se permite es saltarse la prueba.

## Presupuesto de revision (común)

El presupuesto base es:

```text
400 changed lines = additions + deletions
```

No es una ley fisica, es una barrera contra reviews imposibles. Una PR enorme fuerza al reviewer a elegir entre bloquear todo o mirar por encima. Eso no es colaboracion tecnica seria.

El perfil `team:` fija este presupuesto en ambos modos (`scripts/lib/team-profile.js`, `REVIEW_BUDGET_LINES`). En SDD, `sdd-tasks` debe incluir cerca del principio:

```text
Decision needed before apply: Yes|No
Chained PRs recommended: Yes|No
Chain strategy: stacked-to-main|feature-branch-chain|size-exception|pending
400-line budget risk: Low|Medium|High
```

## Estrategias de entrega (SDD)

El valor por defecto sale del perfil `team:` en ambos modos (`single-pr`, `ask-on-risk` o `auto-chain`); las opciones de esta tabla y su tratamiento por el orquestador son de SDD.

| Estrategia | Uso |
| --- | --- |
| `ask-on-risk` | Default seguro: si hay riesgo alto, pregunta antes de aplicar. |
| `auto-chain` | Divide automaticamente en slices revisables. |
| `single-pr` | Obliga a aceptar `size:exception` si se supera presupuesto. |
| `exception-ok` | Continua porque la excepcion ya esta aceptada. |

## Tipos de cadena (SDD)

| Tipo | Como funciona |
| --- | --- |
| `stacked-to-main` | PRs pequenas que entran a `main` en orden. |
| `feature-branch-chain` | Una rama tracker acumula la feature; cada PR hija apunta a la anterior para mantener diff limpio. |
| `size:exception` | Una sola PR grande con aprobacion consciente. |

La decision buena depende del riesgo. Si los slices son independientes, `stacked-to-main` suele ser mas simple. Si necesitas integrar antes de tocar `main`, `feature-branch-chain` da mas control. Si el diff es generado o indivisible, `size:exception` puede ser razonable.
