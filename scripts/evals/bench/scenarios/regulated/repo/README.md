# clinic-records

Historia clínica y agenda de citas de una clínica privada.

Este servicio trata datos de salud, una categoría especial del RGPD (art. 9).
Cada acceso a datos de pacientes queda registrado en la auditoría
(`src/audit.js`) y cada operación comprueba el rol de quien la hace.

| Rol | Puede |
| --- | --- |
| `doctor` | Leer historias y la agenda |
| `reception` | Leer la agenda |

Pruebas: `npm test`.
