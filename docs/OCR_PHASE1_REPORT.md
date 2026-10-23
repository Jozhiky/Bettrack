# BETTRACK — Entrega FASE 1: corpus, mediciones y regresiones

Fecha: 22/10/2026. Alcance: exclusivamente evidencia reproducible y medición sobre la implementación existente. No se implementó la FASE 2.

## Archivos creados y modificados

| Archivo o carpeta                        | Finalidad                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `tests/ocr-phase1/cases.json`            | Transcripciones esperadas independientes, etiquetas y procedencia.                     |
| `tests/ocr-phase1/images/`               | Cinco capturas reales desidentificadas; 295.615 bytes en conjunto.                     |
| `tests/ocr-phase1/controlled.ts`         | Cinco escenarios de geometría controlada, separados de las imágenes reales.            |
| `tests/ocr-phase1/quality.ts`            | Evaluación por campo, cantidades, omisiones y diferencias exactas.                     |
| `tests/ocr-phase1/timing.ts`             | Medición exclusiva de fases y control de anidación.                                    |
| `tests/ocr-phase1/browser.ts`            | Ejecución del código existente, fallos controlados y registro en base temporal en RAM. |
| `tests/ocr-phase1/known-failures.json`   | Fallos revisados con valores concretos, sin aceptación automática.                     |
| `tests/ocr-phase1/assets.lock.json`      | SHA-256 de los modelos, worker y WASM de referencia.                                   |
| `tests/ocr-phase1/tsconfig.json`         | Comprobación TypeScript del banco de pruebas.                                          |
| `tests/ocr-phase1/README.md`             | Reproducción, privacidad, metodología y límites.                                       |
| `scripts/ocr-phase1/run.mjs`             | Ejecución portátil, medición, comparación y reporte JSON.                              |
| `scripts/ocr-phase1/instrumentation.mjs` | Instrumentación en memoria exclusiva del servidor de pruebas.                          |
| `scripts/ocr-phase1/import-reviewed.mjs` | Importación de PNG revisados sin metadatos innecesarios, sin alterar píxeles.          |
| `src/test/ocr-phase1.test.ts`            | 34 pruebas nuevas, incluidas tres que expresan defectos conocidos.                     |
| `docs/OCR_PHASE1_BASELINE.json`          | Evidencia de referencia, entorno, hashes, tiempos y diferencias por campo.             |
| `package.json`                           | Dos comandos nuevos; ninguna dependencia añadida.                                      |

Los informes detallados de ejecución y trazas se generan en `test-results/ocr-phase1/`, ignorado por Git. No contienen credenciales ni dependen de rutas privadas del equipo original para ejecutarse.

También se añadieron dos enlaces al README principal para localizar este informe y las instrucciones de reproducción.

## Protección de las funcionalidades actuales

- No se modificaron el motor OCR, el parser de producción, las migraciones, los esquemas de dominio ni la contabilidad.
- No se conectó el banco a Supabase ni a Firebase; no se crearon usuarios, apuestas ni movimientos en producción.
- El registro ejecuta el repositorio existente contra fake-indexeddb en memoria, destruido después de cada caso.
- Cero intentos de conexión a servicios externos durante la ejecución de referencia.
- Las huellas de los archivos protegidos permanecieron iguales antes y después.
- Una segunda ejecución sin instrumentación produjo exactamente los mismos datos y decisiones de registro en las cinco capturas.
- No hubo despliegue ni cambios de configuración cloud.

## Corpus y cobertura

Cinco imágenes reales, 13 selecciones externas y 11 mercados internos:

| Caso                   | Contenido                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `timed-goal`           | Simple: próximo gol antes de un minuto específico, ordinal del gol, oferta cashout.                                 |
| `player-builders`      | Doble normalizada como Combinada; dos Builders, siete selecciones de tiros al arco 1+, suplente e iconos de estado. |
| `handicap-combination` | Tres eventos, hándicap +3, pago anticipado y horarios.                                                              |
| `first-half-corners`   | Tres mercados de córners en primer tiempo; retorno visible distinto del producto redondeado.                        |
| `mixed-builders`       | Combinada de cuatro, dos Builders, goles de partido y de equipo, ambos anotan, doble oportunidad y Clasifica.       |

