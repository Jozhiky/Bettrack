# BETTRACK — FASE 2 del reconocimiento OCR

Fecha: 22/10/2026. Implementación local sobre el repositorio existente, sin despliegue.

Los **tres fallos esperados de la FASE 1 están corregidos** mediante pruebas ordinarias obligatorias. También se reparan las dos inyecciones de fallos sobre OCR real. **379 pruebas pasan; ninguna está omitida ni declarada como fallo esperado.** TypeScript y compilación pasan.

El reconocimiento literal de las cinco imágenes conserva cuatro errores ortográficos conocidos. No se presentan como corregidos: el modo estricto sigue fallando por ellos. Los mercados desconocidos conservan su texto y requieren revisión; una cuota ausente permanece `null`.

## 1. Evidencia y causas raíz verificadas

Se leyeron completos `OCR_PHASE1_REPORT.md`, `OCR_PHASE1_BASELINE.json` y `tests/ocr-phase1/README.md`; se inspeccionaron motor, agrupación espacial, parser, vocabulario, reintentos, validación, registro y pruebas existentes. Antes de editar se reprodujeron las 34 pruebas de la FASE 1: 31 aprobadas y tres fallos esperados.

| Causa comprobada | Evidencia anterior | Corrección |
| --- | --- | --- |
| `parseBetanoLayout` iniciaba bloques exclusivamente donde había cuota | `missing-odds` retenía una de dos selecciones; la inyección real retenía dos de tres | Conservar el primer bloque; reconocer títulos externos por separación, columna y estructura siguiente. Las cuotas siguen siendo evidencia útil, pero no el único inicio. |
| La primera fila ajena al catálogo se tomaba como equipo | `unknown-market`: evento y mercado vacíos; inyección real con el mismo defecto | Separar posiciones estructurales y vocabulario. Con un patrón de tres filas, retener etiqueta + dos participantes como borrador sujeto a revisión. Si falta evidencia, no completar el evento. |
| Toda fila desconocida dentro de Builder se convertía en un nuevo pick | `unknown-builder-market` convertía dos submercados en tres | Prioridad a viñetas y relación pick/etiqueta. Una etiqueta desconocida debajo del pick se conserva provisionalmente como mercado y exige revisión. |
| La normalización era desigual | `markets.ts` plegaba diacríticos, `classifyMarket` solo convertía a minúsculas; la familia puntos no reconocía «Puntos en Primer Período» | Reutilizar normalización de etiquetas y añadir interpretación por atributos, manteniendo intactos los textos originales. |
| Cadenas no vacías y cuota individual nullable podían superar Zod aunque faltara interpretación | El esquema permite `odds: null`; no había una barrera de registro para motivos semánticos explícitos | Validación de entrada a `registerCapture`: motivos de revisión y cuotas ausentes conservan el borrador sin crear apuesta ni movimiento. |

Durante el desarrollo, la primera regla de separación por distancia dividió un Builder real en exceso. El banco de imágenes lo detectó; se añadió la comprobación de columna y se volvió a ejecutar el corpus. Ese fallo no se convirtió en una excepción aceptada.

## 2. Arquitectura y comportamiento resultante

El flujo sigue siendo Canvas → Tesseract.js local → filas geométricas → bloques Betano → interpretación → validación → registro. **No se modificaron `engine.ts`, modelos, `readCapture.ts`, sesiones OCR ni concurrencia.**

`semantics.ts` es una función pura separada de la extracción visual. Devuelve texto original, familia, estadística, ámbito, participante, período, operador, umbral y confianza por atributo. Ejemplos comprobados:

- Primer tiempo y primer período permanecen distintos. Un período no indicado queda `unspecified`, no se presume partido completo.
- Goles y córners de equipo se separan de totales del partido; remates y tiros al arco son estadísticas distintas.
- `1+`, `Más de`, `Menos de`, `Sí/Si` y el signo del hándicap no se equiparan entre sí.
- Los minutos y ordinales de «Próximo gol antes de 70:00 (Gol 5)» permanecen en el original; no se convierten en un total numérico de goles.
- Puntos del primer período se reconocen sin afirmar que el deporte sea NBA. El deporte solo se etiqueta si se aporta explícitamente.
- No se utiliza eliminación de tildes para unir identidades. `Bayern München`, `Bayern Munchen`, `Bayer München` y `Bayern München II` no se sustituyen entre sí.
- Un prefijo como «Nico Paz» se conserva, pero sin padrón o evidencia explícita su tipo queda desconocido. No se transforma automáticamente en equipo ni se identifica un jugador por parecido.

