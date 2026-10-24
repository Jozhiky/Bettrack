# FASE 4C.2 — Reconstrucción de jugadores, cuotas flotantes y nombres alternativos

Estado: **implementación propuesta; pruebas y medición OCR real pendientes**.
Rama `fix/ocr-phase4c2-player-layout`, basada en FASE 4C.1.
Sin despliegue, migraciones, modificaciones de apuestas, oráculos ni corpus.

## Evidencia examinada

El usuario adjuntó **tres archivos locales de trazas OCR**:
`player-four-early.raw.json`, `player-four-updated.raw.json`,
`player-kane-mbappe.raw.json`. Se examinaron líneas, coordenadas y
dos pasadas (normal y contraste aumentado). Las trazas originales, que pueden
contener datos delicados de apuestas, **no se han publicado en GitHub**.

- Las cuatro selecciones están representadas por filas visibles, pero
  `Harry Kane (FC Bayern` aparece en una fila y `Munchen)` en otra.
  La cuota `2.30` aparece como un badge independiente entre las dos filas
  en la pasada mejorada, mientras la primera pasada puede omitirla.
- `Troy Parrott (Real Betis` / `Balompié)` también ocupa dos filas;
  la cuota `1.55` puede aparecer en una fila independiente.
- En la captura actualizada se leen tanto `Nelson Deossa` como
  `Troy Parrett`, este último debajo del primero. La traza OCR **no
  demuestra que exista tachadura** ni decide el jugador de una apuesta:
  la segunda cadena se conserva como **texto ambiguo con revisión humana**.
- En la doble Kane/Mbappé, `Harry Kane (FC Bayern` / `Munchen)`
  y una cuota flotante `1.88` generan el mismo defecto.

## Cambios previstos y límites de seguridad

1. `src/ocr/betano.ts`: une solo una continuación que cierre un
   paréntesis iniciado, esté alineada con el título y se encuentre dentro
   de un umbral relacionado con el tamaño del glifo. Adjunta una **cuota
   explícitamente vista** únicamente cuando hay una sola candidata en esa
   región. Nunca calcula, interpola ni traslada la cuota de otra selección.
2. Se recuperan límites entre selecciones por mercado y separación
   espacial, conservando cuota nula en ausencia de lectura verificable.
3. Cuando hay un segundo nombre no clasificado antes del mercado, se
   mantiene el título principal y el nombre adicional como motivo de
   revisión **obligatoria**, sin asignarle otra cuota ni inventar evento.
4. `src/ocr/semantics.ts`: reconoce el ámbito de **jugador** cuando el
   pick contiene `Nombre (Club)` y el club coincide exactamente con
   uno de los participantes visibles del encuentro. Identifica el mercado
   `Jugador que anota o da una asistencia` como `scorer-or-assist`;
   preserva nombres OCR literalmente. En tiros al arco con nombre prefijo,
   mantiene la identidad marcada para revisión si no hay prueba adicional.
5. `src/test/ocr-phase4c2-player-layout.test.ts`: seis casos sintéticos
   con coordenadas, fragmentación, cuota ausente, reintento enriquecido,
   sustitución ambigua, doble Kane/Mbappé y club sin prueba.
6. `package.json`: comando único sin acceso cloud para todas las pruebas
   unitarias, TypeScript, build y banco OCR aislado.

El objetivo no es alcanzar el 100% por fuerza. Si la segunda pasada o la
fuente carece de `2.30`, debe persistir `null` y solicitar revisión.
Ninguna foto de este corpus se usa para inferir un ticket como ganado.

## Validación — un solo comando

Desde la copia local en Windows:

    git status --short
    git fetch origin
    git switch --track origin/fix/ocr-phase4c2-player-layout
    npm.cmd run test:ocr:phase4c2

Si la rama ya existe: `git switch fix/ocr-phase4c2-player-layout` y
`git pull --ff-only`. El comando ejecuta **la suite completa**, TypeScript,
build y OCR sobre los mismos 28 PNG; falla inmediatamente si una fase falla.
**No ejecuta `test:e2e` ni `deploy:firebase`.**

Después adjuntar únicamente el
`test-results/ocr-phase4b/report.json` y, si surge un fallo de consola,
su salida de error. No enviar las capturas originales a GitHub ni a CI.

### Línea base para comparar

FASE 4C.1: **1006/1089 checks**, **83** discrepancias (42 ausentes y
41 incorrectas), **14/28** capturas exactas, **3** selecciones omitidas,
**0** adicionales, **0** confirmaciones/victorias/cashouts ejecutados
sin evidencia, p50 417 ms y p95 2585 ms.

En FASE 4C.2 se pretende mejorar las capturas
`player-four-early` (2/4),
`player-four-updated` (3/4) y `player-kane-mbappe` (8 diferencias),
sin regressiones de Bet Builder, cashout, apuestas liquidadas, duplicados
ni seguridad de escritura. No publicar cifras nuevas hasta ejecutar el
OCR real y comparar por campo y caso con las mismas huellas.
