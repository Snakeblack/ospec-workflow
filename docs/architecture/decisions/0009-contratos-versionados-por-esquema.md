# 0009. Los contratos de máquina se versionan por esquema

- Status: accepted
- Date: 2026-10-11
- Evidence: schemas/foundation/knowledge-map/v1.schema.json:9, scripts/lib/review-lineage.js:79

## Context and drivers
Proyectos con estado escrito por una versión anterior actualizan el plugin. Un cambio de forma no declarado reinterpretaría ese estado en silencio. Driver: `scenario:contract-compatibility`.

## Options considered
1. Cada documento de máquina declara su contrato y versión, y un esquema lo valida: la evolución es explícita; cada versión nueva convive con la anterior.
2. Forma implícita en el código: sin esquemas; cualquier cambio rompe en silencio.
3. Migración automática en cada arranque: transparente; reescribe datos del usuario sin su permiso.

## Decision
Todo documento de máquina que ospec persiste o intercambia declara su contrato con nombre y versión, y se valida contra el esquema de esa versión. Un cambio incompatible es una versión nueva; el código ramifica por versión en lugar de reinterpretar.

## Consequences
Un estado viejo se lee o se rechaza con un error que nombra el esquema. Cambiar un contrato exige su esquema, fixtures válidos e inválidos y la rama de lectura de la versión anterior.

## Fitness function
Los tests de cada contrato validan sus fixtures contra el esquema; los reducers ramifican por la versión del predecesor.
- Check: `node --test scripts/lib/knowledge-map.test.js scripts/lib/component-map.test.js scripts/lib/decision-records.test.js`

## Review trigger
Una versión vieja sin usuarios que justifique retirar su rama de lectura.