Los atributos son **metadatos de borrador**, no nuevas columnas ni reglas de liquidación. Las selecciones persistidas mantienen su esquema anterior. La confianza es una etiqueta de evidencia, no una probabilidad calibrada. Los campos recuperados siguen siendo candidatos a revisar; los motivos estructurales explícitos y las cuotas ausentes bloquean el registro automático. No se afirma que toda etiqueta perteneciente a una familia esté semánticamente comprendida en su totalidad.

Las cuatro situaciones de liquidación siguen siendo pendiente, ganada, perdida y cashout. Un texto «Cashout ejecutado» se reconoce como estado visible sujeto a confirmación. Una oferta no genera liquidación. Las pruebas verifican que incluso un estado visible ganado/perdido/ejecutado se registra pendiente hasta una acción explícita de liquidación.

## 3. Archivos creados y modificados

| Archivo | Finalidad |
| --- | --- |
| `src/ocr/betano.ts` | Recuperación de bloques sin cuota, separación estructural, viñetas Builder, conservación de etiquetas desconocidas y motivos de revisión por campo. |
| `src/ocr/semantics.ts` **nuevo** | Interpretación conservadora por atributos, independiente de imágenes, almacenamiento y contabilidad. |
| `src/ocr/markets.ts` | Normalización reutilizable y cobertura contextual de puntos. |
| `src/ocr/parser.ts` | Incorporación de interpretaciones y confianza de borrador; reconocimiento explícito de estado visible de cashout. |
| `src/data/captures.ts` | Barrera de revisión previa al registro; no cambia fórmulas, importes ni métodos de liquidación. |
| `src/test/ocr-phase2.test.ts` **nuevo** | 51 pruebas de estructura, significado, normalización, identidades y confirmación de resultados. |
| `src/test/captures.test.ts` | Dos pruebas nuevas: cuota ausente en borradores sin metadatos nuevos y preservación de apuestas/datos financieros anteriores. |
| `src/test/ocr-phase1.test.ts` | Los tres `it.fails` pasan a contratos ordinarios. Los cinco controles exigen el resultado deseado exacto. |
| `src/test/betano.test.ts` | La cuota aislada sigue sin asociarse indebidamente; ahora también se exige conservar la selección con cuota nula. |
| `src/test/market-coverage.test.ts` | Las tres etiquetas desconocidas deben conservarse en revisión, en lugar de convertirse en cadenas vacías. |
| `tests/ocr-phase1/controlled.ts` | Exportación del constructor de filas para pruebas adicionales. No cambia los cinco casos originales. |
| `scripts/ocr-phase1/run.mjs` | Modo FASE 2 que exige corregir los cinco defectos estructurales y mantiene las diferencias literales conocidas. Salidas independientes para modo estricto. |
| `scripts/ocr-phase1/compare-phase2.mjs` **nuevo** | Generación reproducible de métricas, comparación contra referencia, comprobación de hashes, límites del alcance y regresiones. |
| `package.json` | Comandos de auditoría FASE 2, modo estricto y comparación. Ninguna dependencia nueva. |
| `README.md`, `tests/ocr-phase1/README.md` | Enlaces y distinción entre referencia histórica y contratos actuales. |
| `docs/OCR_PHASE2_METRICS.json`, este informe **nuevos** | Entregables técnicos y evidencia agregada. |

Los archivos de la FASE 1 que ya estaban sin commit se conservaron. No se modificaron sus imágenes, resultados esperados, catálogo de fallos históricos ni JSON de referencia. Cuatro expectativas antiguas se actualizaron porque exigían el comportamiento defectuoso de borrar información; se sustituyeron por comprobaciones más estrictas de conservación y revisión, no por pruebas omitidas.

## 4. Comparativa de precisión

### Defectos estructurales

Las cifras son discrepancias por campo con alineación ordinal, no número de defectos independientes: omitir una selección desplaza las siguientes.

