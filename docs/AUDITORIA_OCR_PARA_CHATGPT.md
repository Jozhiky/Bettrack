# BETTRACK — Auditoría del reconocimiento de apuestas y plan de mejora

Fecha: 22/10/2026.

Documento preparado para compartir en ChatGPT en navegador. Resume la auditoría del código local de `D:\Apuestas`. Las rutas citadas son relativas al repositorio; este documento no adjunta el código ni concede acceso a la aplicación o a Supabase.

## 1. Contexto y objetivo

BETTRACK es una aplicación existente para registrar y seguir apuestas deportivas a partir de capturas, principalmente de Betano. El usuario quiere subir imágenes, permitir que el sistema registre automáticamente los boletos claros y después marcar cada apuesta como ganada, perdida o cashout, indicando el importe recibido cuando corresponda.

La aplicación usa React, TypeScript y Vite, está publicada en Firebase Hosting y persiste los datos de negocio en Supabase. El OCR se ejecuta localmente en el navegador. No se propone reconstruir la aplicación ni volver a almacenamiento local como fuente principal de datos.

Objetivo de la mejora: aumentar precisión, velocidad, mantenibilidad y cobertura de mercados sin perjudicar lo que ya funciona.

### Restricciones vigentes

- Mantener los tipos de apuesta Simple y Combinada; conservar la estructura interna de los Bet Builders.
- Mantener los estados Pendiente, Ganada, Perdida y Cashout.
- Separar cashout ofrecido de cashout ejecutado. Una oferta visible no es dinero cobrado.
- Conservar el texto extraído y la captura como evidencia; no inventar equipos, períodos, mercados, fechas ni importes.
- Conservar todas las selecciones de una combinada, incluso cuando alguna no pueda clasificarse.
- Los datos ambiguos deben quedar para revisión, sin tratarse como hechos confirmados.
- No introducir APIs de pago ni créditos temporales como dependencia esencial.
- Cualquier uso externo de imágenes o visión multimodal debe ser opcional y explícitamente habilitado.
- No modificar la base de datos, apuestas existentes ni lógica financiera sin analizar el impacto y obtener autorización del usuario.

La primera entrega solicitada fue un diagnóstico basado en el código y un plan por fases. Durante esa auditoría no se modificaron código, datos, apuestas ni lógica financiera.

## 2. Resultado principal

La principal debilidad está en cómo se interpreta y separa el boleto después del OCR. El código mezcla la identificación de mercados con la separación de equipos y selecciones. Por eso, añadir más expresiones resuelve algunos tickets, pero deja abierta la misma causa de futuros errores.

Se inspeccionó el flujo del repositorio y se ejecutó:

```text
npm.cmd test -- --maxWorkers=4

14 archivos de pruebas aprobados
292 pruebas aprobadas
```

Estos resultados corresponden a la suite local ejecutada durante la auditoría. No constituyen una nueva validación de producción, una nueva ejecución completa del OCR sobre imágenes reales ni una garantía de cobertura de todos los mercados.

## 3. Flujo actual identificado

| Etapa | Implementación actual | Observación |
|---|---|---|
| Carga | `src/data/captures.ts`: validación, SHA-256, cola y almacenamiento | Ya evita repetir OCR cuando la imagen corresponde a una apuesta registrada. |
| Compresión | `src/ocr/optimize.worker.ts`: WebP sin pérdida y comparación de píxeles | Es una protección útil que conviene conservar. |
| Preprocesamiento | `src/ocr/engine.ts`: ampliación, contraste, inversión y ocultación de iconos | Utiliza parámetros generales para capturas de tamaños diferentes. |
| OCR | Tesseract.js 7.0.0, español e inglés, WebAssembly | Reconocimiento local en navegador. |
| Estructura | `src/ocr/layout.ts` y `src/ocr/betano.ts`: coordenadas, filas, cuotas y bloques | Depende de posiciones y de reconocer etiquetas de mercados. |
| Interpretación | `src/ocr/markets.ts`, `src/ocr/parser.ts` y adaptadores | Predominan expresiones regulares; no existe todavía una representación semántica completa. |
| Validación y guardado | Zod → `registerCapture` → repositorio → Supabase | Comprueba estructura e importes, pero la confianza no gobierna el guardado. |
| Presentación | `src/pages/Bets.tsx` y `src/components/CapturePending.tsx` | Permite reintentar y ver texto, pero no localizar visualmente cada campo ambiguo. |

