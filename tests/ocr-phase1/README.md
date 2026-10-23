# Corpus OCR — FASE 1

Banco de pruebas aislado. No es un nuevo parser ni modifica cómo guarda la aplicación.

**Actualización FASE 2:** esta página documenta la referencia histórica. Los tres contratos
antes declarados `it.fails` ahora son pruebas ordinarias obligatorias; sus expectativas no
se relajaron. `cases.json`, `known-failures.json`, imágenes y `OCR_PHASE1_BASELINE.json`
se conservan. Para el código actual utiliza `npm run test:ocr:phase2` y el procedimiento
de [OCR_PHASE2_REPORT.md](../../docs/OCR_PHASE2_REPORT.md). El comando histórico
`test:ocr:baseline` detectará las reparaciones como cambios respecto a la FASE 1;
no se debe actualizar automáticamente aquella referencia para hacerlo pasar.

## Entradas y procedencia

`cases.json` contiene cinco capturas reales revisadas visualmente y sus transcripciones esperadas, escritas a partir de las imágenes. Incluyen 13 selecciones externas y 11 mercados internos de Bet Builder. No se usan resultados del parser como verdad esperada.

La desidentificación se hace por selección y minimización: las imágenes elegidas no muestran nombre del titular, cuenta, correo, ID del boleto, QR ni credenciales. Se usan nombres neutros de archivo y se descartan los metadatos PNG no esenciales. No se conserva en el corpus la ruta ni el nombre de archivo original. Se mantienen clubes, jugadores, líneas, cuotas e importes necesarios para evaluar el reconocimiento. Los píxeles no se alteran ni se generan con IA.

`controlled.ts` contiene cinco geometrías construidas a mano: dos controles conocidos, un mercado desconocido, un mercado desconocido dentro de Builder y una cuota ausente. **No son salidas reales de Tesseract ni acreditan que Betano ofrezca el mercado experimental.**

El ejecutor también relee la imagen `handicap-combination` y aplica dos fallos controlados a la evidencia OCR: retira la cuota 1.33 o sustituye un mercado por una etiqueta no catalogada. No altera la imagen. Esos casos se reportan separados de la precisión real. La cuota ausente se espera como `null`, sin calcularla ni copiarla de otro bloque.

## Ejecutar desde la raíz del repositorio

```powershell
npm.cmd ci
npm.cmd run assets:ocr
npx.cmd playwright install chromium
npm.cmd test -- --maxWorkers=4
npx.cmd tsc -p tests/ocr-phase1/tsconfig.json
npm.cmd run test:ocr:baseline
```

Los modelos y Chromium solo requieren descarga inicial. No hace falta una cuenta de Supabase, credenciales QA ni un servidor de la aplicación abierto. El ejecutor inicia su propio Vite en un puerto libre de loopback y bloquea los servicios externos. La lectura se realiza con los modelos locales.

La preparación existente descarga modelos de una rama mutable. Por eso `assets.lock.json` fija las huellas de modelos, worker y WASM utilizadas en esta referencia. Si no coinciden, se detiene la medición. **No actualizar las huellas automáticamente para hacer pasar la prueba:** revisar primero la procedencia del cambio y repetir la referencia de manera explícita.

Por defecto se hacen tres repeticiones por imagen, con un trabajador reutilizado. Para otra cantidad:

```powershell
$env:OCR_REPEATS = '5'
npm.cmd run test:ocr:baseline
Remove-Item Env:OCR_REPEATS
```

Los resultados completos y trazas se escriben en `test-results/ocr-phase1/`, excluido de Git. La referencia revisada está en `docs/OCR_PHASE1_BASELINE.json` y el informe en `docs/OCR_PHASE1_REPORT.md`.

El modo estricto escribe en `test-results/ocr-phase1-strict/` para no reemplazar la medición de referencia.

## Dos criterios de éxito distintos

- `test:ocr:baseline`: devuelve 0 si reproduce exactamente el comportamiento revisado. Los errores conocidos siguen visibles en el informe. Cualquier nuevo error, valor distinto o mejora de un fallo conocido requiere revisión de la referencia; no se tolera cualquier error en un campo previamente fallido.
- `test:ocr:strict`: devuelve 1 mientras exista cualquier discrepancia con la transcripción deseada, incluso las conocidas. Es intencional en FASE 1; no debe sustituirse la verdad esperada por la salida del OCR.
- En Vitest, tres pruebas `it.fails` expresan el contrato deseado que hoy incumple el parser. No están omitidas. Si el defecto desaparece, obligan a actualizar expresamente la prueba y su referencia.

`known-failures.json` documenta razones, rutas exactas y valores observados. No existe un comando que acepte automáticamente nuevas fallas.

