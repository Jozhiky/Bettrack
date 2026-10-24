# Importación de capturas liquidadas — 24/10/2026

## Resultado y alcance

Rama `codex/settled-capture-import`, basada en `main` `5e0e62e` después de la
integración #2–#6. Permite revisar e importar un boleto directamente como
**Ganada, Perdida o Cashout**, con una sola confirmación y una sola transacción.
Esta entrega se publica para revisión en GitHub; **no está desplegada**.
Supabase de producción y los borradores reales del usuario no se consultaron ni
modificaron para probarla. No hay nuevas migraciones, SQL, dependencias ni costes OCR.

El bloqueo se reprodujo primero: `registerCapture` retenía el boleto globalmente
liquidado y la revisión no podía confirmar su estado. Se conserva la retención
automática y se incorpora una ruta explícita de importación histórica.

## Recuperar los borradores existentes

En **Mis apuestas → Históricas en revisión → Revisar e importar** aparece cada
borrador reconocido como histórico, incluidos los antiguos estados `review/error`.
La lista incluye todos los borradores compatibles, aunque la cola visible esté
paginada. Muestra estado, partido, stake, retorno realizado y resultado neto;
los importes inciertos se marcan «Por confirmar».

Se recupera la imagen original desde Storage privado y se reutilizan OCR,
selecciones y evidencias. No hace falta volver a subir ni releer. Reabrir un error
solo cambia el estado del borrador a revisión y añade auditoría. No toca apuestas.
También sigue disponible **Revisar datos** desde la tarjeta de la captura.

Cada boleto tiene su propio resumen y consentimiento. No se incluye confirmación
masiva: los ambiguos pueden quedarse en revisión mientras se importan los demás.

## Evidencia y campos obligatorios

- `Ganada/Perdida` en cabecera global Betano prepara el estado. Una etiqueta
  aislada más abajo podría corresponder a una selección: no preselecciona estado
  y exige que el usuario verifique el resultado del boleto completo.
- `Cashout realizado/cobrado/ejecutado/completado`, como recibo afirmativo completo,
  acredita una candidatura a Cashout. Un botón `CASH OUT S/80`, una oferta,
  negación o frase condicional nunca lo hace.
- El retorno solo se prellena con un importe explícitamente cobrado/devuelto,
  pago final o recibo de ejecución. Retorno potencial y oferta permanecen aparte.
  Si falta el pago real, debe cotejarse y transcribirse en revisión.
- Pérdida total inequívoca devuelve cero. Un Cashout mantiene ese estado tanto
  con beneficio como con pérdida o resultado cero. Neto = retorno − stake cerrado.
- Cashout parcial, varios stakes cerrados contradictorios o stake cerrado distinto
  del completo permanecen retenidos. No se permite forzar un cierre total.
- Casa, tipo, stake, cuota total, potencial original y todas las selecciones/cuotas
  se validan con los modelos existentes. Los datos ausentes se pueden transcribir
  desde evidencia; no se calculan ni se inventan para desbloquear el boleto.
- Fecha de apuesta y de liquidación son obligatorias y distintas de la fecha de
  subida, que se conserva en `createdAt`. Solo se extraen fechas ISO inequívocas
  con zona horaria; las otras se transcriben en Lima (UTC−05:00). Se rechazan
  fechas inexistentes, liquidación anterior a la apuesta o en el futuro.

La revisión conserva retenciones de preparación/conflicto de colocación. Releer
o renombrar la misma imagen no aporta nueva prueba. El texto y la imagen original
no se reemplazan por las correcciones.

## Atomicidad, duplicados y auditoría

`processCapture` mantiene una transacción exterior con el repositorio acotado.
Reutiliza `saveBet` y `settle` dentro de ella: en cloud se envía **un solo
`bt_commit`** con boleto, selecciones, cargo de stake, retorno realizado,
liquidación, auditoría y estado final de captura. Ninguna sesión observa un
registro financiero intermedio pendiente. No se ha cambiado el RPC productivo.

El cargo tiene el identificador determinista existente `stake-<betId>` y la
liquidación `settlement-<betId>`. Siguen activos los controles de imagen y huella
semántica, incluso entre fotografías distintas y con fechas transcritas distintas.
La versión por cuenta del RPC rechaza operaciones concurrentes obsoletas.
El componente bloquea envíos simultáneos y la frontera comprueba consentimiento,
imagen y borrador vigentes. Una repetición exactamente igual tras guardar puede
reconocerse mediante la confirmación auditada sin escribir de nuevo; otra revisión
obsoleta se rechaza. No se sobrescriben apuestas existentes.

