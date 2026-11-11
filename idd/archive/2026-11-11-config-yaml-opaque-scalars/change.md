# config-yaml-opaque-scalars

## Intent and acceptance

Los lectores línea a línea de openspec/config.yaml e idd/config.yaml leen claves dentro de un escalar de bloque o multilínea, extractConfigDefaults hace backtracking exponencial y readFlowScalar es cuadrático

Acceptance: Ningún lector de config.yaml lee una clave dentro de las líneas de continuación de un valor: un backend: workspace-federated dentro de notes: | bajo artifact_store no cambia el backend (Node ni lanzador), un scope dentro de un justification: | no cambia el override de atribución, un name: cmd dentro de un bloque de checks no se ejecuta como check, una línea de bloque no corta una capacidad ni añade fases, dominios o claves de team; extractConfigDefaults y readFlowScalar terminan en tiempo lineal (una sección project: de 30 líneas sin status y 80.000 espacios en un mapa flow tardan mucho menos de un segundo); y Go ReadBaselineState lee igual que Node

## Plan

<!-- ospec:plan:start -->
- Files: `internal/store/store.go`, `internal/store/store_test.go`, `internal/yamllite/yamllite_test.go`, `openspec/specs/idd/spec.md`, `openspec/specs/lifecycle-kernel-runtime/spec.md`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/ospec-hooks-launch.test.js`, `scripts/lib/capability-registry.js`, `scripts/lib/capability-registry.test.js`, `scripts/lib/idd-config.js`, `scripts/lib/idd-config.test.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/lib/ospec-state.js`, `scripts/lib/ospec-state.test.js`, `scripts/lib/route-dispatcher.js`, `scripts/lib/route-dispatcher.test.js`, `scripts/lib/team-profile.js`, `scripts/lib/team-profile.test.js`, `scripts/lib/yaml-lite.js`, `scripts/lib/yaml-lite.test.js`, `scripts/route-dispatch-run.js`, `scripts/route-dispatch-run.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Cada lector línea a línea de openspec/config.yaml recibe las líneas de opaqueScalarLines (el escáner de REQ-lifecycle-kernel-033), así que no cambia su lógica: todos ya saltan las líneas vacías
- Un valor del override de atribución que sigue en más líneas (escalar de bloque, entrecomillado o flow multilínea, o valor en la línea siguiente) deja el override inválido y el error nombra el campo (decisión 1A del usuario)
- idd/config.yaml rechaza con config-invalid, nombrando la línea, un escalar de bloque y un valor que sigue en más líneas (decisión 2A del usuario)
- extractConfigDefaults lee project.status, baseline.status y artifact_store.backend con readYamlScalar: solo el hijo directo de la sección de primer nivel (decisión 3A del usuario); el backtracking exponencial desaparece con la regex
- Con un openspec/config.yaml malformado los lectores leen como hoy las líneas que siguen al error (decisión 4A del usuario)
- countDeclaredChecks (Node y Go) no cambia: solo se usa si cuenta más de cero, y la línea de la clave de un bloque bajo checks ya cuenta, así que un bloque no cambia esa respuesta
- El lanzador de hooks usa opaqueScalarLines de yaml-lite.js en su lector del backend, sin cargar ospec-state.js en la ruta caliente de cada hook
- El contrato de los lectores de openspec/config.yaml va en REQ-lifecycle-kernel-034, junto al 033, porque comparten el escáner; el de idd/config.yaml amplía REQ-idd-013
- readFlowScalar casa la clave sin solapar el espacio previo a los dos puntos, como ENTRY_LINE, así que es lineal
- readBackendMode y el lector del backend del lanzador leen artifact_store.backend con readYamlScalar, solo el hijo directo como extractConfigDefaults tras 3A, en vez de recorrer las líneas opacas: un backend más anidado deja de contar y los tres lectores del backend coinciden
- Los patrones \s+#.*$ de los lectores tocados pasan a (?<!\s)\s+#.*$, que quita el mismo comentario y solo empieza a casar al principio de un tramo de espacios, y el \s+$ de readYamlScalar pasa a trimEnd(): con 40.000 espacios en un valor tardaban de 1 a 3 s y crecían al cuadrado
- Aviso de la revisión de confianza: con un CR suelto o un U+2028 tras un tramo de espacios, el (.*)$ final no llega al final de la línea en Node y el motor reintentaba cada reparto del tramo; la última captura de los patrones de yaml-lite y de los lectores de config pasa a [^\n], igual que . en Go, así que Node lee esa línea como Go y en tiempo lineal
- El lector de team de openspec/config.yaml lee cada entrada en dos pasos lineales (clave y resto, y después el valor sobre el resto recortado), porque su patrón con un tramo de espacios a cada lado de un valor opcional era cuadrático también sin CR
- Los lectores de state.yaml de REQ-lifecycle-kernel-033 (readStatus, extractStateRouteInfo, la ruta persistida, archive-transaction y los hooks) tienen el mismo patrón con CR; quedan fuera de este cambio, que solo toca los de config.yaml y el escáner, y se proponen al usuario como cambio aparte
- Segunda revisión de confianza: el quitador de comentarios (?<!\s)\s+#.*$ era cuadrático con pares ' #' seguidos de un CR suelto o un U+2028, porque cada ' #' pasa el lookbehind y el punto no llega al final; pasa a (?<!\s)\s+#[^\n]*$ en los siete sitios, y un fuzzer de 29 unidades repetidas por 13 colas sobre los 11 lectores no encuentra ningún caso superlineal con 100.000 caracteres
- Tercera revisión de confianza: BLOCK_SCALAR_HEADER terminaba en #.* y la clave entrecomillada de ENTRY_LINE en \\.; en Node el punto no casa CR, U+2028 ni U+2029, así que una cabecera | # c<U+2028>x o una clave "a\<CR>b" eran bloque en Go y no en Node, y el contenido del bloque se leía como claves (un check lint en idd/config.yaml); los dos pasan a [^\n], igual que el punto de Go, con un test gemelo Node/Go
- Decisión del usuario (2A): los lectores de state.yaml con el mismo patrón cuadrático ante un CR (readStatus, extractStateRouteInfo, la ruta persistida, archive-transaction, pre-compact y pre-tool-use) van en una PR propia justo detrás de esta, antes de PR4c
- Decisión del usuario (3A): parseIddConfig exige que las entradas de una sección vayan a la sangría de la primera; una entrada con otra sangría (una clave más sangrada tras un escalar simple, YAML inválido) es una línea ilegible con config-invalid, y los elementos - de una lista siguen admitiéndose a cualquier sangría, también a la de su clave
- Cuarta revisión de confianza (aviso no bloqueante): el escáner decide si una línea está en blanco con trim() en Node y strings.TrimSpace en Go, que discrepan en U+0085 (solo Go lo quita) y U+FEFF (solo Node); decisión del usuario (A): va en la PR siguiente de los lectores de state.yaml, donde los dos escáneres recortarán solo espacio y tabulador, los blancos de YAML 1.2, con un test diferencial Node/Go
<!-- ospec:decisions:end -->