Se agregan cinco geometrías construidas a mano y dos casos que inyectan fallos en la salida OCR de una imagen real. Estos casos NO se incluyen en la tasa de acierto de imágenes reales.

No hay una captura real validada de un mercado desconocido en este corpus inicial. Su comportamiento se evalúa con una etiqueta experimental explícita; no se atribuye esa etiqueta al catálogo oficial de Betano.

Las imágenes no muestran identificadores del titular. Se conservan participantes deportivos públicos e importes necesarios para la prueba; los PNG no contienen metadatos textuales, de ubicación o de cuenta. No se sintetizaron ni alteraron los píxeles.

## Pruebas ejecutadas

| Verificación                                    | Resultado                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd test -- --maxWorkers=4`                | 15 archivos; 323 pruebas aprobadas y 3 fallos esperados, total 326. Las 292 anteriores se conservan.                |
| `npx.cmd tsc -p tests/ocr-phase1/tsconfig.json` | Sin errores.                                                                                                        |
| `npm.cmd run test:ocr:baseline`                 | Sin desviaciones frente a los fallos revisados; 15 lecturas reales, dos inyecciones y cinco geometrías controladas. |
| Comparación sin instrumentación                 | Cinco imágenes con resultados y registro idénticos.                                                                 |
| Compilación de producción                       | Correcta; permanece el aviso existente de tamaño del bundle principal.                                              |

“Fallo esperado” no significa defecto corregido ni prueba omitida: el contrato deseado se ejecuta y hoy falla. Si deja de fallar, Vitest exige revisar esa declaración. El modo `test:ocr:strict` considera cualquier discrepancia un resultado no satisfactorio, incluso si está documentada como conocida.

El modo estricto se ejecutó adicionalmente con una repetición por imagen: devolvió el código 1 esperado por los defectos conocidos, con cero desviaciones nuevas y equivalencia sin instrumentación 5/5. Sus resultados están separados en `test-results/ocr-phase1-strict/`.

La compilación final conserva los bundles principales `index-Ukk8j5sL.js` e `index-d_H9Ybut.css`, iguales a los anteriores a esta fase. El banco de pruebas no se incorpora al frontend publicado.

## Métricas de referencia

Referencia: Windows, AMD Ryzen 5 5600G, 12 hilos lógicos, Chromium 156.0.8078.4, Node 24.22.1. Cinco imágenes × tres repeticiones, trabajador reutilizado, ejecución secuencial. Inicialización del trabajador: 185,6 ms, reportada aparte.

| Etapa                   | Mediana (P50), ms | P95, ms |
| ----------------------- | ----------------: | ------: |
| Preprocesamiento        |              48,2 |    69,3 |
| OCR                     |             764,8 | 1.092,3 |
| Reconstrucción          |               0,3 |     1,5 |
| Interpretación          |               0,2 |     2,2 |
| Validación Zod          |               0,3 |     2,7 |
| Registro aislado en RAM |               2,8 |    24,1 |

La lectura completa `readCapture` varió aproximadamente entre 296 y 1.161 ms en esta muestra. Las cinco imágenes se resolvieron con una pasada principal cada una; las llamadas adicionales internas al motor, como el logo, están incluidas en OCR.

Con cuota retirada y mercado desconocido, cada caso ejecutó dos pasadas principales y cuatro llamadas internas al OCR: aproximadamente 1.204 y 1.228 ms respectivamente. Ambos terminaron en revisión. Es evidencia de que repetir OCR completo no resuelve por sí mismo estos fallos estructurales.

Los tiempos de registro no son latencia de Supabase. Los valores submilisegundo están cerca de la resolución del temporizador y deben interpretarse como órdenes de magnitud. Quince muestras no constituyen un SLA ni una predicción para móviles. La instrumentación conserva los límites de las funciones actuales, que todavía mezclan responsabilidades.

## Calidad por campo en las cinco capturas reales

Se cuenta cada imagen una vez, no tres veces. La coincidencia admite NFC y espacios; no elimina tildes, signos ni calificadores.

| Campo                  | Correctos / evaluados | Coincidencia |
| ---------------------- | --------------------: | -----------: |
| Casa                   |                 5 / 5 |        100 % |
| Tipo                   |                 5 / 5 |        100 % |
| Stake                  |                 5 / 5 |        100 % |
| Cuota total            |                 5 / 5 |        100 % |
| Retorno visible        |                 5 / 5 |        100 % |
| Evento                 |               12 / 13 |       92,3 % |
| Mercado                |               23 / 24 |       95,8 % |
| Selección              |               22 / 24 |       91,7 % |
| Cuota individual       |               13 / 13 |        100 % |
| Promoción anotada      |               10 / 10 |        100 % |
| Oferta cashout visible |                 4 / 4 |        100 % |

Mercado y selección incluyen las 13 filas externas y 11 submercados. No faltó ninguna selección externa en las cinco imágenes sin manipulación. Se preservó el retorno original; no se generó ninguna liquidación por una oferta de cashout.

Estas son métricas de coincidencia con una transcripción, no probabilidades de confianza ni una tasa universal de comprensión semántica. Dos de cinco boletos coinciden completamente; los otros tres tienen las diferencias ortográficas descritas abajo.

## Casos que fallan

| Caso                                | Fallo observado                                                                          | Registro aislado                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| Real: `player-builders`             | München → Munchen en un evento.                                                          | Guardado.                                   |
| Real: `first-half-corners`          | Más/Menos → Mas/Menos y Más de 4.5 → Mas de 4.5.                                         | Guardado.                                   |
| Real: `mixed-builders`              | Sí → Si en un submercado.                                                                | Guardado.                                   |
| Inyección: `missing-odds`           | Desaparece la primera selección: quedan 2 de 3; se desplazan las posiciones.             | Revisión, sin apuesta ni movimiento nuevos. |
| Inyección: `unknown-market`         | Se vacían evento y mercado de la selección afectada.                                     | Revisión.                                   |
| Geometría: `unknown-market`         | La etiqueta desconocida se mezcla con las filas de equipos y el evento queda vacío.      | Revisión.                                   |
| Geometría: `unknown-builder-market` | Dos submercados pasan a tres; la etiqueta desconocida se convierte en selección interna. | Revisión.                                   |
| Geometría: `missing-odds`           | Se pierde una de dos selecciones.                                                        | Revisión.                                   |

Los cuatro errores de transcripción en imágenes reales son de tildes o diéresis; no se identificó un cambio numérico o de período en esas imágenes. Los defectos estructurales se evidencian en los escenarios controlados. No se confunden esas dos categorías en las conclusiones.

## Recomendaciones priorizadas, sin implementarlas todavía

1. **P0 — Conservar bloques aun sin cuota:** la evidencia controlada confirma que usar la cuota como único inicio de selección provoca omisiones.
2. **P0 — Separar estructura y catálogo:** una etiqueta desconocida no debe convertirse en equipo ni en otro submercado.
3. **P1 — Evitar reintentos completos ante fallos semánticos:** instrumentar la causa del rechazo permitirá elegir reinterpretación o relectura localizada. Mantener el comportamiento actual hasta aprobar la siguiente fase.
4. **P1 — Ampliar evidencia real:** agregar capturas con mercados realmente no catalogados, resoluciones menores y formatos distintos; conservar las correcciones humanas como regresiones.
5. **P2 — Tratar explícitamente diferencias ortográficas:** no corregir nombres o selecciones mediante sustituciones globales; mantener el original y evaluar cualquier normalización con este corpus.
6. **P2 — Medir otras condiciones:** móviles, lotes y latencia cloud requieren otro experimento autorizado. La presente referencia solo mide reconocimiento local y registro aislado.

La FASE 1 queda entregada como infraestructura de prueba y referencia. No se avanzó a cambios de reconocimiento, persistencia o lógica financiera.