La auditoría conserva borrador previo, correcciones, texto original, fechas,
importes, estado, consentimiento y la firma de la solicitud revisada. Un fallo
de liquidación revierte también boleto, cargo y maestros creados en esa operación.
La respuesta perdida se recupera leyendo el estado confirmado de Supabase.

## Validación ejecutada

| Comprobación | Resultado |
| --- | --- |
| Suite completa Vitest | **613/613**, 27 archivos; base 581, 32 casos adicionales |
| TypeScript aplicación y proyectos de pruebas FASE 1, FASE 3 y carga | Aprobado |
| Build y activos OCR/PWA | Aprobado; aviso conocido de chunk mayor de 500 kB |
| Controles de destino QA | **3/3**; rechazan producción y cuentas no sintéticas |
| Persistencia existente `test:persistence:qa` | **17/17** escenarios |
| Importación `test:settled:qa` | **7/7** grupos de comprobaciones reales, sin mocks de persistencia |
| UI de carga RAM, revisión FASE 3 e históricas QA | **375/768/1440 px**, sin desbordamiento del modal; consentimiento accesible |
| OCR real 4B/4C.2 | **28/28; 1065/1089; 24 diferencias** conocidas |
| Seguridad OCR | **0** selecciones omitidas/adicionales y falsos estados financieros |
| FASE 3 real | 3 repeticiones, 7 divergencias literales conocidas, 0 nuevas; paridad 7/7 |

La calidad por imagen/repetición del banco de 28 es idéntica a la referencia de
carga/4C.2; también coinciden corpus, admisiones y hashes de activos. No se tocaron
corpus ni oráculos. Se corrigió el aislamiento de caché/dependencias del banco
visual FASE 3, que compartía optimizador Vite con otras sesiones y fallaba por
dos instancias React; no cambia el runtime productivo.

QA usa exclusivamente el proyecto aislado autorizado y los usuarios desechables
validados por `scripts/persistence-qa/target.mjs`. Se sembraron **20 borradores
antiguos sintéticos + 1 oferta**, con imágenes reales generadas para QA en Storage
privado. Se verificaron:

- Recuperación sin relectura/reenvío; Ganada con pago 140/100 y Perdida total.
- Cashout 140/100, 70/100 y 100/100; importe ausente completado por el usuario.
- Dos sesiones confirmando simultáneamente el mismo boleto; respuesta perdida
  después del commit; segunda fotografía del mismo boleto sin otro cargo.
- Borrador antiguo `error`, potencial obligatorio transcrito, parciales y oferta
  retenidos, cero movimientos antes del consentimiento.
- Cada solicitud financiera con boleto, liquidación y dos movimientos juntos;
  recarga, separación por cuenta, historial cerrado y dashboard.

Resultado final QA: **7 apuestas, 7 liquidaciones, 7 cargos y 7 retornos**,
neto **−S/40.00**, 21 imágenes conservadas. Los diálogos de revisión responsive
adicionales no alteran esas cifras. Los 17 escenarios anteriores también verifican
login, PNG/JPEG/WebP, Storage privado, separación por cuenta, desconexión y reintentos.

Evidencia local ignorada: `test-results/settled-qa/report.json`, capturas
`legacy-inbox-*` / `historical-preview-*`, `test-results/persistence-qa/report.json`,
`test-results/capture-upload/`, `test-results/ocr-phase3-ui/` e informes OCR.
No se publican imágenes, credenciales ni registros privados.

## Reproducción y publicación pendiente

`npm.cmd run test:settled:qa` prepara el build QA y prueba UI/API reales. Requiere
el registro local ignorado `.env.qa-isolated.json`; rechaza cualquier otro destino.
Resetea únicamente los datos de la cuenta sintética propietaria y sus objetos
privados de prueba, preservando auditoría. Ejecutarlo **secuencialmente** respecto
de `test:persistence:qa`, porque comparten fixtures y puerto 5190. Nunca sustituirlo
por `test:e2e`, que puede escribir en producción.

Pendiente: revisión/integración del PR y autorización final de Hosting. Este
cambio reutiliza el backend vigente y **no requiere aplicar SQL en producción**.
Antes del despliegue repetir los gates pertinentes si cambia el árbol, construir
el `dist` normal, comprobar el destino y conservar la versión anterior de Hosting.
No ejecutar la importación de las capturas reales durante esa comprobación.

Límites: no se probaron los ~20 borradores privados reales ni recibos reales de
Cashout/Ganada, que no están en el corpus autorizado. La recuperación de 20 se
demostró con datos sintéticos persistidos del formato anterior. OCR ilegible,
selecciones incompletas, pagos/fechas no acreditados y cashouts parciales siguen
requiriendo evidencia o transcripción verificable. El modelo vigente exige cuota
y potencial original incluso en históricos; no se relaja para inventarlos.