| Caso reproducible | Discrepancias antes | Después | Registro después |
| --- | ---: | ---: | --- |
| Geometría: mercado desconocido | 2 | 0 | Revisión |
| Geometría: mercado desconocido en Builder | 4 | 0 | Revisión |
| Geometría: cuota ausente | 9 | 0 | Revisión, 2/2 selecciones |
| OCR real con mercado sustituido | 2 | 0 | Revisión |
| OCR real con cuota retirada | 15 | 0 | Revisión, 3/3 selecciones |

Los tres contratos de aceptación pasan **3/3**. Los dos casos inyectados también pasan **2/2**. En los cinco casos no se crea apuesta, movimiento ni liquidación mientras requieren revisión. Se preservan los datos recuperables, no se inventan cuotas.

### Cinco imágenes reales sin inyección

| Campo | FASE 1 | FASE 2 |
| --- | ---: | ---: |
| Casa, tipo, stake, cuota total y retorno — cada campo | 5/5 | 5/5 |
| Evento | 12/13 | 12/13 |
| Mercado, incluidos submercados | 23/24 | 23/24 |
| Pick, incluidos submercados | 22/24 | 22/24 |
| Cuota individual | 13/13 | 13/13 |
| Promociones | 10/10 | 10/10 |
| Oferta cashout | 4/4 | 4/4 |
| Cantidades de bloques/submercados | 18/18 | 18/18 |

No hay regresión en estos campos. Siguen presentes `München → Munchen`, `Más/Menos → Mas/Menos`, `Más de 4.5 → Mas de 4.5` y `Sí → Si`. Las pruebas demuestran interpretación tolerante de etiquetas y operadores, pero **no se aumenta artificialmente la coincidencia literal eliminando tildes del evaluador**. No existía una métrica de atributos semánticos en FASE 1; no se inventa un porcentaje antes/después para esa nueva capa.

## 5. Comparativa de tiempos

Mismo corpus, modelos y equipo AMD Ryzen 5 5600G; Chromium 156.0.8078.4, Node 24.22.1. Cinco imágenes × tres repeticiones secuenciales; trabajador reutilizado. Milisegundos exclusivos, respetando los límites instrumentados de la FASE 1.

| Etapa | P50 antes | P50 después | P95 antes | P95 después |
| --- | ---: | ---: | ---: | ---: |
| Preprocesamiento | 48,2 | 35,8 | 69,3 | 58,9 |
| OCR | 764,8 | 703,3 | 1092,3 | 1003,3 |
| Reconstrucción | 0,3 | 0,3 | 1,5 | 1,7 |
| Interpretación | 0,2 | 0,3 | 2,2 | 2,2 |
| Validación Zod | 0,3 | 0,2 | 2,7 | 2,7 |
| Registro aislado en RAM | 2,8 | 2,3 | 24,1 | 14,0 |

No se atribuye la variación general de OCR/preprocesamiento a una optimización del motor: esos archivos no cambiaron y existe variabilidad de ejecución. No se suman percentiles ni se presentan como latencia de Supabase.

| Inyección, una muestra por caso | Lecturas principales antes → después | `readCapture` antes → después |
| --- | --- | --- |
| Cuota ausente | 2 → 1 | 1204,3 → 572,4 ms |
| Mercado desconocido | 2 → 1 | 1228,4 → 568,8 ms |

La mejora verificable es evitar una segunda lectura completa en esos dos casos: al conservar la estructura, la evaluación de completitud existente deja de rechazar el bloque. El registro sigue exigiendo revisión. No se cambió la política de reintentos ni se añadió un servicio multimodal. La relectura mejorada explícita sigue disponible. Estas dos muestras no permiten prometer una reducción universal del 50 % ni resultados equivalentes en móviles.

## 6. Verificaciones ejecutadas

