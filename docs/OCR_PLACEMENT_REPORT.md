# BETTRACK — Auditoría de colocación antes de FASE 3

Fecha: 23/10/2026. Base: `6ee7a76ebe1a535e615bf5a15ea75e15beb59c18`.

**El defecto existía:** un boleto con selecciones/importes completos y «Crear apuesta»
o «Cerrar apuesta», sin evidencia de colocación, podía generar una apuesta y un
movimiento **Apuesta colocada de −S/10.00** en el caso controlado. Se corrigió la
barrera de registro automático sin modificar fórmulas contables ni datos históricos.

## Reproducción y causa

Se inspeccionó `enqueueCaptures → startCaptureQueue → readCapture → parseTicket →
registerCapture → LocalRepository.saveBet`, además de los reintentos y la interfaz
`CapturePending`. La FASE 2.1 descartaba la falsa oferta de cashout del botón,
pero no descartaba el registro del boleto: la completitud/validación de campos
no demuestra que Betano lo haya aceptado. `saveBet` crea el movimiento de stake
cuando recibe una apuesta válida; no había una comprobación previa de colocación.

Antes de modificar producción se ejecutaron **21 pruebas: 19 fallaron y 2 pasaron**.
En 14 comprobaciones se permitía el registro indebido; otras cinco fallaban únicamente
porque todavía no existía el nuevo metadato de colocación, aunque el registro de la
apuesta confirmada sí funcionaba. Las dos pruebas de conservación histórica pasaban.
La prueba integrada usa `readCapture`, parser y repositorio reales, con salida OCR
controlada y base en RAM; no sustituye esos componentes por un registro simulado.

Al ampliar los casos se reprodujo también que «Sin CASHOUT S/8.90» y «No CASHOUT
S/8.90» podían confundirse con evidencia positiva. Se ancló el rótulo cashout al
inicio de línea. No se aceptan negaciones por coincidencia de una subcadena.

El archivo final de **25 pruebas** se volvió a ejecutar sobre una copia aislada
del commit base: **22 fallaron / 3 pasaron** (17 comprobaciones de barrera y cinco
del nuevo metadato). Sobre la implementación corregida pasan **25/25**.
Las pruebas son geometrías/texto controlados, no nuevas capturas reales de Betano.

## Política implementada

`placement` es un metadato opcional del borrador, con estado, fundamento y evidencia
textual. No se añade al esquema de apuestas ni requiere migración.

| Colocación | Evidencia | Registro automático |
| --- | --- | --- |
| `preparation` | Acción Crear/Confirmar/Realizar/Colocar/Hacer apuesta; pendiente de confirmación/colocación/aceptación; apuesta no confirmada o rechazada. | Revisión, cero movimientos. |
| `confirmed` | Mensaje completo de aceptación/colocación, o cashout disponible con importe reconocido por el lector contextual. | Permitido si también pasan las validaciones de estructura, semántica, importes y duplicados. |
| `unknown` | Ausencia de evidencia, botón «Cerrar apuesta» aislado, solo «Pendiente»/«Mis apuestas», mensajes condicionales o señales contradictorias. | Revisión, cero movimientos. |

«Apuesta confirmada si aceptas las cuotas» no es un comprobante: la expresión de
aceptación exige el mensaje completo. Preparación y aceptación/oferta coexistentes
se consideran contradictorias y requieren revisión. Un cashout **ofrecido** prueba
colocación según la evidencia de pantalla, pero no ejecución ni dinero cobrado.

**Colocación y liquidación permanecen separadas.** Una apuesta aceptada con resultado
«Pendiente» se registra normalmente, con un único movimiento de stake y ninguna
liquidación. «Pendiente de confirmación» no puede tomar ese mismo camino. No se deduce
colocación de cuotas, retorno potencial, marcador en vivo o navegación de la página.

`registerCapture` recalcula la colocación desde `parsed.text`; no confía en `placement`,
`confidence`, `cashoutOffer` almacenados ni en el permiso para registrar un duplicado.
La revisión conserva imagen, texto, selecciones e importes y guarda un motivo visible
en la tarjeta existente. No crea casas, apuestas, selecciones financieras, movimientos
ni liquidaciones. Los borradores anteriores sin metadato se pueden procesar cuando
su texto sí contiene evidencia; los registros `saved`/`linked` se conservan intactos.

## Cambios y alcance

