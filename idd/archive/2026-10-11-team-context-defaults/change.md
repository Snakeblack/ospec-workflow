# team-context-defaults

## Intent and acceptance

El perfil de equipo de la foundation sustituye a la escala solo|team|enterprise y decide los defaults de entrega, el umbral de review, Strict TDD y la mentoría

Acceptance: Dos proyectos con perfiles de equipo distintos obtienen del CLI defaults distintos de entrega, review, Strict TDD y mentoría sin que se pregunte de nuevo la escala ni el perfil

## Plan

1. **Perfil y defaults.** `scripts/lib/team-profile.js` (puro) valida el perfil (`size: solo | small | multi-team`, `experience: junior | mixed | senior`, opcional), deriva sus defaults (entrega, review, Strict TDD, mentoría), traduce la `scale:` heredada y resuelve el perfil por el modo activo, como `precommit-strict.js`.
2. **IDD.** `idd/config.yaml` acepta una sección `team:`; `strict_tdd` explícito gana y, si falta, decide el perfil (REQ-idd-013). `ospec next` devuelve `team` con la entrega y la mentoría cuando hay perfil (REQ-idd-023).
3. **CLI.** `ospec team [--mode idd|sdd] [--json]`, de solo lectura, devuelve el perfil, su origen y sus defaults para el modo activo o el pedido (REQ-idd-023).
4. **SDD, foundation y skills.** El init guard deja de preguntar la escala: lee `ospec team` y, sin perfil, pregunta el perfil una vez; `sdd-init` escribe `team:` en `openspec/config.yaml` y materializa sus defaults; la estrategia de entrega y la mentoría salen del perfil sin preguntar. La foundation propone `team:` al entregar la configuración. La skill `idd` usa `team` de `next`. Specs `idd`, `agents` y `skills`; ospec declara su perfil; roadmap.

## Decisions

- **Respuestas del gate open-facts (usuario, «Todas las recomendadas»):**
  - Perfil con dos hechos del equipo, `size` y `experience`; los defaults salen de ellos, no de un preset de proceso.
  - Umbral de review: en SDD decide si el 4R entra en la ruta (`solo` no; `multi-team` además exige trazabilidad `required`). En IDD no cambia: `trust-review` sigue saliendo de `security-boundary` (ADR 0007).
  - Entrega `single-pr | ask-on-risk | auto-chain` con el presupuesto de 400 líneas; Strict TDD `false | true | true`, y `junior` lo activa siempre; mentoría `junior → mentor`, `mixed → balanced`, `senior → expert`.
  - Una clave explícita gana; sin perfil, el comportamiento es el de hoy.
  - `scale:` heredada como respaldo: `solo → solo`, `team → small`, `enterprise → multi-team`.
  - ospec declara `size: solo` y `experience: senior`. Versión minor, un PR.
- **Ajuste por ADR 0011 (usuario, opción a):** el gate proponía un único perfil en `idd/config.yaml` para los dos modos, y 0011 prohíbe que un modo lea o escriba la configuración del otro. Cada modo guarda `team:` en su configuración (`idd/config.yaml` u `openspec/config.yaml`), `ospec team` resuelve por el modo activo como `precommit-strict.js`, y `sdd-init` solo escribe `openspec/config.yaml`. Coste aceptado: un proyecto con los dos modos declara el perfil dos veces.
- **Strict TDD en SDD:** SDD tiene tres modos; el perfil da `standard | focused | strict`, la misma correspondencia que tenía la escala (`solo`, `team`, `enterprise`), y `junior` da `strict`.
- **`ospec team --mode`:** el orquestador y `sdd-init` piden `--mode sdd`, para leer la declaración de SDD aunque el proyecto tenga IDD como modo activo; sin la opción, un proyecto IDD que ejecuta `/sdd-new` habría recibido el perfil de IDD, contra ADR 0011.
- **`ospec next` sin configuración legible:** un `idd/config.yaml` inválido omite `team` en lugar de fallar, porque el siguiente paso de los gates de intención no depende de la configuración; `ospec check` sigue informando el error.
- **K1 scope guard:** `team-profile.js` y su test entran en la lista de sucesores, y el bloque comentado `team:` de `openspec/config.yaml` se normaliza como sucesor del bloque comentado `scale:`, como en E2.3.
- **Presupuesto de la skill `idd`:** las dos frases nuevas (entrega y mentoría de `team`) se compensan quitando la repetición de cómo reanudar tras configurar los checks; queda en 11 909 bytes.
- **Evidencia `ruta:línea` desplazada:** las ediciones de `scripts/ospec.js` e `idd/config.yaml` movieron líneas citadas por el mapa de componentes, el mapa de conocimiento y los ADR 0003 y 0004 (107→111, 701→749, 34→36, 62→64, 64→66, 65→68, 66→69 e `idd/config.yaml` 15→21). Se actualizan los números sin tocar el texto de las decisiones, como en E3.1–E3.3.
- **Impacto propio:** todas las referencias derivadas (ADR 0003, 0004, 0005, 0006, 0009, 0010 y 0011 y tres escenarios) son `conforms`; se registra la evidencia manual de ADR 0003.
- **IDD no lee la `scale:`:** está en `openspec/config.yaml` y REQ-idd-013 prohíbe a IDD leer configuración de `openspec/`. El respaldo solo vale en modo SDD.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: adr-impact-declaration for adr-impact-declaration (2026-10-11T20:56:59.582Z)
- ev-2: check-run for checks-pass (2026-10-11T20:58:04.151Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-11T20:58:04.151Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-11T20:58:04.151Z)
- ev-5: check-run for checks-pass (2026-10-11T20:58:56.883Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-11T20:58:56.883Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-11T20:58:56.883Z)
- ev-8: living-doc-current for living-doc (2026-10-11T20:59:02.366Z)
<!-- ospec:evidence:end -->
