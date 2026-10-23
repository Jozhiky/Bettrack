# BETTRACK — FASE 3: capturas reales y revisión segura

Fecha: 23/10/2026. Base: `d54d5eb52651da13809e9c623fac054ad01a402a`.

Se amplió el corpus, se corrigió una reconstrucción errónea de Bet Builder y se
implementó revisión explícita con trazabilidad. **464/464 pruebas pasan**. Los
errores de reconocimiento pendientes permanecen visibles; no se afirma cobertura
universal ni sincronización cloud validada.

## 1. Evidencia y causas verificadas

**Relectura que borraba incertidumbre de colocación.** Se añadieron primero dos
pruebas: una primera lectura con «Crear apuesta» y otra con «Pendiente», seguidas
de una lectura del mismo archivo con cashout disponible. En la base, ambas acababan
en `saved` en vez de `review`. `registerCapture` sustituía el borrador sin retener
la evidencia previa. Las dos pruebas fallaron antes de corregir producción
(`test-results/ocr-phase3/retry-before.json`, evidencia local excluida de Git).

Ahora `placementHold` conserva el texto que justificó la retención. Una relectura
no autoriza el registro automático. También se comprueban otras cargas de los
mismos píxeles, incluidos archivos renombrados y copias en cola. Preparación o
evidencia contradictoria exige **otra imagen**. Si antes no se podía determinar
la colocación y se recupera evidencia positiva, se exige cotejo humano explícito.

En la revisión de endurecimiento se reprodujeron otros dos fallos de borradores
incompletos/legados: la validación de una selección final rechazaba campos vacíos,
por lo que podía perderse también su evidencia de colocación. Se separó el esquema
de borrador del de registro, y la lectura de evidencia histórica del resto de sus
campos. Las dos regresiones fallaron antes de esa corrección y ahora pasan
(`test-results/phase3-incomplete-before.log`). La validación final no se relajó.

**Último Builder interpretado como otro partido.** La nueva imagen
`eleven-builders.png` contiene 11 eventos. Su primera salida real de Tesseract
contiene `© Real Madrid`: la viñeta naranja fue reconocida como copyright.
`parseBetanoLayout` reconocía `O`, `o`, `○`, `◯`, pero no `©`. La selección interna
se convertía en el evento 12, perdiéndose la agrupación de sus dos mercados.
La prueba con la traza real falló **11 esperado / 12 obtenido** antes del cambio
(`test-results/phase3-bullet-before.log`). Se añadió ese glifo a la detección de
viñeta y se reutiliza la misma decisión al manejar líneas partidas. No se deducen
cuotas ni nombres. La prueba pasa y el OCR completo reproduce la reparación.

No cambió el motor, los modelos, las fórmulas, los esquemas ni las migraciones.

## 2. Flujo implementado

- Motivos separados: falta de evidencia de colocación, OCR incompleto, mercado o
  participante ambiguo, cuota ausente y posible duplicado.
- **Mejorar lectura:** vuelve a leer los mismos píxeles y conserva las retenciones.
- **Añadir comprobante de apuesta:** crea otra captura con vínculo en auditoría;
  conserva el borrador original. No transfiere aceptación, importes ni selecciones
  entre imágenes. Rechaza los mismos píxeles como supuesto comprobante nuevo.
- **Revisar datos:** disponible cuando existe evidencia reconocida de colocación
  y no una retención por preparación. Permite transcribir evento, mercado,
  selección y cuota individual, también dentro de Builders. No permite omitir o
  añadir selecciones, ni modificar casa/stake/cuota total/retorno de la cabecera.
- Vista previa con captura, todos los mercados, promociones, importes, bono cuando
  exista, fecha de carga y estado inicial **Pendiente**. Una casilla sin marcar
  exige declarar el cotejo y la colocación. Volver a editar revoca la aceptación.
- Se verifica que borrador, imagen y estado sigan vigentes. Un cambio recibido
  mientras se revisa invalida la confirmación; el backend de repositorio vuelve a
  comprobarlo dentro de la transacción. Doble envío no duplica el stake.
- Los textos semánticamente desconocidos se guardan como etiquetas cotejadas por
  una persona, sin inventar atributos. Auditoría conserva texto OCR anterior,
  correcciones, imagen, fecha, consentimiento, importes y decisión de guardado o
  duplicado. No se ejecuta una liquidación ni se cobra una oferta cashout.

La decisión de reutilizar `uploads.draftJson` y `audit.before/after` se documentó
**antes** de implementar en [OCR_PHASE3_DESIGN.md](OCR_PHASE3_DESIGN.md). No hizo
falta un esquema nuevo. La atribución de la auditoría usa el aislamiento por cuenta
existente; no se presenta como un registro inmutable contra manipulación del dueño.

## 3. Muestra real y límites de cobertura

