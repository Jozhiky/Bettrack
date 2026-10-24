# FASE 4A — incorporación de evidencia real

Estado: **0 capturas nuevas**. Se conservan las siete anteriores en sus rutas;
`legacy.lock.json` fija PNG, anotaciones, controles, huellas OCR y discrepancias
anteriores (16 archivos). No regenerar ese archivo para hacer pasar una prueba.
Texto permite LF/CRLF; imágenes se comparan byte a byte.

[Inventario y lista de capturas necesarias](../../docs/OCR_PHASE4A_CORPUS.md).

## Estructura

```text
tests/ocr-phase4a/
  cases.json               # solo casos admitidos; vacío inicialmente
  contract.ts              # contrato ejecutable de anotación/validación
  legacy.lock.json         # protección del corpus anterior
  images/
    football/              # fútbol sin categoría más específica
    nba/                   # baloncesto; liga visible para afirmar NBA
    bet-builder/           # cualquier deporte, submercados completos
    cashout/               # oferta o ejecución, explícitamente separados
    settled/               # liquidaciones del boleto completo
```

Un PNG por caso y una categoría primaria; `tags` relaciona los demás escenarios
sin duplicar imágenes. Nombre neutro `images/<category>/<id>.png`, sin fecha privada,
titular ni ID de boleto. Originales y borradores quedan **fuera del checkout** en
una ubicación privada; no publicar rutas ni huellas de los originales privados.
Las carpetas contienen solo `.gitkeep` hasta admitir evidencia.

## Procedimiento de admisión

1. **Autorización:** confirmar permiso para usar y publicar la copia desidentificada
   y los importes deportivos visibles. Registrar una referencia opaca al consentimiento,
   sin nombres ni mensajes privados. Una captura recibida no implica permiso público.
2. **Conservar:** guardar el original intacto y su texto original en privado. Trabajar
   sobre una copia; no editar con IA, reconstruir palabras, añadir equipos, cuotas o
   símbolos ni mejorar selectivamente la evidencia. No usar OCR como verdad esperada.
3. **Anonimizar:** preferir capturas sin datos privados. Si es necesario, cubrir con
   rectángulos opacos sólidos titular, usuario, correo, saldo ajeno al boleto, ID,
   QR/código de barras y notificaciones. Sin difuminado reversible; aplanar y exportar
   PNG. Registrar regiones `[x,y,ancho,alto]` y motivo. Si el dato privado invade un
   mercado, estado o importe necesario, rechazar para ese escenario y pedir otra
   captura: no sustituir texto ni trasladarlo desde otro recibo.
4. **Metadatos:** exportar sin comentarios/EXIF/XMP y permitir únicamente chunks
   `IHDR, PLTE, IDAT, IEND, tRNS, sRGB, gAMA, cHRM`. Abrir de nuevo el PNG final,
   comprobar legibilidad, ausencia de PII y que no cambiaron los píxeles deportivos.
   El importador histórico solo elimina metadatos y modifica manifiestos de FASE 1/3:
   **no usarlo para 4A**. La revisión visual sigue siendo obligatoria.
5. **Anotar antes del OCR:** transcribir manualmente todo el texto visible de la copia
   en `transcript`, con sus saltos de línea y marcas `[ilegible]`/`[redactado]` cuando
   corresponda. Completar `expected` según `contract.ts`, sin autocorrección de nombres
   o tildes; conservar el texto privado original fuera de Git. Una segunda lectura
   visual independiente de la salida OCR contrasta la anotación y firma `review`.
6. **Evidencia por campo:** `evidence` cubre todas las hojas de `expected`, incluidos
   valores nulos y listas vacías. `field` usa rutas como `stake`,
   `selections[0].market`, `selections[0].builderMarkets[1].meaning.period`.
   `observation` cita el texto visible o explica la ausencia/ambigüedad; `box` señala
   la región de la copia final. Solo ausencia/desconocimiento permite región nula.
7. **Validar y admitir:** calcular SHA-256 y dimensiones del PNG final, completar
   `review` únicamente tras efectuar sus controles, añadir el registro a `cases.json`
   y ejecutar la suite 4A. Revisar duplicados visuales además del SHA: recodificar,
   renombrar o recortar el mismo boleto no aumenta cobertura independiente. La suite
   rechaza duplicados exactos, rutas inconsistentes, imágenes sin registro y metadatos
   no permitidos, pero no puede certificar por sí sola consentimiento o privacidad.
8. **Resultados observados:** después de admisión, una tarea posterior ejecutará OCR
   en un banco aislado y guardará salida cruda, discrepancias y versión del motor en
   `test-results/ocr-phase4a/<id>/`. Nunca sobreescribir `expected` con esa salida ni
   convertir una diferencia en tolerancia automática. Esta entrega prepara admisión
   y regresiones; aún no conecta los nuevos casos al ejecutor de OCR de FASE 3.

## Convenciones del contrato

- Importes `stake`, `potential`, `cashoutOffer`, `settledReturn`: céntimos enteros o
  `null` si no se ven. Cuotas numéricas o `null`, también en cada submercado Builder.
  No calcular un importe/cuota faltante, ni usar `0` para representar desconocimiento.
- `placement` es `preparation/confirmed/unknown`; `settlement` es
  `unknown/Pendiente/Ganada/Perdida/Cashout`. `unknown` expresa falta de evidencia en
  la anotación, no añade un estado nuevo a producción. No inferir `Pendiente` de
  ausencia de una etiqueta. `cashoutKind` separa `none/offer/executed`; una oferta no
  demuestra cobro, y `potential` nunca es `settledReturn`.
- `meaning` separa `scope` (partido/equipo/jugador/desconocido), participante literal
  y período. `unspecified` no es `full-match`; `first-half` no es `first-period`.
  NBA exige evidencia de liga; puntos no la acreditan. Si el ámbito o la identidad
  no se pueden verificar visualmente, mantener desconocimiento y explicar por qué.
- Un Builder usa `meaning: null` en su contenedor y una anotación por submercado;
  una selección ordinaria tiene `builderMarkets: []` y su propio `meaning`.
- Un comprobante adicional no rellena campos ni confirma otro borrador. Toda imagen
  conserva sus propios estados, ausencias y retenciones; no hay fusión de boletos.

## Comprobaciones locales

```powershell
npm.cmd run test:ocr:phase4a
npx.cmd tsc --noEmit
git diff --check
```

La suite incluye `ocr-phase4a.test.ts` y los controles previos de FASE 2/2.1. Estos
últimos usan dobles de Supabase y una base efímera, no la aplicación configurada.
Las nuevas pruebas solo leen archivos e importan parser/semántica; no abren red.
No ejecutar `test:e2e`. No arrancar la aplicación como paso de admisión.

Las mutaciones del oráculo y los controles heredados de primer período son pruebas
del evaluador/intérprete, **no capturas ni resultados deportivos reales**. Se conserva
la anotación humana `player` para Nico Paz y se expone la abstención `unknown` actual
del motor; no se adapta el oráculo para aparentar reconocimiento. La suite vacía de
casos nuevos valida preparación, no precisión sobre NBA o liquidaciones.
