# Dos capturas retenidas: validación y recuperación del cobro

24/10/2026. Base: `90af35be226ee38401316d95e0cd122a9e67ba20`, posterior al
despliegue autorizado del PR #10. Rama: `codex/settled-footer-recovery`.

Actualización: [PR #11 fusionado y desplegado con autorización](RECEIPT_OCR_DEPLOYMENT_2026_10_24.md).

## Causas comprobadas

- **Caso A, liquidado Ganada:** stake S/20.00 y Ganancias S/31.00 visibles.
  El OCR almacenado había convertido el separador decimal en `31 ¿00`.
  La relectura completa tampoco lo resolvía (`31 .00`). El bloqueo del cobro
  se reprodujo antes de corregirlo; no era un requisito de fechas.
- **Caso B, Bet Builder abierto en vivo:** stake S/20.10, cuota 2.92,
  ganancias **potenciales** S/58.69 y **botón** `CASH OUT S/24.32`.
  No muestra cierre ejecutado ni estado global liquidado. Dos participantes
  de mercados también estaban marcados con confianza insuficiente en el OCR.
  No debe registrarse como Ganada, Perdida ni Cashout ejecutado desde esa imagen.

Se cotejaron los originales privados recuperados de Storage con su hash ya
almacenado. Se usaron solo en diagnóstico local aislado, bloqueando destinos
externos. No se publican imágenes, identificadores de boletos ni texto privado.
Los dos borradores productivos completos siguen idénticos a la lectura inicial.

## Corrección limitada

La pantalla de lote recupera automáticamente el pie de los borradores Betano
Ganada/Cashout cuyo estado global existe pero cuyo cobro no se lee. Usa Tesseract
local gratuito con dos contrastes del pie interior (70–97 % de altura).

Ambos contrastes deben leer un pie completo `Apuesta / Ganancias` con idénticos
importes a céntimos. El stake debe coincidir con el original y todos los dígitos
del cobro original deben coincidir con la relectura. No se sustituye una cifra,
no se calcula el cobro desde las cuotas, no se convierte una oferta en ejecución.
Estado terminal, colocación, cierre completo y ausencia de contradicciones
siguen siendo obligatorios.

La prueba suplementaria `receiptOcr` queda ligada al hash original y auditada.
Se conserva intacto el texto anterior, imagen, selecciones y retenciones.
Solo se actualizan borrador/auditoría; nunca apuestas ya guardadas. Se descartan
resultados de imágenes ajenas, sesiones cambiadas o borradores editados durante
la lectura. El resumen espera a terminar antes de habilitar el consentimiento.

En el Caso A, ambos contrastes reales leen S/31.00: queda preparable como
**Ganada, stake S/20.00, retorno S/31.00, neto +S/11.00**, sin completar fechas
ni abrir la revisión individual. No se ha registrado en producción.

## Verificación

- **725/725 pruebas** en 33 archivos; TypeScript y build aprobados.
- Capturas originales privadas: recuperación real del Caso A, ninguna
  liquidación inventada para el Caso B. Los originales no salieron al QA.
- Banco real de 28 imágenes: **1067/1089**, mismas 22 diferencias; cero selecciones
  omitidas/añadidas, colocaciones/ganancias/cashouts ejecutados sin respaldo.
  Corpus, oráculos y modelos OCR sin modificaciones. Este banco mantiene sus
  campos previos; la nueva recuperación del pie se comprueba además por separado.
- `npm.cmd run test:automatic:qa`: tres barreras de destino y seis grupos QA,
  exclusivamente en el proyecto aislado autorizado y con cuentas sintéticas.
  Conserva las cinco comprobaciones previas y añade recuperación con Tesseract
  real desde una imagen sintética, persistencia del OCR original y del suplemento,
  recarga, dos sesiones, auditoría y cero finanzas antes del consentimiento.
- QA final: **18 apuestas / 18 liquidaciones / 36 movimientos**, un duplicado
  sin cargo, dos excepciones, neto sintético -S/749.00; el caso añadido aporta
  exactamente un cargo S/20.00 y un retorno S/31.00. Concurrencia/respuesta perdida,
  dashboard y UI 375/768/1440 siguen aprobados. Sin destinos imprevistos ni errores.
- Evidencia local ignorada: `test-results/automatic-qa/report.json`,
  `test-results/ocr-phase4b/report.json` y diagnóstico privado en
  `test-results/retained-tickets/`. No se incluyen en Git.

## Entrega y límites

No hay migraciones, dependencias nuevas, cambios de Auth/RLS/Storage ni operaciones
financieras productivas. La implementación se fusionó y publicó con autorización
específica del usuario; el recibo enlazado documenta las comprobaciones de Hosting.

El recorte es deliberadamente conservador. Si no contiene exactamente el pie,
los contrastes discrepan o falta algún dígito original, conserva la revisión.
No promete resolver imágenes sin evidencia de cobro. Tras publicar, los borradores
existentes se recuperan al abrir el lote, sin volver a subirlos; el usuario conserva
la confirmación final del resumen antes de cualquier cargo o retorno.