## 4. Tecnología OCR y modelos reales

El motor utiliza Tesseract.js 7.0.0 en modo LSTM, con idiomas español e inglés. El script de preparación descarga `spa.traineddata` y `eng.traineddata` de `tessdata_fast` y los sirve junto con los recursos WebAssembly desde `/ocr`.

No se encontró un modelo multimodal ni un modelo de lenguaje interpretando los boletos. Tesseract aporta texto, posiciones y confianza; las reglas de la aplicación aportan la interpretación.

Referencias de código:

- `src/ocr/engine.ts:65`: creación del reconocedor.
- `scripts/prepare-ocr.mjs:8`: descarga de modelos.
- `package.json`: versión de Tesseract.js.

Referencia primaria externa: [repositorio oficial tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast).

El script descarga desde la rama `main`, sin fijar revisión ni verificar una huella del modelo. Conviene fijar ambos para reproducibilidad. La auditoría identificó la configuración y procedencia declarada por el código; no certificó la revisión exacta de los pesos desplegados en producción.

## 5. Problemas prioritarios y causas

### 5.1. Un mercado desconocido puede romper la estructura

En apuestas normales, la primera línea que no coincide con un mercado pasa a considerarse parte de los equipos. En Bet Builders, puede convertirse en otra selección interna con mercado vacío.

Esto explica por qué una frase legible termina provocando “selecciones incompletas”. La estructura depende demasiado de reconocer previamente la etiqueta.

Evidencia: `src/ocr/betano.ts:112`, especialmente la separación de mercados y equipos a partir de `isMarketLine`.

### 5.2. La detección de selecciones depende demasiado de las cuotas

Los bloques comienzan en filas con una cuota reconocida. Si falta una cuota, una selección puede quedar absorbida por otro bloque o ausente de la lista estructurada.

Se conserva el texto OCR general, pero eso no garantiza conservar cada selección como entidad.

Evidencia: `src/ocr/betano.ts:97`.

### 5.3. Reconocer una familia no equivale a entender el mercado

Por ejemplo, remates y tiros al arco están dentro de una misma familia léxica. El texto se conserva, pero faltan atributos independientes para distinguir estadística, participante, período y línea.

También hay dos mecanismos de clasificación: el catálogo ampliado y una clasificación genérica más limitada. Esto aumenta el riesgo de comportamientos distintos según el camino de interpretación utilizado.

Evidencia: `src/ocr/markets.ts:12` y `src/ocr/parser.ts:46`.

### 5.4. La confianza actual no impide confirmar datos ambiguos

Solo se asignan niveles generales a casa, stake, cuota y retorno. Los importes presentes se marcan como `review`, pero `registerCapture` puede guardarlos si pasan las validaciones estructurales.

Tampoco existe confianza individual por equipo, selección o submercado. Una advertencia de baja confianza no equivale a un control efectivo del guardado.

Evidencia:

- `src/ocr/parser.ts:207`: asignación de confianza.
- `src/data/captures.ts:115`: validación previa al registro automático.

### 5.5. “Mejorar lectura” puede repetir trabajo sin resolver la causa

Se ejecuta una segunda lectura completa y se escoge el resultado con mayor puntuación de completitud. No se comparan contradicciones por campo ni se combinan evidencias de forma controlada.

Si el fallo es una etiqueta desconocida, cambiar el contraste no necesariamente ayuda. La puntuación de completitud no es una medida de exactitud semántica.

Evidencia: `src/ocr/readCapture.ts:19`.

### 5.6. Falta un corpus portable completo

Hay pruebas de texto y geometría, además de scripts con capturas reales. Sin embargo, estos últimos dependen de archivos como `D:/richa/bet (...).png` y se ejecutan aparte.

Falta un conjunto anonimizado, versionado y con resultados esperados por campo. Las correcciones humanas se convierten manualmente en pruebas; el sistema no aprende de ellas automáticamente.

Las pruebas de etiquetas de otros deportes no acreditan por sí solas la lectura de capturas reales de esos deportes.

Evidencia:

- `scripts/verify-expanded-markets.mjs:22`.
- `src/test/market-coverage.test.ts`.
- `src/test/ocr-retry.test.ts`.

## 6. Arquitectura propuesta