## Evaluación por campo

`quality.ts` compara casa, tipo, stake, cuota total, retorno, eventos, mercados y selecciones. Incluye cuotas individuales, promociones, oferta cashout y cantidades de bloques y submercados.

Solo se normalizan composición Unicode NFC y espacios. Tildes, signos, cifras, períodos y nombres conservan significado. Una pérdida de tilde cuenta como error de transcripción, no se presenta automáticamente como cambio de significado deportivo.

La comparación es por posición de selección y submercado. Una omisión desplaza los campos siguientes y puede causar varias discrepancias; `omittedLegs` permite distinguir una omisión de múltiples errores independientes. Los campos faltantes permanecen en el denominador. Los bloques adicionales fallan el control de cantidad.

Las pruebas de mutación demuestran que el evaluador detecta, entre otros: mercado convertido en equipo, goles de equipo convertidos en goles de partido, primer tiempo eliminado, córners convertidos en goles, tiros al arco convertidos en remates, cambio de operador, cambio de signo de hándicap, pérdida de `+` en `1+` y cambio del minuto de un próximo gol. Esto evalúa preservación de significado frente a un oráculo explícito; no introduce un clasificador semántico de producción.

## Medición y aislamiento

`scripts/ocr-phase1/instrumentation.mjs` envuelve funciones únicamente en el servidor de pruebas. No reescribe archivos. Comprueba anclas exactas para fallar si cambia el código que instrumenta. Un segundo servidor sin instrumentar ejecuta las mismas cinco imágenes y compara los datos y el registro.

| Medida           | Límite medido                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Preprocesamiento | `preprocess`, con decodificación, canvas, contraste y símbolos.                                                   |
| OCR              | Todas las llamadas reales a `worker.recognize`, incluidos logo y reintentos.                                      |
| Reconstrucción   | `visualRows` y `parseBetanoLayout`, descontando llamadas anidadas instrumentadas.                                 |
| Interpretación   | `parseTicket` y `marketFamily`, descontando reconstrucción anidada.                                               |
| Validación       | Llamadas reales a `parse` y `safeParse` de los esquemas de apuesta y selección, incluidas completitud y registro. |
| Registro         | `registerCapture`, con repositorio y transacciones reales sobre fake-indexeddb en RAM; validación medida aparte.  |

Son tiempos exclusivos para evitar doble conteo, tomados con `performance.now`. La lógica actual mezcla reconstrucción e interpretación: los nombres describen límites de funciones observables, no etapas puras ya desacopladas. Los controles imperativos dentro del registro forman parte de registro; no se atribuye toda la validación de negocio al tiempo de Zod.

La inicialización del trabajador se reporta aparte. `recognitionMs` mide `readCapture`: excluye descarga inicial, obtención del archivo, preparación del repositorio temporal y registro. No sumar percentiles de fases como si fueran el percentil del total.

Se crea un contexto de navegador nuevo, se reemplaza IndexedDB con una implementación en RAM antes de importar Dexie, y se elimina cada base temporal en `finally`. El cliente Supabase se sustituye por un objeto que lanza un error ante cualquier uso. El tráfico externo se bloquea y cualquier intento hace fallar la prueba. Nunca se abre la aplicación autenticada ni se invocan sus RPC o Storage.

Las huellas de `src/ocr`, `src/data`, `src/domain` y `supabase/migrations` se comparan antes y después. Las métricas de registro **no representan la latencia cloud** ni evalúan RLS en producción.

## Añadir un caso de corrección humana

1. Revisar visualmente la imagen y retirar o excluir cualquier identificador del titular antes de incorporarla. Este importador no detecta ni oculta PII visible.
2. Crear en `cases.json` un ID neutro, procedencia, etiquetas y transcripción esperada independiente.
3. Importar el PNG revisado con `node scripts/ocr-phase1/import-reviewed.mjs <id> <archivo.png>`. El script elimina metadatos, conserva los píxeles y registra SHA-256; no guarda la ruta original.
4. Ejecutar la prueba y revisar cada discrepancia contra la captura. No ajustar el resultado esperado para copiar un error del parser.
5. Documentar cualquier fallo aceptado temporalmente con motivo, campo y valor exacto observado.
6. Conservar la corrección como regresión al avanzar a futuras fases.

Limitaciones actuales: cinco imágenes, fútbol, un formato de Betano y un equipo de referencia. No hay todavía una captura real cuya etiqueta desconocida haya sido anotada como tal; esa cobertura se obtiene mediante fallos controlados claramente identificados. No se promete cobertura de todos los mercados ni una tasa universal de precisión.