Se revisaron los archivos locales realmente disponibles: su contenido había cambiado
respecto a algunos adjuntos históricos, por lo que no se asumió identidad por nombre.
Se incorporan **dos capturas reales sin datos personales visibles**, eliminando
metadatos PNG y preservando píxeles. Se excluyó una tercera con ID de boleto.

| Tipo | Imágenes únicas |
| --- | ---: |
| Total fútbol real | 7 (5 anteriores + 2 nuevas) |
| Simple | 1 |
| Combinadas | 6 |
| Con Bet Builder, subconjunto de combinadas | 4 |
| Cashout ofrecido, evidencia de colocación | 6 |
| Colocación desconocida | 1 |
| Señal visible de juego en vivo | 1 |
| Preparación / aceptación explícita / liquidación explícita / cashout ejecutado | 0 |
| NBA real | 0 |

Son **33 eventos externos y 57 selecciones semánticas**. Hay equipo, jugador,
partido, goles, córners, tiros al arco, goleador, hándicap y primer tiempo. Remates
distintos de tiros al arco y NBA mantienen únicamente cobertura sintética en las
pruebas existentes. Las siete capturas no muestran etiqueta de liquidación global:
se evalúa su ausencia como desconocida, no como reconocimiento de «Pendiente».

## 4. Precisión: base frente a FASE 3

Referencia: código del commit base extraído mediante `git archive`, con el mismo
corpus ampliado y el mismo ejecutor. No se copió código productivo nuevo al baseline.
Modelos, píxeles y dependencias iguales; diferencias LF/CRLF del lockfile verificadas
sin ignorar cambios de contenido. Calidad contada una vez por imagen.

| Campo | Base | FASE 3 |
| --- | ---: | ---: |
| Casa, tipo, stake, cuota total, retorno (cada uno) | 7/7 | 7/7 |
| Oferta cashout | 6/6 | 6/6 |
| Evento, coincidencia literal | 30/33 | 30/33 |
| Mercado, etiquetas externas e internas | 69/72 | 71/72 |
| Selección, etiquetas externas e internas | 67/72 | 69/72 |
| Cuota individual recuperada | 33/33 | 33/33 |
| Conteos externos e internos | 38/40 | 40/40 |
| Promociones anotadas | 22/23 | 23/23 |
| Estadística semántica | 55/57 | 57/57 |
| Ámbito semántico | 43/57 | 45/57 |
| Participante semántico cuando aplica | 8/11 | 8/11 |
| Período explícito | 4/4 | 4/4 |
| Estado de colocación, incluyendo desconocido | 7/7 | 7/7 |

En total, **300/314 → 307/314 comprobaciones literales**. No es una probabilidad
de acierto en producción: mezcla campos con tamaños de muestra distintos.
Las cuotas 33/33 no ocultaban el error estructural: había un evento extra sin
cuota en la base, detectado por conteo y por el veto de registro.

Se conservan 12 ámbitos desconocidos y tres participantes sin extraer semánticamente.
De los 8 nombres semánticos correctos, solo **1** tiene identidad marcada como
reconocida; los otros 7 nombres de jugadores permanecen para revisión. No se equipara
extraer un nombre con verificar su identidad. La ausencia de período explícito
se conserva correctamente en 53/53 selecciones; esto no acredita partido completo.

Guardado automático **3/7 → 4/7**; el aumento proviene exclusivamente de recuperar
la estructura del boleto de 11 eventos. Siguen en revisión `player-builders`,
`first-half-corners` y `scorer-builders`. Las nuevas pruebas manuales no se mezclan
con el porcentaje de automatización del OCR.

## 5. Rendimiento observado

Tres ejecuciones por imagen: **21 muestras de tiempo por versión**, un worker local
reutilizado. Otro pase sin instrumentación verifica igualdad de parser y registro:
7/7 imágenes en ambas versiones. Sin red externa ni tiempos de Supabase.

| Etapa, ms | Base p50 / p95 | FASE 3 p50 / p95 |
| --- | ---: | ---: |
| Preprocesamiento | 59.1 / 294.3 | 74.8 / 172.3 |
| OCR | 914.4 / 3911.5 | 1052.4 / 2290.7 |
| Reconstrucción | 0.7 / 2.6 | 1.0 / 2.6 |
| Interpretación | 0.7 / 2.9 | 0.8 / 5.9 |
| Validación | 0.3 / 0.8 | 0.2 / 0.8 |
| Registro RAM | 1.5 / 4.4 | 3.5 / 6.7 |

`eleven-builders`: **4220.4 → 2469.9 ms p50**, 2 → 1 pasadas en las tres
repeticiones. El segundo OCR completo dejó de ser necesario al recuperar la
estructura correcta en el primero. No se relajó el criterio de completitud.
La mediana agregada OCR empeoró, así como varios casos sin cambios: no afirmamos
aceleración general, significancia estadística ni mayor rendimiento de lotes.
El registro local añade comprobaciones de evidencia entre capturas idénticas.
El informe JSON contiene tiempos por captura y etapa, entorno y denominadores.

