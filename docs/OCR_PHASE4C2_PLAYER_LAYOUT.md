# FASE 4C.2 — Jugadores y cuotas: validación final

Estado: **lista para revisión en PR #4**, sin merge ni despliegue.
Rama `fix/ocr-phase4c2-player-layout`, sobre FASE 4C.1 (PR #3, sobre #2).
Validación local: 24/10/2026. Motor Tesseract, corpus, oráculos humanos, contabilidad,
Supabase y datos históricos sin modificaciones.

## Cuatro regresiones reproducidas y resueltas

| Fallo original | Corrección y límite |
| --- | --- |
| `betano.test.ts:100`: Saint- Germain | La continuación de un título terminado en guion se une sin espacio. Conserva Saint-Germain, sin reescribir identidades. |
| `ocr-phase2.test.ts:190`: Bayern ambiguo como jugador | Identidad exacta por NFC/case/espacios; sin quitar tildes ni aceptar coincidencias parciales. |
| `ocr-phase4a.test.ts:123`: Nico Paz como player | Conserva participante; ámbito unknown y confianza review cuando solo hay un prefijo de nombre. |
| `ocr-phase4c2-player-layout.test.ts:117`: una pasada | Una cuota espacial marcada missing dispara como máximo una segunda pasada mejorada, aunque completeness sea 160. |

Los tres tests históricos se conservaron intactos. Se corrigió la expectativa
sintética nueva de Mbappé: un prefijo no prueba identidad player, conforme al
contrato histórico de Nico Paz/Bayern; ningún oráculo humano cambió.
La suite específica tiene **24 pruebas**, incluyendo identidad NFC/case/espacios,
cuotas ausentes, degradación de nombre/importes/selecciones, pérdida de cashout,
conflicto Nelson Deossa / Troy Parrett y conservación de estados globales.

## Reconstrucción y elección de pasada

- Une únicamente continuaciones que cierran un paréntesis visible, alineadas y
  dentro del umbral geométrico del glifo. Cuotas flotantes requieren una única
  candidata explícita en la región; no se calculan ni toman de otra selección.
- Conserva cuatro selecciones, separando título, club, mercado, evento y cuota.
  Un segundo nombre no clasificado exige revisión; no supone una tachadura ni
  crea una quinta selección.
- Nombre (Club) requiere un club exactamente igual a un participante entre dos
  equipos visibles. El mercado explícito Jugador que anota o da una asistencia
  puede fijar el ámbito; un nombre sin club mantiene la identidad en revisión.
- `completeness` conserva fórmula, umbral 150 y máximo dos pasadas. En empate
  solo se sustituye una pasada completa si recupera cuotas nulas y conserva
  selecciones, cuotas conocidas, cabecera, colocación y motivos no resueltos.
  No se fusionan lecturas. Una puntuación mayor tampoco puede borrar liquidación
  global, preparación o conflicto de colocación observado.

## Validación ejecutada

`npm.cmd run test:ocr:phase4c2` terminó con código 0: **577/577 pruebas**, 26
archivos, `tsc --noEmit`, build y banco real de 28 PNG. Build conserva el aviso
conocido de chunks mayores de 500 kB. Se generó un nuevo informe local
`test-results/ocr-phase4b/report.json` (2026-10-24T07:58:16.923Z).

También aprobaron `tsc -p tests/ocr-phase1/tsconfig.json`,
`tsc -p tests/ocr-phase3/tsconfig.json` y `npm.cmd run test:ocr:phase3`:
7 imágenes × 3 repeticiones, 7 divergencias literales conocidas, ninguna nueva,
paridad sin instrumentación 7/7 e inyecciones de cuota/mercado retenidas para revisión.
`git diff --check` aprobado. No se ejecutó cloud E2E, migraciones ni despliegue.

## Comparación con FASE 4C.1

Baseline local conservado antes de medir: 2026-10-24T07:29:29.549Z.
Comparación exacta por **id + repetición + campo + ruta + expected**, contrastando
actual antes/después, sin tolerancias nuevas: **59 campos recuperados, 0 regresiones**.
Mismos 28 ids y 1089 expectativas. Un error cambia de cuota mal asignada a null;
los otros 23 errores remanentes conservan exactamente su actual anterior.

| Métrica | 4C.1 | 4C.2 |
| --- | ---: | ---: |
| PNG medidos / grupos conservadores | 28 / 26 | 28 / 26 |
| Checks correctos | 1006/1089 (92.38%) | 1065/1089 (97.80%) |
| Diferencias | 83 (42 ausentes, 41 incorrectas) | 24 (1 ausente, 23 incorrectas) |
| Imágenes sin diferencias | 14/28 | 16/28 |
| Selecciones omitidas / adicionales | 3 / 0 | 0 / 0 |
| Falsas confirmaciones / victorias / cashouts ejecutados | 0 / 0 / 0 | 0 / 0 / 0 |
| Fallos de ejecución | 0 | 0 |
| p50 / p95 OCR (ms) | 417 / 2585 | 428 / 1874 |

Tiempos de una ejecución, no prueba de aceleración general. Grupos temporales no
certifican boletos únicos. Las 24 discrepancias siguen visibles en modo estricto;
no se afirma precisión OCR total.

### Resultado por imagen

Checks correctos sobre el total; ningún caso añade ni omite selecciones ahora.

| ID público | 4C.1 | 4C.2 | Pasadas |
| --- | ---: | ---: | ---: |
| lost-single-jablonec | 21/21 | 21/21 | 2 |
| lost-double-goals | 29/32 | 29/32 | 2 |
| team-shots-bournemouth | 21/21 | 21/21 | 1 |
| first-half-lech | 21/21 | 21/21 | 1 |
| first-half-juventus | 21/21 | 21/21 | 1 |
| first-half-bournemouth | 21/21 | 21/21 | 1 |
| total-goals-hoffenheim | 21/21 | 21/21 | 1 |
| team-goals-real-madrid | 21/21 | 21/21 | 1 |
| scorer-oyarzabal | 19/21 | 21/21 | 1 |
| failed-leg-juventus | 21/21 | 21/21 | 1 |
| goal-before-60-first | 21/21 | 21/21 | 1 |
| goal-before-60-second | 21/21 | 21/21 | 1 |
| team-goals-juventus-brighton | 30/32 | 30/32 | 1 |
| high-goal-lines | 32/32 | 32/32 | 1 |
| double-winners | 32/32 | 32/32 | 1 |
| player-kane-mbappe | 24/32 | 31/32 | 1 |
| three-first-half-goals | 41/43 | 41/43 | 1 |
| three-first-half-second | 43/43 | 43/43 | 1 |
| failed-leg-three-goals | 41/43 | 41/43 | 1 |
| three-team-goals | 42/43 | 42/43 | 1 |
| mixed-five-selections | 64/65 | 64/65 | 1 |
| mixed-team-match-scorer | 62/65 | 64/65 | 1 |
| seven-first-half-goals | 79/87 | 79/87 | 1 |
| player-four-early | 29/54 | 53/54 | 2 |
| player-four-updated | 30/54 | 54/54 | 1 |
| eleven-double-chance | 131/131 | 131/131 | 1 |
| brugge-builder-early | 34/35 | 34/35 | 1 |
| brugge-builder-later | 34/35 | 34/35 | 1 |

### Discrepancias investigadas

- **player-four-early:** de 2/4 a 4/4 selecciones. Harry Kane conserva cuota null.
  La segunda pasada lee 2.30 pero cambia Kylian por Kyllan y pierde oferta cashout
  y evidencia de colocación. Se rechaza; no se sacrifica una identidad por una cuota.
  El 1.40 anterior era una cuota mal asignada, no evidencia válida de Harry Kane.
- **player-four-updated:** de 3/4 a 4/4; 54/54 checks. Nelson Deossa / Troy Parrett
  sigue como motivo explícito de revisión. Exactitud del comparador no elimina
  esa ambigüedad ni autoriza registrar automáticamente.
- **player-kane-mbappe:** 31/32; título/club/cuota de Kane reconstruidos. Mbappé
  conserva el nombre pero scope unknown/review frente a player del oráculo.
- **Brugge early/later:** sin cambios; 34/35 cada una. Persiste un ámbito match
  desconocido en un submercado. Se mantienen las ofertas, no cashouts ejecutados.
- **Las dos Perdidas:** sin cambios, 21/21 y 29/32. Sus estados y colocación siguen
  correctos; las tres diferencias de la doble son tildes en mercado/pick.
  La suite de frontera mantiene el bloqueo sin apuestas pendientes ni movimientos.
- **Distribución total restante:** 19 discrepancias literales (9 mercados, 9 picks, 1 evento), más los
  4 ámbitos (Mbappé, Brighton y dos Builders) y la cuota ausente descritos arriba.
  Oyarzabal y el goleador del boleto mixto recuperan dos campos cada uno.

## Integridad y publicación

El ejecutor verificó los SHA-256 de **28 PNG contra los casos** y **15 activos
OCR contra el lock**. Corpus y admisiones tienen las mismas huellas que 4C.1;
comparación de activos idéntica. Ningún cambio runtime de archivos protegidos,
ninguna petición externa: `protectedFilesUnchanged=true`, `networkAttempts=[]`.
FASE 1/3, `legacy.lock.json`, modelos y corpus 4A permanecen intactos.

Las trazas, informes completos y comparación detallada permanecen únicamente en
`test-results/` (ignorado), con baseline en `ocr-phase4c2-baseline/` y comparación
por campo en `ocr-phase4c2-comparison.json`. Solo se publica este resumen y código.
No publicar PNG originales, rutas privadas, identificadores de boletos ni secretos.
bet365 Flamengo sigue fuera del corpus de 28. PR #2/#3/#4 siguen separadas;
revisión aprobable del cambio no equivale a merge ni despliegue.
