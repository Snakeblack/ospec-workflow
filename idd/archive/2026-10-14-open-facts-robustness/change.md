# open-facts-robustness

## Intent and acceptance

El gate open-facts, la evidencia de tests y las señales de persistencia y contrato dejan de depender de que el modelo detecte los huecos.

Acceptance: Con tres repeticiones y el desglose por tipo de check, idd-agy-4 frente a gentle-ai-agy-4 deja en todo-spa una media de escapados de IDD de 2 o menos, y en el escenario reservado menos escapados que gentle-ai, sin perder acceptance ni regression ni bajar la calidad. Repetir los seis escenarios con Claude frente a idd-4 no aumenta los mensajes con preguntas en más de uno por escenario ni los tokens en más de un 20 %.

## Plan

1. Una feature cubre siete categorías en `record intent`: pregunta concreta, `ruta:línea` que existe, o un fragmento de `--request`. El rechazo incluye el comando.
2. `ospec record assumption` guarda lo que el agente decidió; `ospec close` lo muestra y no bloquea.
3. Una feature o un bug cuyo diff toca código de producto y ningún test deriva `untested-product`. Un check que informa 0 tests no es evidencia.
4. `localStorage`, IndexedDB y escrituras a disco activan `persistent-data`; un contrato de selectores o de API en documentación activa `public-contract`. Un comentario no dispara.
5. `next` imprime el comando de la obligación. La skill solo apunta a esas órdenes.
6. El escenario reservado `receta-spa` queda congelado en el corpus greenfield, con brief, hechos, checks y referencia. El digest de ese corpus es `7ce1db3ed2ba5500ec3d60506e5bfac9595afb49929e731089c03a4114224a62`. El digest del corpus default no cambia: `3eed3740a0d60661b6724c7884225f575189723fb75b334d8c7377bfe93ad8b4`. No se reajusta el CLI a esos hechos.

## Decisions

- Prior decision (memory): E4.6 open-facts-robustness entra en el roadmap por delante de E4.3 -> docs/roadmaps/harness-evolution.md: current. Foundation queda en E4.10 y el rigor es el mismo para todos los modelos; el campo rigor solo se añade si la repetición con Claude incumple los márgenes.
- Del gate open-facts (usuario, 2026-10-14): las siete categorías en toda feature que añade código, sin depender del stack; una categoría se cierra sin preguntar solo con una ruta:línea que existe o con un fragmento literal de la petición; los supuestos solo se muestran en ospec close; cualquier código de producto añadido o modificado que no sea test, documentación o manifiesto exige tests, y cero tests no es evidencia; localStorage, IndexedDB y escrituras a disco activan persistent-data, y un contrato de selectores o de API en documentación activa public-contract, con un fixture de comentario; el escenario reservado lo escribe y congela otra sesión, y esta no lee sus hechos ocultos.
- Las categorías se exigen al registrar una feature, que es el momento anterior a editar. Un bug, un refactor o documentación conservan la declaración anterior.
- Una cita `ruta:línea` vale si el fichero existe y tiene esa línea. El CLI no juzga si la línea decide el comportamiento.
- Un fragmento de la petición vale si tiene al menos 12 caracteres y aparece tal cual en `--request`.
- El código de producto es un fuente (html incluido). Manifiestos, documentación y tests no lo son. Un `.sql` sigue siendo dato persistente por su ruta, no código de producto.
- Escenario reservado (2026-10-14): `receta-spa`, una ficha de receta en un `index.html`. Digest greenfield `7ce1db3ed2ba5500ec3d60506e5bfac9595afb49929e731089c03a4114224a62`. Esta sesión lo escribió y no reajustó el CLI a sus hechos. La referencia pasa todos los checks ocultos y la semilla falla la aceptación.
- Márgenes `bench-margins-9`, declarados antes del banco: tres repeticiones, gentle-ai como base e IDD como candidato. El checkpoint solo impone el techo agregado (+2 escapados de media sumados, 10× tokens, calidad de E4.5). El criterio que cierra el ítem es otro: en `todo-spa` la media de escapados de IDD es como mucho 2, y en `receta-spa` es menor que la de gentle-ai, sin perder acceptance ni regression. El 10× existe porque el esquema exige un ratio y esta campaña no acota los tokens; el +20 % queda para la repetición con Claude, con su propia versión de márgenes antes de correrla.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-10-14T09:17:04.867Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-14T09:17:56.782Z)
- ev-3: migration-test for migration-compat-and-test (2026-10-14T09:21:11.027Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-14T09:21:49.011Z)
- ev-5: migration-test for migration-compat-and-test (2026-10-14T09:23:44.361Z)
- ev-6: check-run for checks-pass (2026-10-14T09:24:22.904Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-10-14T09:24:22.904Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-10-14T09:24:22.904Z)
- ev-9: check-run for checks-pass (2026-10-14T10:04:05.104Z)
- ev-10: contract-spec-and-test for contract-spec-and-test (2026-10-14T10:04:05.104Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-10-14T10:04:05.104Z)
- ev-12: migration-test for migration-compat-and-test (2026-10-14T10:04:24.925Z)
- ev-13: check-run for checks-pass (2026-10-14T10:10:05.813Z)
- ev-14: contract-spec-and-test for contract-spec-and-test (2026-10-14T10:10:05.813Z)
- ev-15: adr-impact-declaration for adr-impact-declaration (2026-10-14T10:10:05.813Z)
- ev-16: migration-test for migration-compat-and-test (2026-10-14T10:10:31.631Z)
- ev-17: check-run for checks-pass (2026-10-14T13:58:49.456Z)
- ev-18: contract-spec-and-test for contract-spec-and-test (2026-10-14T13:58:49.456Z)
- ev-19: adr-impact-declaration for adr-impact-declaration (2026-10-14T13:58:49.456Z)
- ev-20: migration-test for migration-compat-and-test (2026-10-14T14:05:16.408Z)
- ev-21: living-doc-current for living-doc (2026-10-14T14:05:23.341Z)
<!-- ospec:evidence:end -->