### Notas

- Dos decisiones quedaron sustituidas por otras posteriores de la lista: el lector del backend del lanzador usa `readYamlScalar`, no `opaqueScalarLines`, y el quitador de comentarios quedó en `(?<!\s)\s+#[^\n]*$`, no en `(?<!\s)\s+#.*$`.
- `scripts/lib/k1-scope-guard.test.js` añade `capability-registry.js` y su test a los módulos sucesores K2, como cada cambio que toca un fichero de `scripts/lib/` fuera del inventario K1.
- Hubo cuatro revisiones de confianza. El usuario autorizó la cuarta con el gate `review-limit`. Cada una dejó un aviso no bloqueante: las tres primeras se arreglaron aquí y la cuarta va en la PR siguiente.

### Fuera de alcance

- Los lectores de `state.yaml` de REQ-lifecycle-kernel-033 tienen el mismo patrón cuadrático ante un CR suelto, U+2028 o U+2029 tras un tramo de espacios: `readStatus`, `extractStateRouteInfo`, la ruta persistida, `archive-transaction.js` y los hooks `pre-compact` y `pre-tool-use`. Medido: unos 100.000 caracteres tardan varios segundos. Por decisión del usuario (2A), van en una PR propia justo detrás de esta, antes de PR4c.
- En esa misma PR, por decisión del usuario (A), va la paridad de espacios del escáner. Node decide si una línea está en blanco con `trim()` y Go con `strings.TrimSpace`, y discrepan en U+0085, que solo quita Go, y en U+FEFF, que solo quita Node. Con `a: |`, una línea de solo U+0085 y `  evil: y`, Go deja la clave en blanco y Node la lee; con U+FEFF pasa al revés. Arreglo previsto: los dos escáneres recortan solo espacio y tabulador, los blancos de YAML 1.2, y un test diferencial pasa el mismo corpus por Node y por Go.
- `countDeclaredChecks` (Node y Go) no cambia, por la razón que da su decisión.
- El parser inline de `parseRoutingTable` en `scripts/evals/safe-export.js` es código de las evals, que van después del arnés.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-10T23:50:34.981Z)
- ev-2: check-run for checks-pass (2026-11-10T23:55:30.257Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-10T23:55:30.257Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-10T23:56:25.571Z)
- ev-5: check-run for checks-pass (2026-11-10T23:58:31.779Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-11-10T23:58:31.779Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-10T23:58:31.779Z)
- ev-8: frozen-review for trust-review (2026-11-11T00:05:45.539Z, subagent-stop)
- ev-9: check-run for checks-pass (2026-11-11T00:10:22.576Z)
- ev-10: contract-spec-and-test for contract-spec-and-test (2026-11-11T00:10:22.576Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-11-11T00:10:22.576Z)
- ev-12: migration-test for migration-compat-and-test (2026-11-11T00:10:46.360Z)
- ev-13: frozen-review for trust-review (2026-11-11T00:16:01.438Z, subagent-stop)
- ev-14: check-run for checks-pass (2026-11-11T00:19:19.646Z)
- ev-15: contract-spec-and-test for contract-spec-and-test (2026-11-11T00:19:19.646Z)
- ev-16: adr-impact-declaration for adr-impact-declaration (2026-11-11T00:19:19.646Z)
- ev-17: migration-test for migration-compat-and-test (2026-11-11T00:19:43.193Z)
- ev-18: frozen-review for trust-review (2026-11-11T00:23:09.012Z, subagent-stop)
- ev-19: check-run for checks-pass (2026-11-11T00:26:17.822Z)
- ev-20: contract-spec-and-test for contract-spec-and-test (2026-11-11T00:26:17.822Z)
- ev-21: adr-impact-declaration for adr-impact-declaration (2026-11-11T00:26:17.822Z)
- ev-22: check-run for checks-pass (2026-11-11T00:32:41.133Z)
- ev-23: contract-spec-and-test for contract-spec-and-test (2026-11-11T00:32:41.133Z)
- ev-24: adr-impact-declaration for adr-impact-declaration (2026-11-11T00:32:41.133Z)
- ev-25: migration-test for migration-compat-and-test (2026-11-11T00:32:51.656Z)
- ev-26: frozen-review for trust-review (2026-11-11T00:37:33.425Z, subagent-stop)
- ev-27: living-doc-current for living-doc (2026-11-11T08:09:47.023Z)
<!-- ospec:evidence:end -->