Evolucionar los módulos existentes separando responsabilidades:

```text
Captura
  → Texto, coordenadas y evidencia visual
  → Boleto con todos sus bloques y selecciones
  → Interpretación mediante atributos de mercado
  → Validación por campo, selección y boleto
      → Registro automático de casos claros
      → Revisión localizada de datos ambiguos
```

Cada campo conservaría:

- Texto extraído sin sustituirlo por una etiqueta normalizada.
- Región de la imagen de donde procede.
- Procedencia y versión del reconocimiento.
- Confianza de lectura y certeza de interpretación diferenciadas.
- Alternativas y contradicciones cuando existan.
- Confirmación humana, cuando corresponda.

La captura seguiría siendo la referencia visual. El texto OCR puede contener errores y no debe confundirse con una transcripción humana certificada.

La estructura del boleto debe conservarse aunque no sepamos clasificar un mercado. “No clasificado” sería una condición del reconocimiento, sin introducir nuevos estados financieros.

## 7. Normalización de mercados por atributos

| Atributo | Representación propuesta |
|---|---|
| Deporte y evento | Identificados con evidencia; desconocidos cuando falte información. |
| Participante y ámbito | Partido, equipo o jugador, con su nombre separado. |
| Estadística | Goles, córners, remates totales, tiros al arco, atajadas, asistencias, etc. |
| Período | Primer tiempo, segundo tiempo, intervalo, set o período visible; sin completar por defecto. |
| Operador y línea | Más de, menos de, al menos, hándicap, rango o línea dividida. |
| Selección | Valor elegido y texto original. |
| Relaciones | Bet Builder con sus mercados internos, sin aplanarlos. |

Ejemplo conceptual:

```text
Texto visible: Haris Tabakovic Tiros al Arco
Selección visible: 1+

Participante: Haris Tabakovic
Ámbito: jugador
Estadística: tiros al arco
Operador: al menos
Umbral: 1
Período: desconocido si no aparece
Promoción: con suplente, separada y sujeta a validación del icono
```

Deben distinguirse explícitamente:

- Goles totales del partido y goles de un equipo.
- Partido y primer tiempo u otros períodos.
- Córners totales y córners de equipo.
- Remates o tiros totales y tiros al arco.
- Atajadas del arquero.
- Hándicaps, conservando signo, modalidad y líneas divididas.
- Goleadores y asistencias.
- Próximos goles, incluyendo ordinal y límite temporal cuando aparezcan.
- Mercados internos del Bet Builder y la cuota del bloque exterior.

Goleadores, próximos goles y hándicaps necesitan atributos específicos. No conviene forzarlos todos a un único campo numérico. Los valores desconocidos deben permanecer explícitos, sin asumir partido completo o participante por defecto.

## 8. Validación y experiencia de revisión

El registro automático debe mantenerse para los casos claros. Cuando haya ambigüedad, la revisión mostraría únicamente el campo pendiente junto a su recorte, conservando el resto del boleto.

No tendría sentido obligar al usuario a completar nuevamente toda la apuesta.

La validación propuesta debe comprobar:

- Coherencia de importes y cuotas sin sustituir el retorno visible por un cálculo.
- Cantidad de selecciones externas frente al encabezado.
- Conservación de todos los submercados de Bet Builder.
- Datos faltantes, roles ambiguos y contradicciones entre lecturas.
- Separación de fecha del boleto, fecha de evento y fecha de carga.
- Separación de resultado de una selección y resultado del boleto completo.
- Separación de cashout ofrecido y ejecutado.

Un mercado legible pero todavía no clasificado debe poder conservarse en el borrador. Una selección ambigua no debe inventarse ni desaparecer para hacer que el boleto pase la validación.

## 9. Duplicados

Conservar los hashes existentes y la opción de registrar otra operación.

La comparación semántica actual también compara ignorando la fecha. Sirve como advertencia, pero puede señalar apuestas distintas que comparten eventos, mercados, stake y cuota. No debe convertirse en una fusión automática.

Evidencia: `src/data/captures.ts:188` y `src/domain/model.ts:238`.

La mejora debe distinguir entre:

1. Archivo idéntico: reutilizar evidencia y evitar OCR redundante cuando sea posible.
2. Otra captura del mismo boleto: sugerir vinculación, apoyándose en identificador visible si existe.
3. Otra operación con selecciones similares: permitir conservarla como apuesta independiente.