## 6. Verificaciones ejecutadas

| Verificación | Resultado |
| --- | --- |
| Suite completa Vitest | **464/464**, 21 archivos, ninguna omitida |
| Regresiones nuevas | 29: seguridad/revisión 25, UI 3, traza real 1 |
| TypeScript aplicación | Aprobado |
| TypeScript harness FASE 1 y FASE 3 | Aprobados |
| OCR base ampliado, 3 repeticiones | Coincide exactamente con fallos documentados |
| OCR FASE 3, 3 repeticiones | Sin diferencias imprevistas; 7/7 paridad sin instrumentación |
| OCR estricto FASE 3, 1 repetición | **Falla con código 1**: siete discrepancias literales conocidas |
| Modo anterior `--placement`, 1 repetición | Aprobado; cuatro discrepancias históricas conservadas |
| UI aislada 375 / 768 / 1440 px | Sin desbordamiento; consentimiento, cierre Escape y registro simulado comprobados |
| Build de producción | Aprobado; advertencias de tamaño de chunks y tiempo del plugin PWA |

No se ejecutó el E2E cloud existente. UI con acciones simuladas y repositorio con
IndexedDB falso no prueban RLS, Storage ni sincronización entre dispositivos.
Para eso se necesitaría un proyecto QA independiente, usuarios y datos sintéticos,
y limpieza acotada; queda pendiente de autorización específica para ese entorno.

## 7. Archivos y compatibilidad

- `src/ocr/betano.ts`: viñeta `©`, sin cambiar texto original ni fórmulas.
- `src/ocr/review.ts`: lectura validada del borrador y motivos de revisión.
- `src/data/captures.ts`: retención de evidencia, comprobante independiente,
  confirmación explícita atómica, controles de duplicados y auditoría.
- `src/components/CapturePending.tsx`, `CaptureReview.tsx`, `src/styles.css`:
  acciones diferenciadas, cotejo, vista previa y adaptación móvil.
- `src/test/ocr-review.test.ts`, `capture-review-ui.test.tsx`,
  `ocr-phase3-real.test.ts`: defectos reproducidos, confirmación segura, stale UI,
  historial preservado, rechazos sin movimientos y traza OCR real.
- `tests/ocr-phase3/`: dos PNG, oráculos visuales/semánticos, traza real,
  discrepancias base/actuales explícitas, fixture visual, configuración TS y README.
- `scripts/ocr-phase1/{run,import-reviewed}.mjs`: extensión opcional de corpus;
  preserva modos/oráculos históricos. `scripts/ocr-phase3/`: comparador y UI aislada.
- `package.json`: comandos de auditoría, sin dependencias nuevas.
- `docs/OCR_PHASE3_DESIGN.md`, `OCR_PHASE3_METRICS.json` y este informe.

Los campos nuevos son metadatos opcionales dentro del borrador existente. No se
reescribieron apuestas, imágenes históricas, contabilidad, migraciones ni referencias
anteriores. Las capturas ya guardadas no se vuelven a registrar. No hubo despliegue
Firebase ni operaciones de datos contra Supabase de producción.

## 8. Errores pendientes y prioridades

1. **Identidad/ámbito**: siete jugadores aún requieren cotejo; el goleador del nuevo
   Builder no extrae participante semántico y las tarjetas totales quedan con ámbito
   desconocido. No inferir desde un diccionario de nombres. Ampliar evidencia real
   autorizada antes de generalizar. Hándicaps conservan nombre y signo en `pick`,
   pero no los separan en `participant`; `Clasifica` no normaliza ámbito. Estos
   casos mantienen las reglas selectivas de la base, no una certificación semántica.
2. **Siete diferencias estrictas**: las cuatro históricas `München→Munchen`,
   `Más/Menos→Mas/Menos`, `Más de 4.5→Mas de 4.5`, `Sí→Si`; y las nuevas
   `VfB→VFB`, `Sí→SÍ`, `Milán→Milan`. Conservar el texto y cotejar nombres;
   no normalizar identidades silenciosamente para elevar porcentajes.
3. **Evidencia insuficiente**: el boleto de córners sin comprobante sigue retenido.
   La revisión no inventa aceptación. Comprobantes adicionales se procesan separados;
   todavía no hay fusión asistida de dos imágenes del mismo boleto.
4. **Cobertura**: faltan imágenes reales desidentificadas de preparación, aceptación
   explícita, resultados globales, cashout ejecutado, remates y NBA. Las pruebas
   sintéticas existentes siguen pasando, pero no sustituyen esos ejemplos.
5. **Rendimiento y cloud**: medir lotes y Storage en QA aislado antes de prometer
   mejoras globales. La cabecera financiera ausente y eventos omitidos todavía
   requieren otra imagen; no se habilita edición ilimitada para sortear controles.
