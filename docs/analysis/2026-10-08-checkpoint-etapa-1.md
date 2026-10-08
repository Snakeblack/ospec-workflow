# Checkpoint de cierre de la Etapa 1: `continue`

Fecha: 2026-10-08 · Versión medida: ospec-workflow v2.117.1 (`686491d4`) · Roadmap: [Etapa 1 — IDD como flujo por defecto](../roadmaps/harness-evolution.md#etapa-1--idd-como-flujo-por-defecto).

El roadmap pide, al cerrar cada etapa, un checkpoint `continue | revise` contra la tabla de [objetivos medibles](../roadmaps/harness-evolution.md#objetivos-medibles), con números. La Etapa 1 (E1.1–E1.10) se entregó entre v2.92.0 y v2.117.1. Este informe mide cada fila que la etapa debía mover, da el veredicto y fija los follow-ups. Todo se reproduce desde un checkout limpio en v2.117.1:

```sh
node scripts/measure-context-baseline.js          # always-on, skills y listado por target
node scripts/measure-context-baseline.js --json   # informe completo
node scripts/check.js                             # suite completa
```

El tamaño del protocolo IDD por target se obtiene de la misma build en memoria (`buildTargetFiles` de `scripts/lib/context-baseline.js`, fichero `skills/idd/SKILL.md` de cada target).

## 1. Veredicto: `continue`

Todas las filas de la Etapa 1 cumplen su objetivo. La etapa se cierra y la Etapa 2 empieza por E2.1 `knowledge-map-contract`. Decisión del usuario sobre las cifras de la sección 2.

**Salvedad registrada:** el criterio de E1.6 («una instalación limpia en cada target crea y cierra un cambio con documento vivo sin cargar nada de SDD») se probó en real solo en Claude Code, por decisión del usuario en (d3). En los otros seis targets lo cubren los tests de build: la build por defecto no trae nada `sdd-*`, y el protocolo IDD y el router llegan con sus marcadores sustituidos (lo comprueba también `ospec doctor`). Queda como riesgo conocido, no como bloqueo.

## 2. Objetivos de la etapa

| Métrica | Punto de partida (v2.81.3) | Cierre de la Etapa 1 (v2.117.1) | Objetivo | Resultado |
| --- | --- | --- | --- | --- |
| Contexto del flujo por defecto | Orquestador SDD de 44–63 KB más 60–75 KB por fase | Router 3,1–3,5 KB (*always-on*) más protocolo IDD 5,5 KB = **8,6–9,0 KB**; 12,8–13,2 KB contando el listado de skills (4,2 KB). Orquestador por defecto: 0 KB | Router más protocolo IDD ≤ 16 KB | ✅ |
| Obligaciones comprobadas por código | `validate-phase` en ~10 % de los despachos observados | **7 de 7** obligaciones activas solo se cierran con evidencia que registra el CLI (`ospec check`, `run`, `review`, `close`); `record` no acepta evidencia. La octava, `adr-impact-declaration`, está inactiva hasta E3.1 | 100 %, vía `ospec check` | ✅ |
| Documentos creados en un cambio trivial | Los de la ruta lite | **0**: el fixture `typo` deriva solo `checks-pass`, y el cambio `roadmap-sdd-marketplace-plugin` de este repositorio cerró sin documento ni gate | 0 | ✅ |
| Preguntas antes de empezar un cambio | Hasta 4 por sesión | **1 lote por cambio** (3–7 preguntas) en el gate `open-facts`; en el banco, 6 mensajes con preguntas frente a 13 de SDD y 24 de 25 hechos obtenidos del usuario frente a 11 | Un solo lote, solo en los cuatro gates (objetivo reescrito, ver 2.1) | ✅ |
| Skills instaladas por defecto | 82 | **31**, con el paquete SDD (`--with-sdd`) y 6 extras (`--with-extras`) opcionales | 46 (+6 opcionales); las de fase SDD, en el paquete opcional | ✅ (por debajo) |

Las filas de la Etapa 0 (*always-on*, carga de skills) siguen dentro de su techo: *always-on* de 3,1–3,5 KB frente a ≤ 4 KB, y 100 % de agentes con su skill. Los techos de `scripts/fixtures/context-baseline.json` no cambian con este checkpoint.

### 2.1. La fila de preguntas

El objetivo original era «0, salvo los tres casos de gate». La corrida `idd-1` (v2.109.1) mostró que un IDD que no pregunta deja escapar defectos: 6 escapados, con el agente decidiendo solo las reglas de negocio. El usuario añadió en v2.110.0 el cuarto gate, `open-facts` (REQ-idd-018, REQ-idd-008 con cuatro gates): antes de editar, el agente lista los hechos de comportamiento que ni la petición ni el código fijan y los pregunta todos juntos. Con él, `idd-2` bajó a 0 escapados con el 4,7 % de los tokens de SDD.

Por decisión del usuario, el objetivo pasa a ser **«un solo lote, solo en los cuatro gates»**: lo que se limita es el número de interrupciones, no el de preguntas. Se cumple en el banco (una por escenario) y en este repositorio: de los 9 cambios IDD archivados en la etapa, 8 abrieron un solo lote `open-facts` y 1 cerró sin preguntas; un cambio abrió además el gate de enmienda de ADR, que es uno de los cuatro.

## 3. Evidencia de uso real

Desde E1.6 (d1), cada ítem del roadmap se hizo con IDD en este repositorio. Los 9 cambios de `idd/archive/` en la etapa:

| Cambio | Señales | Gates | Documento vivo |
| --- | --- | --- | --- |
| `idd-default-mode` | always, multi-unit-or-decision | open-facts | sí |
| `sdd-optional-package` | always, multi-unit-or-decision, public-contract | open-facts | sí |
| `idd-default-docs` | always, public-contract | open-facts | no |
| `roadmap-sdd-marketplace-plugin` | always | — | no |
| `sdd-new-intent-argument` | always, bug-fix | open-facts | no |
| `ospec-doctor` | always, multi-unit-or-decision, public-contract | open-facts, adr-amend-or-contradict | sí |
| `ospec-doctor-targets` | always, multi-unit-or-decision, public-contract | open-facts | sí |
| `install-cli-ux` | always, bug-fix, multi-unit-or-decision, public-contract | open-facts | sí |
| `vscode-dry-run` | always, bug-fix, multi-unit-or-decision, public-contract | open-facts | sí |

El documento vivo aparece solo cuando el cambio tiene varias unidades o una decisión. Los tres bugfix registraron su par rojo → verde con `ospec run`.

**Hallazgo de este checkpoint:** al abrirlo, el plan declarado con `ospec signals` incluyó por error los manifiestos de la release, que activan `public-contract`. El CLI no deja quitar una señal registrada ni retirar la obligación que deriva, así que no hay forma de corregir un plan sobredeclarado antes de editar. Con autorización del usuario se borró el cambio, que no tenía ediciones, y se reabrió con el plan correcto. Entra en E1.11.

## 4. Follow-ups que pasan a ítems

Por decisión del usuario, los follow-ups abiertos de la etapa pasan a ser ítems del roadmap, `pending` y en paralelo con la Etapa 2 (no la bloquean):

- **E1.11 `idd-protocol-hygiene`:** el protocolo IDD edita ficheros de texto respetando su codificación (una entrega de `idd-2` dejó un `README.md` en ISO-8859-1); `ospec next` pide declarar el plan (`ospec signals`) antes de editar; y hay una forma explícita de corregir un plan declarado antes de que el diff toque nada (sección 3).
- **E1.12 `session-hook-idd`:** los hooks `Stop` y `PreCompact` buscan el cambio activo solo en `openspec/changes/` (`findActiveChanges`), así que con un cambio IDD abierto `.ospec/session/latest.md` dice «Active change: None» y la sesión siguiente no lo retoma (hallazgo de E1.6 a, verificado en este checkpoint).
- **E1.13 `idd-openspec-asymmetries`:** el pre-commit decide Strict TDD solo con `tdd_mode` de `openspec/config.yaml` y no lee `strict_tdd` de `idd/config.yaml`, y los hooks crean `.ospec/`; hoy `ospec doctor` solo avisa (E1.7 a).
- **E1.14 `codex-repo-runtime`:** `install:codex -- <repo>` no instala runtime ni protocolo IDD; hoy `ospec doctor` solo avisa (E1.6 a, E1.7 b).

Sigue fuera: E5.8 `sdd-marketplace-plugin`, por demanda.