No inventar identificadores ni usar fechas inferidas para afirmar identidad.

## 10. Rendimiento, almacenamiento y costos

Ya existen reutilización de trabajadores OCR y concurrencia de uno o dos procesos según características del dispositivo.

Las siguientes mejoras deben centrarse en evitar lecturas completas innecesarias:

- Medir por separado preparación, carga, OCR, interpretación y guardado.
- Reintentar regiones problemáticas en vez de todo el boleto cuando sea viable.
- Reinterpretar el texto ya obtenido cuando el fallo sea semántico.
- Comparar alternativas por campo, sin aceptar silenciosamente contradicciones.
- Reutilizar resultados identificando imagen y versión del reconocedor.
- Ajustar concurrencia después de medir memoria, latencia y estabilidad en móvil y escritorio.
- Mantener la compresión sin pérdida y la verificación de píxeles existentes.

No se promete una reducción porcentual de tiempo sin una medición inicial comparable.

La visión multimodal quedaría como una evaluación posterior, opcional y medida contra los mismos casos. No se introduciría una dependencia de pago ni envío externo de capturas sin habilitación explícita. Tampoco se asumiría que añadir un modelo resuelve por sí solo los problemas de estructura y validación.

## 11. Plan de implementación por fases

| Fase | Trabajo | Criterio para avanzar |
|---|---|---|
| 1. Evidencia reproducible | Anonimizar capturas reales, documentar resultados por campo y medir tiempos por etapa. | Casos correctos, fallidos y correcciones humanas reproducibles. |
| 2. Separación estructural | Extraer bloques y conservar selecciones aunque falten cuota o clasificación. Ejecutar en paralelo al parser actual, sin guardar resultados nuevos. | Ningún bloque visible desaparece silenciosamente; discrepancias identificadas. |
| 3. Normalización semántica | Incorporar atributos y reglas composicionales con valores desconocidos explícitos. | Diferenciar mercados y mantener todas las regresiones anteriores. |
| 4. Confianza y revisión | Validaciones por campo, selección y boleto; detectar contradicciones entre lecturas. | Los datos ambiguos no pasan como confirmados. |
| 5. Compatibilidad y persistencia | Revisar contratos, exportaciones, restauración y validadores de Supabase. | Propuesta de impacto aprobada antes de modificar persistencia o datos. |
| 6. Rendimiento y despliegue gradual | Reintentos por región, reutilización de resultados y ajuste de concurrencia según mediciones. | Comparación de precisión y latencias habituales y lentas, sin regresiones. |

Las correcciones humanas deben incorporarse como casos de regresión revisados, conservando entrada, salida esperada y motivo de la corrección. No deben convertirse en sustituciones globales de texto sin pruebas.

## 12. Impacto financiero y límites de autorización

Guardar una apuesta también genera el movimiento que reserva su stake. Por eso, flexibilizar el guardado de boletos incompletos podría afectar los balances.

La nueva interpretación debe probarse primero como borrador independiente. Se conservarán los cuatro estados actuales y la separación entre oferta de cashout y cashout ejecutado.

Evidencia: `src/data/repository.ts:151`, donde se guarda la apuesta y se crea el movimiento `Apuesta colocada`.

Antes de cualquier cambio de persistencia se deben revisar:

- Esquemas Zod de apuestas, selecciones y borradores.
- Exportación e importación en `src/data/transfer.ts`.
- Repositorio y sincronización de `src/data/cloudStore.ts`.
- Contratos y validadores de las migraciones de Supabase.
- Compatibilidad con registros existentes, aislamiento por usuario y control de versiones de los cambios.

No se asume que añadir atributos a JSON elimine la necesidad de revisar esos contratos. Tampoco se propone reescribir automáticamente apuestas antiguas.

## 13. Estado de esta entrega

- Auditoría del código local realizada.
- Suite local: 292 pruebas aprobadas en 14 archivos.
- Diagnóstico y plan presentados.
- Ninguna de las mejoras propuestas se implementó durante la auditoría.
- No se modificaron datos de producción ni lógica financiera.
- No se realizó un nuevo despliegue ni una nueva validación completa de imágenes en producción.

Este archivo documenta la propuesta; no autoriza por sí mismo modificaciones de base de datos, apuestas existentes o contabilidad.
