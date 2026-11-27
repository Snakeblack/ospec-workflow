# auto-run-permission-policy

## Intent and acceptance

La ejecución automática aplica la misma política de permisos en todos los hosts: lo denegado nunca corre, lo crítico para la ejecución para el usuario y el resto corre sin preguntar

Acceptance: En cada host verificado de ospec auto, una orden de DENY_RULES se bloquea, una de ASK_RULES o la lectura de un secreto para la ejecución como blocked con la orden y su motivo hasta que el usuario la aprueba o responde, y una orden normal corre sin preguntar; un test de contrato fija cada caso y docs/target-capabilities.md lo dice por host

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-27T19:10:01.805Z):

> fusiona y continua (E1.111 auto-run-permission-policy: es importante que no pregunte a cada cosa que hará, y me refiero a ejecuciones de bash, salvo los que tenemos como críticos, y desde luego los deny no, y obviamente los ask sí)

Answer 1 — open-facts, user, 2026-11-27T19:14:10.318Z:

> todas las recomendadas (1: --allow aprueba exactamente las órdenes pendientes, --answer sin --allow las rechaza y lleva el texto, resume sin nada da por resuelto lo hecho en la sesión; 2: para una vez con la lista sin repetidas y --allow las aprueba todas; 3: la aprobación vale solo el turno siguiente, como sha256 en OSPEC_AUTO_ALLOW del entorno del host, nunca en disco; 4: item N/M blocked at permission con cada orden y su motivo y las líneas approve with/or answer with, y el deny al modelo dice que termine el turno o siga sin esa orden; 5: la ejecución se niega a arrancar en un host donde el hook no corre sin interfaz, con un error que dice cómo activarlo; entrega en cadena de PR)

Answer 2 — review-limit, user, 2026-11-27T20:35:03.713Z:

> si hazlo
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `handbook/idd/flujo-idd.md`, `internal/hooks/export_test.go`, `internal/hooks/pretooluse.go`, `internal/hooks/pretooluse_auto_test.go`, `internal/hooks/pretooluse_test.go`, `internal/hooks/secretscan.go`, `internal/testdata/auto-permission/cases.json`, `openspec/specs/hooks/spec.md`, `openspec/specs/idd/spec.md`, `scripts/hooks/lib/secret-scan.js`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/ospec-hooks-launch.test.js`, `scripts/hooks/pre-tool-use-auto.test.js`, `scripts/hooks/pre-tool-use.js`, `scripts/hooks/pre-tool-use.test.js`, `scripts/lib/auto-conductor.js`, `scripts/lib/auto-conductor.test.js`, `scripts/lib/auto-host-antigravity.js`, `scripts/lib/auto-host-codex.js`, `scripts/lib/auto-host-codex.test.js`, `scripts/lib/auto-host-copilot.js`, `scripts/lib/auto-host-cursor.js`, `scripts/lib/auto-host-opencode.js`, `scripts/lib/auto-hosts.js`, `scripts/lib/auto-hosts.test.js`, `scripts/lib/auto-permission.js`, `scripts/lib/auto-queue.js`, `scripts/lib/auto-queue.test.js`, `scripts/lib/auto-run.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/ospec.auto.test.js`, `scripts/ospec.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Cada turno de ospec auto lleva OSPEC_AUTO_SESSION con el directorio de la ejecución en el entorno del host; el hook solo cambia su decisión con esa marca, así que una sesión interactiva en el mismo repositorio sigue igual
- En una sesión de ospec auto, un ask de ASK_RULES, de la lectura o escritura de un secreto o de un commit en la rama por defecto se vuelve deny y deja la petición; el ask del consumo de tokens, de la deriva de specs y del commit con el árbol sucio sigue con su aviso, como la recomendación
- Un deny nunca se degrada: la marca solo endurece un ask o lo deja pasar con su aviso
- Tras la revisión de confianza, un ask de aviso nunca tapa un ask crítico posterior de la misma llamada, y con la marca deja solo su aviso, sin decisión, en vez de un allow que cubriría toda la llamada y se saltaría los permisos del host
- La clave de una aprobación ata las órdenes de la llamada, o su herramienta y cada valor de su entrada con su ruta; la ejecución revalida con el guard cada petición, que la sesión también puede escribir, usa el motivo del guard, escapa los caracteres de control y deja cada llamada completa en permission-block.json
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-11-27T19:50:57.660Z)
- ev-2: check-run for checks-pass (2026-11-27T19:53:18.573Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-27T19:53:18.573Z)
- ev-4: check-run for checks-pass (2026-11-27T20:10:49.376Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-11-27T20:10:49.376Z)
- ev-6: migration-test for migration-compat-and-test (2026-11-27T20:11:23.090Z)
- ev-7: frozen-review for trust-review (2026-11-27T20:24:44.721Z, subagent-stop)
- ev-8: check-run for checks-pass (2026-11-27T20:33:16.092Z)
- ev-9: contract-spec-and-test for contract-spec-and-test (2026-11-27T20:33:16.092Z)
- ev-10: adr-impact-declaration for adr-impact-declaration (2026-11-27T20:33:16.092Z)
- ev-11: migration-test for migration-compat-and-test (2026-11-27T20:33:36.201Z)
- ev-12: frozen-review for trust-review (2026-11-27T20:48:10.752Z, subagent-stop)
- ev-13: check-run for checks-pass (2026-11-27T20:52:57.169Z)
- ev-14: contract-spec-and-test for contract-spec-and-test (2026-11-27T20:52:57.169Z)
- ev-15: adr-impact-declaration for adr-impact-declaration (2026-11-27T20:52:57.169Z)
- ev-16: migration-test for migration-compat-and-test (2026-11-27T20:53:16.290Z)
- ev-17: frozen-review for trust-review (2026-11-27T20:53:58.239Z, subagent-stop)
- ev-18: living-doc-current for living-doc (2026-11-27T20:54:04.068Z)
<!-- ospec:evidence:end -->