| Archivo | Cambio |
| --- | --- |
| `src/ocr/placement.ts` (nuevo) | Clasificación y motivos de revisión independientes del resultado deportivo. |
| `src/ocr/parser.ts` | Metadato de colocación, función para recalcularlo y rótulo cashout anclado. |
| `src/data/captures.ts` | Barrera antes de cualquier alta financiera; guardar evaluación actual en el borrador. |
| `src/test/ocr-placement.test.ts` (nuevo) | 25 pruebas de preparación, confirmación, desconocidos, contradicciones, flujo integrado y compatibilidad. |
| `src/test/captures.test.ts` | Añadir aceptación explícita al texto de su fixture sintético de apuesta ya colocada; se conservan sus 25 pruebas y aserciones. |
| `scripts/ocr-phase1/run.mjs`, `package.json` | Modo independiente `--placement`; expectativas de seguridad explícitas sin reescribir referencias anteriores. |
| `tests/ocr-phase1/README.md`, este informe | Ejecución, evidencia y limitaciones. |

La primera ejecución global tras la barrera detectó 13 fallos en pruebas cuyo fixture
decía únicamente «Boleto de prueba», pese a representar una apuesta colocada. Se
añadió «Apuesta confirmada» al fixture, sin convertir sus aserciones en omisiones
ni permitir que textos desconocidos salten la nueva barrera.

## Resultados

- **435/435 pruebas Vitest**, 18 archivos; ninguna omitida ni declarada fallo esperado.
- TypeScript de aplicación y banco OCR: aprobado. Build: aprobado, con el aviso
  preexistente de bundle mayor de 500 kB. `git diff --check`: aprobado.
- Corpus real: 5 imágenes × 3 repeticiones, dos inyecciones y cinco geometrías.
  Cero discrepancias inesperadas; paridad con/sin instrumentación **5/5**.
- Cero intentos de red externa; registro aislado en fake-indexeddb RAM. Motor,
  reintentos, migraciones, dominio contable, imágenes y transcripciones originales
  permanecen sin cambios. No se despliega ni se ejecutan operaciones cloud.
- El modo estricto devuelve **1** por las cuatro diferencias conocidas:
  **München → Munchen**, **Más/Menos → Mas/Menos**, **Más de 4.5 → Mas de 4.5**,
  **Sí → Si**. No se ocultan ni se presentan como reparadas.

En el corpus, `first-half-corners` pasa de registro automático a revisión por
**colocación desconocida**: no contiene aceptación ni oferta de cashout. Esto no
afirma que la apuesta nunca se colocó. `player-builders` conserva la revisión
semántica de FASE 2.1; los otros tres boletos se guardan. No se pierde información:
cabeceras 5/5 por campo, eventos 12/13, mercados 23/24, picks 22/24, cuotas individuales
13/13, cantidades 18/18 y cashout 4/4, igual que antes.

No se ejecutó `test:e2e`: su configuración selecciona `e2e/cloud.spec.ts`, que usa
credenciales QA, crea usuarios, restaura datos y escribe/elimina registros en Supabase.
Eso excedería la restricción de no modificar datos. No se afirma haber validado
sincronización/RLS de producción. El banco de navegador aislado sí se ejecutó.

## Reproducción y límites

```powershell
npm.cmd test -- --maxWorkers=4
npx.cmd tsc --noEmit
npx.cmd tsc -p tests/ocr-phase1/tsconfig.json
npm.cmd run build
npm.cmd run test:ocr:placement
$env:OCR_REPEATS = '1'
npm.cmd run test:ocr:placement:strict # código 1: cuatro errores literales conocidos
Remove-Item Env:OCR_REPEATS
git diff --check
```

Para reproducir el defecto, extraer el commit base en otra carpeta y copiar solo
`src/test/ocr-placement.test.ts` desde esta revisión; instalar las dependencias y
ejecutar ese archivo con Vitest: 22 fallos / 3 éxitos. Se verificó con `git archive`
y las mismas dependencias mediante una unión local de directorios, sin alterar el
checkout. Los resultados detallados están en `test-results/ocr-placement/` y
`test-results/ocr-placement-strict/`, excluidos de Git. Los informes previos se conservan.

Esta es una clasificación de evidencia OCR, no una consulta de aceptación a Betano.
Una captura recortada, un texto no reconocido o una pantalla mezclada pueden exigir
un nuevo comprobante. No se inventa confirmación para conservar el registro automático.
La interfaz existente muestra el motivo y conserva la captura; no se añade un botón
que permita forzar colocación sin evidencia. No se inicia la FASE 3.
