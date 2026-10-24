# FASE 4A — cobertura real y capturas pendientes

**Actualización 24/10/2026:** este inventario describe las siete imágenes históricas.
El lote posterior tiene 28 admitidas y 1 pendiente; ver
[admisión del issue 1](OCR_PHASE4A_ADMISSION.md). Los huecos aquí listados son los
identificados antes de ese lote, no la cobertura actual.

Revisión visual de los siete PNG y contraste con `cases.json` de FASE 1/3 y
`semantics.json` de FASE 3, sobre `ef709b8`. Sin nueva ejecución de OCR ni cambio de
expectativas. **En esa revisión inicial no se habían recibido capturas nuevas.** Preparación y comandos:
[README 4A](../tests/ocr-phase4a/README.md).

## Inventario contrastado

Los eventos son apariciones en boletos, no partidos únicos. Las hojas cuentan cada
submercado de Builder, sin contar también su contenedor.

| Captura | Eventos / hojas / Builders | Mercados visibles | Escenario visible |
| --- | --- | --- | --- |
| [timed-goal](../tests/ocr-phase1/images/timed-goal.png) | 1 / 1 / 0 | Próximo gol antes de 70:00 (Gol 5) | Simple, en vivo, oferta cashout |
| [player-builders](../tests/ocr-phase1/images/player-builders.png) | 2 / 7 / 2 | Tiros al arco: Nico Paz, Matheus Cunha, Bruno Fernandes, Bryan Mbeumo, Anastasios Douvikas, Harry Kane y Luis Díaz; todos `1+` | Doble, un evento en vivo, iconos de selección y Suplente de Oro, oferta cashout |
| [handicap-combination](../tests/ocr-phase1/images/handicap-combination.png) | 3 / 3 / 0 | Resultado del partido ×2; hándicap resultado del partido `Club Tijuana +3` | Combinada, un evento en vivo, Pago anticipado +2, oferta cashout |
| [first-half-corners](../tests/ocr-phase1/images/first-half-corners.png) | 3 / 3 / 0 | Córners en Primer Tiempo Más/Menos ×3; `Más de 4.5` | Tres eventos en vivo; sin cashout ni aceptación explícita; colocación desconocida |
| [mixed-builders](../tests/ocr-phase1/images/mixed-builders.png) | 4 / 6 / 2 | Resultado, goles de partido, ambos anotan, doble oportunidad, goles de FC Porto, clasifica | Programados, oferta cashout |
| [scorer-builders](../tests/ocr-phase3/images/scorer-builders.png) | 9 / 18 / 5 | Resultado ×4; goles de partido ×6; tarjetas totales ×1; córners ×2; doble oportunidad ×3; goles primer tiempo ×1; anotar en cualquier momento ×1 (Erling Haaland) | Programados, Suplente de Oro/Pago anticipado +2, oferta cashout |
| [eleven-builders](../tests/ocr-phase3/images/eleven-builders.png) | 11 / 19 / 6 | Resultado ×8; goles de partido ×5; tiros al arco de partido ×2; ambos anotan ×1; hándicap `Paris Saint-Germain +2`; doble oportunidad ×2 | Programados, oferta cashout |

Total: **7 imágenes, 33 eventos, 57 hojas, 15 Builders en 4 imágenes**. Una simple y
seis combinadas. Cuatro imágenes tienen juego en vivo (precisión adicional respecto
al resumen de FASE 3). No se modifican aquel informe ni sus oráculos.

Conteo exacto por mercado: resultado 15; doble oportunidad 6; clasifica 1; hándicap
resultado 2; goles de partido sin período explícito 12; goles de equipo 1; goles
primer tiempo 1; ambos anotan 2; próximo gol con límite 1; córners primer tiempo 3;
córners sin período explícito 2; tiros al arco de jugador 7 y de partido 2;
tarjetas totales 1; goleador 1. Las anotaciones humanas asignan **46 partido,
8 jugador, 3 equipo**. Esto no afirma que el intérprete reconozca esos ámbitos.