| Verificación | Resultado |
| --- | --- |
| Suite completa Vitest | **379/379**, 16 archivos, cero fallos esperados, omitidos o pendientes. |
| `tsc --noEmit` | Aprobado. |
| TypeScript del banco `tests/ocr-phase1/tsconfig.json` | Aprobado. |
| `npm run build` | Aprobado; persiste el aviso de bundle principal mayor de 500 kB. |
| Auditoría OCR FASE 2 | Aprobada: 15 lecturas reales, dos inyecciones, cinco geometrías; cero desviaciones inesperadas. |
| Paridad sin instrumentación | 5/5, datos y decisiones de registro idénticos. |
| Comparador FASE 1/2 | Aprobado; verifica corpus, modelos, dependencias, hashes y límite de archivos de producción. |
| Modo literal estricto, una repetición | **No aprobado, código 1**, por los cuatro errores ortográficos documentados. Los cinco defectos estructurales presentan cero discrepancias. |
| `git diff --check` | Aprobado. |

El CSS principal mantiene `index-d_H9Ybut.css`; esta fase no rediseña pantallas. El JavaScript sí cambia por las reparaciones. No se ejecutaron E2E autenticados ni pruebas contra datos cloud: el navegador de auditoría bloquea servicios externos, sustituye Supabase por un objeto que falla ante cualquier acceso y registra únicamente en fake-indexeddb en RAM. Cero intentos de red externa. No hubo despliegue, commit ni push.

La prueba nueva con una apuesta previamente guardada compara apuestas, selecciones, movimientos, liquidaciones, casas y auditoría antes/después de una captura ambigua. Un ticket ya guardado tampoco se reescribe si llega una nueva lectura con dudas. Los hashes confirman que dominio, repositorio contable, migraciones y motor OCR permanecen intactos.

## 7. Reproducción

Los modelos locales y Chromium deben estar preparados según el README de FASE 1. Desde la raíz, en PowerShell:

```powershell
npm.cmd test -- --maxWorkers=4 --reporter=default --reporter=json --outputFile=test-results/ocr-phase2/unit-tests.json
npx.cmd tsc --noEmit
npx.cmd tsc -p tests/ocr-phase1/tsconfig.json
npm.cmd run build
npm.cmd run test:ocr:phase2

$env:OCR_REPEATS = '1'
npm.cmd run test:ocr:phase2:strict
$strictExit = $LASTEXITCODE
Remove-Item Env:OCR_REPEATS
Write-Output "Código estricto: $strictExit" # Actualmente 1, por las cuatro diferencias literales.

npm.cmd run test:ocr:compare
git diff --check
```

El comparador genera `docs/OCR_PHASE2_METRICS.json`; exige los reportes normal, estricto y de Vitest. Las trazas y reportes detallados se guardan en `test-results/ocr-phase2/` y `test-results/ocr-phase2-strict/`, excluidos de Git. Si cambia el código de producción después de medir, el comparador exige repetir la medición.

## 8. Riesgos, limitaciones y siguientes prioridades

1. **Estructura ambigua:** varias filas desconocidas envueltas, ausencia simultánea de cuota y separadores, o formatos diferentes pueden seguir requiriendo revisión. Se conserva el texto completo en el borrador; no se garantiza asignar todas las filas a roles sin evidencia. Ampliar fixtures antes de inferir nuevos límites.
2. **Identidad y deporte:** no hay padrón de equipos/jugadores ni identificación multimodal. La asociación a participantes del evento es contextual al formato; deportes individuales requieren contexto explícito. Los nombres no se autocorrigen ni fusionan por tildes.
3. **Cobertura real:** cinco imágenes de fútbol. NBA y algunos operadores están probados con texto/geometría controlados; falta un corpus real anonimizado de esos boletos. Tampoco hay una imagen real anotada de un mercado verdaderamente desconocido: se distingue de las inyecciones.
4. **Precisión literal:** cuatro pérdidas de diacríticos permanecen. Una futura corrección debe conservar evidencia original y diferenciar ortografía de identidad, sin reemplazos globales.
5. **Confirmación de desconocidos:** la interfaz existente muestra la razón de revisión; esta fase no añade un editor semántico ni confirmación individual de atributos. Un mercado no interpretado no pasa a apuesta confirmada por rellenar simplemente un texto.
6. **Latencia cloud y lotes:** no medidas aquí. No inferir mejoras de sincronización a partir de tiempos de registro en RAM. Para optimizaciones posteriores, medir lotes/dispositivos antes de cambiar concurrencia o reintentos.

No se requieren dependencias de pago ni acceso externo para ejecutar la auditoría una vez instalados los recursos locales.
