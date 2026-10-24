# FASE 4B — resultados de OCR real y priorización

Actualizado: 24/10/2026. Evidencia: ejecución local de Windows aportada por el usuario,
`test-results/ocr-phase4b/report.json` (no publicada por contener transcripciones/trazas).
Banco de medición: [protocolo FASE 4B](../tests/ocr-phase4b/README.md).
No son datos estimados; se obtuvieron del informe de esta única ejecución.

## Estado de la ejecución

- `npm.cmd run test:ocr:phase4b:unit`: **6/6 pruebas sintéticas aprobadas**.
- `npm.cmd run test:ocr:phase4b`: **28/28 imágenes procesadas**, un pase por imagen,
  0 errores de ejecución, ningún intento de red externa y archivos protegidos intactos.
- Entorno: Node v24.22.1, Windows, Chromium 156, 12 hilos lógicos declarados.
- OCR p50: **388.8 ms**; p95 **2499.9 ms** (28 imágenes, una muestra cada una).
- **No consta aún** ejecución posterior de suite completa, TypeScript, build ni
  `git diff --check`. No declarar la PR lista para fusionar.
- `strict=false`: el código de salida 0 significa ejecución realizada, **no
  fidelidad perfecta de OCR**; modo estricto no se ha presentado como aprobado.

## Exactitud observada

| Indicador | Medición |
| --- | ---: |
| Capturas admitidas y medidas | 28 / 28 |
| Grupos conservadores de instantáneas, no boletos únicos | 26 |
| Comprobaciones literales | 1089 |
| Comprobaciones correctas | **1002 (92.01%)** |
| Diferencias | **87** (42 ausentes, 45 erróneas) |
| Capturas exactas en todos sus campos puntuados | **13/28** |
| Capturas con alguna discrepancia | **15/28** |
| Selecciones omitidas | **3** |
| Selecciones adicionales | **0** |
| Confirmaciones falsas de colocación | **0** |
| Ganadas globales atribuidas sin evidencia | **0** |
| Cashouts ejecutados atribuidos sin evidencia | **0** |

El porcentaje global suma campos nulos/ausentes correctamente conservados;
NO equivale a 92% de boletos aceptables o exactitud generalizable. Los 28 casos
son Betano, por lo que **no validan bet365**. Solo hay 2 instantáneas Builder
del mismo grupo probable, con 6 submercados en total, no una muestra amplia.

Referencias por campo:

| Campo | Exactos / total | Observación |
| --- | ---: | --- |
| Casa, tipo, stake, cuota y potencial | 28/28 cada uno | Incluye ausencias correctas |
| Oferta cashout (tipo/importe) | 28/28 cada uno | Oferta != ejecución |
| Colocación | 26/28 | Las dos pérdidas globales quedan unknown |
| Liquidación visible | 26/28 | Las dos pérdidas globales quedan unknown |
| Cantidad de selecciones | 26/28 | Faltan 2+1 en dos instantáneas de 4 jugadores |
| Evento | 61/71 | 8 ausencias, 2 textos incorrectos |
| Mercado | 55/71 | 5 ausencias, 11 incorrectos |
| Pick | 55/71 | 3 ausencias, 13 incorrectos |
| Cuota de selección | 64/71 | 4 ausencias, 3 incorrectas |
| Ámbito (scope) | 62/75 | 3 ausencias, 10 incorrectos |
| Participante | 64/75 | 11 ausencias |
| Período | 72/75 | 3 ausencias |
| Texto de submercados Builder | 12/12 | 2 capturas del mismo grupo |

## Principales fallos, con evidencia del informe

### P0. Liquidación global visible ignorada (4 diferencias de seguridad funcional)

En `lost-single-jablonec` y `lost-double-goals` se lee una cabecera de
boletos ya liquidados, por ejemplo `Simple S/10.00 Perdida`, pero
`parsed.visibleStatus` falta y `placement.status` queda `unknown` cuando
el oráculo verificó `Perdida` y colocación confirmada. Se observan
**2 errores de liquidación + 2 de colocación**.

