# FASE 4A — admisión del lote del issue 1

24/10/2026 · [Issue #1](https://github.com/Jozhiky/Bettrack/issues/1).
Registro por candidato, conteos y grupos temporales en
[admission.json](../tests/ocr-phase4a/admission.json); texto literal, expectativas,
cajas y firmas en [cases.json](../tests/ocr-phase4a/cases.json).

| Medida del paquete recibido | Resultado |
| --- | ---: |
| Archivos PNG candidatos recibidos | 29 |
| Imágenes distintas por bytes y por RGBA | 29 |
| Duplicados exactos eliminados / coincidencias de píxeles con FASE 1/3 | 0 / 0 |
| Admitidas / pendientes / rechazadas | 28 / 1 / 0 |
| Grupos conservadores entre admitidas, agrupando los dos pares temporales | 26 |
| Apariciones de eventos / selecciones semánticas admitidas | 71 / 75 |
| Categorías admitidas: fútbol / Builder / liquidadas | 24 / 2 / 2 |

Los 26 grupos **no certifican 26 boletos únicos**: no se publican ni utilizan IDs
privados para establecer identidad. Los grupos de candidatos son 27 contando el
pendiente. No se confunden los 32 archivos del relato anterior a la preparación del
paquete con los 29 que se recibieron y verificaron aquí.

## Verificación y límites

- SHA del ZIP contrastado con el autorizado; CRC de entradas y extracción segura
  fuera del checkout. Los 29 PNG pasan firma, dimensiones, CRC de chunks, metadatos
  permitidos, decodificación y opacidad. La matriz RGBA coincide con el inventario
  de entrada y cada copia publicada conserva exactamente los bytes revisados.
  Los originales privados previos a la anonimización no fueron suministrados: no
  se afirma haber certificado su equivalencia de forma independiente.
- Dos pasadas visuales del mismo asistente: primera transcripción desde PNG y
  segundo cotejo de imagen/texto/valores/regiones, sin Tesseract ni derivación del
  parser. Esto no se presenta como revisión de otra persona. Los nueve borradores
  no se promovieron a oráculos. Se comprobaron las 29 copias; ninguna mostraba
  titular, cuenta, correo, ID de boleto, QR/código de barras, notificaciones ni saldo
  ajeno. Solo las 28 admitidas recibieron firma completa y se copiaron al corpus.
- Los importes y cuotas son los impresos. Las dos pérdidas globales conservan
  cuota global, retorno potencial y retorno realizado `null` donde faltan; no se
  infiere cero. Los ceros bajo «Ganancias potenciales» de otros casos siguen siendo
  potenciales y no convierten un icono de selección en liquidación global.
- Las etiquetas entre corchetes en `transcript` describen iconos o texto tachado;
  no son palabras impresas. Los tabuladores separan columnas. Nombres, tildes,
  etiquetas, cifras, saltos de texto envuelto y texto tachado se conservan. «vs.»
  solo une los dos participantes en el campo estructurado `event`.

## Casos que requieren cuidado

| Caso/grupo | Decisión |
| --- | --- |
| `preparation-flamengo` | **Pendiente**, PNG y borrador fuera de Git. No se ve Betano, aunque `house` y su región son obligatorios; «Crear apuesta» coexiste con «Cerrar apuesta». No se firma casa ni colocación por nombre del archivo o inventario. Pedir una captura más completa con marca y contexto inequívoco; no relajar el contrato. |
| `brugge-builder-early/later` | Dos imágenes, un grupo probable. Mismos tres submercados, importe y cuota; cambian reloj, marcador y check. Ambas mantienen colocación y liquidación desconocidas. |
| `player-four-early/updated` | Dos imágenes, un grupo probable. La primera tiene oferta; la segunda no hereda confirmación ni importe de cashout. Nelson Deossa es la selección vigente y Troy Parrott permanece tachado en el texto original. Checks individuales no prueban Ganada global. |
| `eleven-double-chance` | Admitida en `football`: son once selecciones ordinarias, sin contenedor Builder, pese a la carpeta del inventario de entrada. |
| `first-half-juventus`, `mixed-five-selections` | El segundo cotejo corrigió el borrador a «Más de 2.5» y cuota 1.57 de Inter, respectivamente; las regresiones fijan esos valores visibles. |

## Cobertura añadida y validación

El lote admitido aporta 54 hojas de partido, 9 de equipo y 12 de jugador; 16 tienen
primer tiempo explícito y 59 no especifican período. Hay 19 ofertas de cashout,
21 colocaciones confirmadas (19 ofertas y 2 pérdidas globales) y 7 desconocidas.
Liquidación: 2 `Perdida`, 26 desconocidas. **No se acredita NBA, Ganada global,
cashout ejecutado ni preparación inequívoca** con los casos admitidos.

Con las siete capturas históricas: **35 PNG, 104 apariciones de eventos y 132 hojas**;
son conteos de imágenes/apariciones, no apuestas ni eventos únicos.

Validación local: `test:ocr:phase4a`, suite completa, TypeScript, build y diff.
Las pruebas de admisión comprueban CRC/decodificación, registros y grupos, regiones,
estados independientes y distinciones equipo/partido/jugador. No se ejecutó OCR de
píxeles ni cloud E2E; estos resultados no son una medición de precisión del parser.
Resultados de ejecución actualizados en el [handoff](CODEX_HANDOFF.md).
