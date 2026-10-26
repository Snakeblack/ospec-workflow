# config-only-rises

## Intent and acceptance

E1.53: strict_tdd, impact y contracts de idd/config.yaml se contrastan con la base del cambio como checks, y se cierran los residuos de E1.44 (contract-spec-and-test con --base antiguo, classifyPath, readGitDiff con prefijos o -diff, boundary-tests con un comentario o un fixture, subida a feature)

Acceptance: Un impact.exclude nuevo sobre rutas de security_boundary y strict_tdd: false frente a una base con true no dejan cerrar sin la respuesta del usuario; un cambio sin diferencias de configuración cierra igual que hoy; cada residuo se reproduce en un test que falla antes y pasa después

## Plan

1. Configuración. `readBaseConfig` (`idd-workspace.js`) lee el `idd/config.yaml` entero de la base (vacío con base nula, sin fichero o ilegible) y `readProjectContext` devuelve también `contracts`. `ceremonyConfig` (`idd-check.js`) toma `strict_tdd` efectivo, `impact` y `contracts` con sus listas como conjuntos, y `settleChecksChange` abre `checks-changed` cuando difieren los checks o esos ajustes, con una razón que nombra cada lado. Cada entrada guarda la `config` que aprueba; `validateState` (`idd-contract.js`) acepta ese campo opcional y la pregunta del gate (`idd-next.js`) nombra los ajustes. `check` y `close` (`requireDerived`) comparten `readConfigChange` en `ospec.js`.
2. Contrato. `close` (`requireDerived`) rechaza un `contract-spec-and-test` satisfecho cuando el diff contra la base del cambio no toca un documento o un test de contrato, como ya hacía con `boundary-tests`.
3. `classifyPath`. `PRODUCT_EXT` (`idd-signals.js`) suma C y C++, Objective-C, Swift, Scala, Groovy, Dart, Lua, Elixir, Erlang, Clojure, Haskell, OCaml, F#, VB, Perl, R, Zig, Astro, shell, PowerShell y batch. `isDocumentation` deja de contar como documentación un fichero de código bajo un `docs/` anidado; el `docs/` raíz sigue siéndolo.
4. Diff. `readGitDiff` (`idd-workspace.js`) pide `--src-prefix=a/ --dst-prefix=b/ --text --no-textconv`, y descarta las líneas de un binario real (`isBinaryFile`: un byte nulo en los primeros 8000 bytes, sin seguir symlinks).
5. `boundary-tests`. `addedTests` (`idd-signals.js`) solo cuenta un test con extensión de código y una línea añadida que no sea solo comentario (`codePortion`); `untested-product` usa la misma regla.
6. Subida a `feature`. `raiseIntent` (`idd-record.js`) abre siempre `open-facts` al subir a `feature`, y `recordIntent` rechaza con `intent-conflict` otra `--request` cuando la intención ya tenía una.
7. Contrato y docs: REQ-idd-003, 008, 009, 011, 012 y 014 en `openspec/specs/idd/spec.md`; la línea del gate en la skill `idd` y en `references/approvals.md`; los README, `docs/onboarding/tech-lead.md`, `openwiki/` y el roadmap.

## Decisions

- **`checks-changed` aprueba también `strict_tdd`, `impact` y `contracts`** (respuesta del usuario). Siguen seis gates (REQ-idd-008), el catálogo de Go no cambia y los estados guardados siguen valiendo: una entrada sin `config`, anterior a E1.53, aprueba los ajustes de la base.
- **Cualquier diferencia de esos ajustes frente a la base pregunta, también la que solo sube la ceremonia** (respuesta del usuario). La dirección de un cambio en `impact` no se puede decidir, y un ajuste que este diff no nota llegaría sin aprobar a la base del cambio siguiente.
- **`strict_tdd` se compara por su valor efectivo** (respuesta del usuario), así que pasar `team.size` de `small` a `solo` también pregunta. El resto de `team` no cuenta.
- **Las listas de `impact` y `contracts` se comparan como conjuntos.** Reordenar o repetir un patrón no cambia lo que se deriva, así que no pregunta.
- **`close` relee `contract-spec-and-test` contra la base del cambio** (respuesta del usuario), como `boundary-tests` desde E1.44; `check --base` sigue sirviendo para leer el diff contra otra referencia.
- **Una extensión de código gana a un `docs/` anidado, no al `docs/` raíz** (respuesta del usuario). En la raíz viven sitios de documentación con su propio código (aquí, `docs/analysis/probes/*.cjs`).
- **`boundary-tests` no cuenta un comentario ni un fichero sin extensión de código bajo un directorio de test** (respuesta del usuario). Un cambio que solo añade un caso golden deja la obligación pendiente; el hueco que queda, un test trivial pero real, es de la trust review y está escrito en REQ-idd-012.
- **Subir a `feature` abre siempre `open-facts` y conserva `intent.request`** (respuesta del usuario). Solo una intención sin petición puede fijarla al subir, porque las citas `--quote` salen de ella.
- **El diff descarta un binario real por su contenido, no por sus atributos.** Con `--text` git lee un binario como texto, y un hunk puede no traer el byte nulo; se mira el fichero en disco como hace git (8000 bytes), sin seguir un symlink, igual que `readUntracked` ya descartaba un binario sin versionar.
- **Un solo cambio con seis unidades** (respuesta del usuario).
- Prior decision (memory): El resto de `idd/config.yaml` queda para E1.53 `config-only-rises`, justo detrás de E1.44 -> idd/archive/2026-10-26-ceremony-only-rises/change.md: current

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-26T12:44:06.709Z)
- ev-2: check-run for checks-pass (2026-10-26T12:50:05.214Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-26T12:50:05.214Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-26T12:50:05.214Z)
- ev-5: migration-test for migration-compat-and-test (2026-10-26T12:50:28.466Z)
- ev-6: living-doc-current for living-doc (2026-10-26T12:50:57.320Z)
<!-- ospec:evidence:end -->
