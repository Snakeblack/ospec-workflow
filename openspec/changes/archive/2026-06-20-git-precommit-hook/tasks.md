# Tasks: git-precommit-hook

**Delivery**: Single PR, exception-ok
**Estimated changed lines**: ~100-150

---

## Tanda 1 — Instalador y Scripts Base

- [x] **T1.1** Implementar el script instalador `scripts/setup-git-hooks.js` para registrar el hook de forma idempotente con los permisos de ejecución correctos.
- [x] **T1.2** Agregar la propiedad `"setup:git-hooks"` en los scripts de `package.json` para facilitar la instalación local.
- [x] **T1.3** Implementar el validador principal `scripts/hooks/pre-commit-hook.js` resolviendo la validación de OpenSpec y el enrutamiento de Strict TDD (con bypasses).

## Tanda 2 — Pruebas Unitarias de Validación

- [x] **T2.1** Escribir tests unitarios en `scripts/hooks/pre-commit-hook.test.js` simulando los escenarios de archivos staged de producción, pruebas y tareas para validar el bloqueo de Strict TDD y bypasses.
- [x] **T2.2** Asegurar que las validaciones del validador toleren fallos externos e inyecten alertas de aviso.

## Tanda 3 — Verificación de Integración

- [x] **T3.1** Instalar el hook localmente y validar su correcto funcionamiento en Git y con el script de chequeo de workspace (`node scripts/check.js`).

---

## Review Workload Forecast

| Metric | Value |
|--------|-------|
| Estimated changed lines | ~100-150 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No (aprobado por el usuario en clarify) |

## Dependencies
None.