Hipótesis técnica a reproducir: el detector de `visibleStatus` de
`src/ocr/parser.ts` requiere que «Perdida» ocupe una línea completa; en estas
capturas aparece al final de la cabecera junto a tipo/stake. La clasificación
de colocación de `placement.ts` no usa etiquetas globales de liquidación.
Resolver mediante pruebas con OCR crudo, con guardas contra textos de selección,
y manteniendo liquidación de boleto separada de selecciones con cruces rojas.
No escribir pagos o movimientos automáticamente.

### P0/P1. Jugadores: selección omitida y desplazamientos en combinadas

`player-four-early`: 25 diferencias, **4 esperadas / 2 reconocidas**.

`player-four-updated`: 24 diferencias, **4 esperadas / 3 reconocidas**.

**49 de 87 discrepancias (56.3%)** pertenecen a este par temporal del mismo
grupo probable: no son dos boletos únicos. Jugadores/eventos ausentes,
mercados «anotar o dar asistencia» mal alineados y odds atribuidas a la
selección incorrecta (p.ej. Harry Kane / Luis Suárez / Nelson Deossa).
Es prioritario evitar que una combinada se guarde con selecciones omitidas o
cuotas desplazadas. Conservar revisión humana y todos los motivos de retención
hasta demostrar reconstrucción completa.

`player-kane-mbappe`: 8 diferencias adicionales (Harry Kane sin evento,
mercado, cuota o participante verificable).

### P1. Identidad y ámbito de mercados de jugador

`scorer-oyarzabal`, `mixed-team-match-scorer`,
`player-kane-mbappe`, las dos imágenes `player-four` y algunas selecciones
de equipo muestran scope `unknown` o participante no identificado aunque
el oráculo conoce `player` / `team`. En total: **13 diferencias de ámbito**
y **11 de participante**. No asignar un equipo/jugador por parecido textual
ni autocorregir identidades sin evidencia.

### P2. Diferencias literales y segmentación

`seven-first-half-goals`: 8 diferencias de acentos («Más»→«Mas») sin
pérdida de la cantidad de selecciones; otras ocurren en
`three-first-half-goals`, `lost-double-goals`, etc.
`team-goals-juventus-brighton`: un OCR literal
`Brighton & Hove Albion` → `Brighton €. Hove Albion`.
Algunas divergencias son semánticamente reconocibles; deben mantenerse
como errores de transcripción literal (no cambiar oráculos para fingir
exactitud), y distinguirse de un error que cambia mercado, equipo o cuota.

### Builder

`brugge-builder-early` y `brugge-builder-later` reconocen contenedor y
3 hijos, pero ambos dejan un ámbito de submercado `unknown` frente a
`match` anotado. Dos capturas con un mismo fallo, no evidencia de cobertura
completa de los mercados Builder. 0 selecciones adicionales en el banco.

## Orden recomendado de corrección posterior

1. Crear regresiones para **etiqueta Perdida en cabecera** y colocar/liquidar
   únicamente con evidencia de nivel boleto; vigilar que no se fabrique cobro.
2. Reproducir y corregir **jugadores de 4 selecciones** (omisión,
   realineación y cuotas), con identificación de evento/participante.
3. Mejorar reconocimiento explícito de jugador/equipo/partido sin inventar
   identidades, priorizando `player-kane-mbappe` y `scorer-oyarzabal`.
4. Separar defectos literales (diacríticos/segmentación) de errores de
   significado y documentar ambos.
5. Reejecutar las 28 capturas y los 7 casos históricos existentes, con
   tests nuevos; comparar antes/después sobre **idénticos oráculos y PNGs**.

## Caso pendiente bet365

`preparation-flamengo` fue identificado por el usuario como
**bet365 / Superaumento**. Sigue **no admitido** por falta de evidencia
visual de casa/colocación en una copia autorizada; no participa en estas
28 imágenes. «Cerrar apuesta» expresa oferta de cashout y no liquidación.
No inferir colocación solo a partir de «Crear apuesta».

**Alcance:** esta publicación es solo análisis agregado, sin copiar el
`report.json` completo, imágenes ni datos privados. No modifica motor,
datos históricos, corpus aprobado, Supabase ni Firebase.
