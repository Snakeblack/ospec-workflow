# 0012. Un documento exportado con formato cerrado declara solo su versión

- Status: accepted
- Date: 2026-10-26
- Evidence: schemas/progress-snapshot/v1.schema.json:3, scripts/lib/progress-snapshot.js:16

## Context and drivers
El ADR 0009 pide que todo documento de máquina que ospec persiste o intercambia declare su contrato con nombre y versión. Un documento que ospec exporta para que lo lea otro sistema, como el snapshot de avance de un proyecto, puede tener un formato cerrado que rechaza cualquier campo que no conoce, de modo que no admite un campo con el nombre del contrato. Driver: `scenario:contract-compatibility`.

## Options considered
1. El documento exportado declara solo su versión, y su nombre queda en el identificador de su esquema y en la orden que lo produce: el formato se respeta; quien lea el documento suelto no ve su nombre.
2. Añadir un campo con el nombre: cumple el ADR 0009 al pie de la letra; el consumidor rechaza el documento como inválido.
3. Envolver el documento en otro con nombre y versión: conserva las dos cosas; el consumidor tendría que desenvolverlo y deja de recibir el formato acordado.

## Decision
Enmienda el ADR 0009. Un documento que ospec exporta a un consumidor externo con un formato cerrado declara solo su versión, y su nombre es el identificador de su esquema. Sigue validándose contra el esquema de esa versión antes de emitirse, y un cambio incompatible es una versión nueva. Los documentos que ospec persiste para sí mismo siguen declarando nombre y versión.

## Consequences
El esquema de cada documento exportado lleva su identificador con nombre y versión, y la orden que lo produce valida lo que emite. Un documento exportado sin su orden ni su esquema solo dice su versión.

## Fitness function
Los tests del snapshot de avance comparan su esquema publicado con las reglas que aplica la orden y rechazan un documento que las rompe.
- Check: `node --test scripts/lib/progress-snapshot.test.js`

## Review trigger
Un consumidor que admita campos de metadatos, o un documento exportado que necesite su nombre dentro del propio documento.
