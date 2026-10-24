# FASE 4B — ejecución aislada del OCR sobre las 28 capturas admitidas

Estado: **banco de medición preparado, pendiente de ejecución real y revisión de métricas**.
Esta fase no altera el motor/parser, los oráculos 4A/1/3, Supabase ni los registros
de apuestas. Ver [admisión 4A](../../docs/OCR_PHASE4A_ADMISSION.md) y
[reglas permanentes](../../AGENTS.md).

## Qué hace y qué no hace

- Verifica que los 28 PNG coinciden **byte a byte** con sus huellas del corpus
  admitido, y que el OCR usa exactamente los modelos fijados en
  tests/ocr-phase1/assets.lock.json.
- Abre un servidor Vite temporal en 127.0.0.1 y un Chromium aislado, bloquea
  service workers y **cualquier petición a un origen externo**.
- Ejecuta src/ocr/engine.ts y src/ocr/readCapture.ts reales (Tesseract local),
  sin llamar a registerCapture, LocalRepository, cloudStore ni Supabase.
- Compara cada imagen por separado con el oráculo humano previo: casa, tipo,
  céntimos, cuota, potencial, colocación, estado visible, oferta de cashout,
  selecciones, Builder, ámbitos partido/equipo/jugador y períodos explícitos.
- Conserva todos los fallos y el OCR crudo de cada imagen en
  test-results/ocr-phase4b/ **local y excluido de Git**. No reemplaza
  transcripciones humanas ni tolera fallos mediante una lista nueva.
- Mide cantidad de selecciones omitidas/adicionales, diferencias por campo,
  abstención/errores de colocación, liquidación y cashout, y latencia p50/p95.
  El comparador alinea selecciones por **posición**: una omisión puede desplazar
  comparaciones posteriores; se comunica esta limitación.
- Compara settlement con la **etiqueta visible**, no con una predicción de
  liquidación. settledReturn se declara expresamente **no expuesto** por el OCR
  y no se puntúa. Los importes potenciales no se convierten en retornos reales.
- No registra apuestas, realiza cashouts, certifica boletos únicos, prueba
  cloud E2E ni publica métricas sin haber ejecutado el banco de OCR.

## Ejecutar en tu Windows (PowerShell)

Requiere Node 24.x, las dependencias del lockfile, los modelos OCR locales
correctos y Chromium de Playwright. Instálalos **una sola vez** si faltan:

    npm.cmd ci
    npm.cmd run assets:ocr
    npx.cmd playwright install chromium

Desde D:\Apuestas, después de comprobar git status --short y la rama:

    npm.cmd run test:ocr:phase4b:unit
    npm.cmd run test:ocr:phase4b

El segundo comando procesa las 28 imágenes; **tarda varios minutos**.
Para aislar una imagen concreta sin perder su admisión previa:

    $env:OCR_CASE_IDS = "brugge-builder-early"
    npm.cmd run test:ocr:phase4b
    Remove-Item Env:OCR_CASE_IDS

La repetición adicional mide variación sin contar una imagen varias veces en
el resumen de calidad:

    $env:OCR_REPEATS = "3"
    npm.cmd run test:ocr:phase4b
    Remove-Item Env:OCR_REPEATS

La ejecución normal devuelve código de salida 0 si el banco se ha podido medir,
**aunque existan diferencias de OCR**. Para convertir cualquier diferencia en
fallo explícito:

    npm.cmd run test:ocr:phase4b:strict

Modo estricto no usa un allowlist y es esperable que falle ante discrepancias
reales. No confundirlas con las siete divergencias literales ya conocidas de
FASE 3; el nuevo corpus aún no tiene una línea base medida.

Archivos locales:
- test-results/ocr-phase4b/report.json: entorno, huellas, tiempos, campos,
  salidas extraídas, discrepancias y riesgos de seguridad.
- test-results/ocr-phase4b/<id>.raw.json: OCR crudo de la imagen, sus pasadas
  y coordenadas. No subir estos resultados sin inspeccionarlos.
- Con OCR_CASE_IDS, el informe **no representa las 28 imágenes**. Las
  raw.json de otras ejecuciones pueden persistir; solo report.json
  identifica inequívocamente el conjunto efectivamente medido.

## Flamengo: aclaración bet365, no una nueva admisión

El usuario identificó preparation-flamengo como una captura de **bet365**
con promoción **Superaumento**. En bet365, «Cerrar apuesta» describe la
**posibilidad** de cobro anticipado, igual que «Cashout» en Betano;
no acredita ejecución. La leyenda «Crear apuesta» puede designar el producto
Bet Builder y **no debe por sí sola** resolver la colocación de un boleto.

Esta atribución del usuario se conserva como **contexto externo**, pero el PNG
original continúa fuera de Git. La imagen admitida debe mostrar evidencia
suficiente para marcar casa y estado por regiones; actualmente el contrato
4A solo contiene oráculos Betano. No se ha fabricado región, ampliado el
oráculo ni transferido una aceptación de otra captura.

Para reconsiderar la admisión de bet365 se necesita **una copia autorizada,
desidentificada, legible y con la marca visible**, junto con evidencia
inequívoca de colocación si se quiere certificarla. Debe evaluarse la
extensión del contrato de pruebas a Bet365 **sin relajar** los requisitos
por campo. Hasta entonces, preparation-flamengo sigue pendiente y no
forma parte de las 28 medidas.

## Criterios de revisión y continuación

1. Ejecutar suite unitaria y banco completo en el workspace real, recopilar
   salida sin publicar datos sensibles y comprobar el origen local y las
   huellas de producción intactas.
2. Revisar report.json y los casos de mayor riesgo: mercados de jugador,
   cuotas omitidas, Builder, primer tiempo, colocación no probada,
   liquidaciones desconocidas y ofertas cashout.
3. Documentar una línea base medible (número de casos, total de checks y
   error por familia) antes de proponer correcciones de motor.
4. No prometer precisión general ni porcentajes extrapolables con 28 casos.
   Los **26 grupos conservadores** representan posibles instantáneas del
   mismo boleto y nunca certifican 26 boletos únicos.
5. Cualquier cambio posterior al motor, a la admisión de Flamengo o a cloud
   requiere una tarea delimitada y pruebas independientes.

No ejecutar test:e2e ni deploy:firebase en esta fase.