Períodos: **4 primer tiempo, 53 no especificados**; cero primer período/cuarto,
segundo tiempo u otros períodos y cero rótulos explícitos de partido completo.
Todas las cuotas externas están presentes; los **39 submercados de Builder no
muestran cuota individual**. Esa ausencia ya tiene evidencia real y debe conservarse.
Hay seis ofertas cashout y cero cashouts ejecutados. Ningún boleto tiene etiqueta
explícita de liquidación ni comprobante textual de aceptación; las seis colocaciones
`confirmed` históricas se apoyan en la oferta disponible, no en un comprobante nuevo.

## Huecos exactos dentro del alcance fútbol/NBA

La matriz compara estos mercados objetivo con el corpus, no pretende enumerar el
catálogo completo y cambiante de Betano. Reconocimiento léxico o prueba sintética
no equivale a cobertura real.

| Falta real | Qué debe mostrar la captura solicitada |
| --- | --- |
| NBA, todos los escenarios | Liga/deporte visibles, dos equipos y mercado completo. Prioridad: puntos de partido y de equipo; puntos, rebotes, asistencias, triples y combinaciones de jugador (PRA). También ganador, hándicap, robos/tapones y dobles/triples dobles si están disponibles. |
| Primer período/cuarto frente a primera mitad | NBA con el rótulo literal del primer período/cuarto y otra de primera mitad, participante, línea y cuota. No renombrar el rótulo para adaptarlo al parser. |
| Equipo/jugador en primer tiempo y equipo en tiros/córners/tarjetas | Fútbol con nombre y vínculo al evento legibles; contraste con los mercados de partido. Solo hay goles de equipo y hándicaps; tiros de jugador y goleador sin período explícito. |
| Fútbol sin ninguna hoja real de estas familias | Marcador exacto/descanso-final, asistencias, remates totales/fuera/bloqueados, saques de banda/meta, fueras de juego, atajadas, quites, pases, faltas, posesión, penales y portería a cero. Priorizar remates frente a tiros al arco y tarjetas de jugador/equipo. |
| Variantes aún ausentes de familias cubiertas | Hándicap asiático/negativo/fraccionario; `Menos de`, `No`, goleador primero/último, resultado del primer/segundo tiempo; período completo explícito. No hay estas variantes en las siete imágenes. |
| Bet Builder NBA o con ámbitos/períodos contrastantes | Contenedor, evento, todos los submercados y cuota conjunta completos; jugador/equipo/partido inequívocos. Si no hay cuota individual, dejarla ausente. Builders de fútbol sí están cubiertos. |
| Preparación y aceptación explícita | Cupón previo con acción de colocar/confirmar y recibo posterior con aceptación visible. Pueden ser del mismo boleto, pero se anotan y evalúan de forma independiente, sin transferencia de datos o consentimiento. |
| Liquidaciones | Una Ganada y una Perdida con estado del boleto completo y retorno efectivo cuando sea visible; no basta un icono de una selección. Pendiente explícito también falta. |
| Cashout ejecutado | Estado de cierre/cobro realizado e importe pagado; preferiblemente junto a una captura previa de oferta. Oferta y ejecución siguen siendo dos casos independientes. |
| Evidencia incompleta real | Cuota externa ausente, cabecera/evento recortado o texto ilegible, conservando el defecto original; no recortar deliberadamente para contar una nueva captura real. |

No hace falta un archivo por mercado: una captura puede cubrir varios huecos si es
legible y está completa. Prioridad de recepción: NBA y períodos; preparación frente
a aceptación; Ganada/Perdida/Cashout ejecutado; después variantes de fútbol/Builder.
No se solicita realizar apuestas nuevas: sirven capturas históricas autorizadas.

## Alcance de la entrega

La entrega inicial dejó el manifiesto nuevo vacío. Su suite comprueba inventario, integridad de
16 archivos históricos, contrato de admisión y distinciones semánticas con texto
real existente y controles sintéticos previos separados. No elimina las siete
diferencias literales estrictas ni los problemas de identidad/ámbito de FASE 3.
Las validaciones realizadas y pendientes se resumen en el handoff.
