# Betano: rayo de apuesta en vivo

24/10/2026 · rama `codex/betano-live-lightning`, basada en PR #9 desplegado.
Publicado para revisión en [PR #10](https://github.com/Jozhiky/Bettrack/pull/10).

El usuario confirmó que el rayo naranja del widget del partido identifica una
apuesta en vivo. El lector anterior solo reconocía etiquetas textuales de modalidad:
un recibo terminal Cash Out podía importarse correctamente, pero quedaba con
modalidad desconocida. Reproducido con una prueba que devolvía unknown en vez de live.

## Corrección

- Detector local conservador de forma, color, tamaño, posición y entorno oscuro.
  Una coincidencia conserva bbox normalizada, versión del detector y SHA de la imagen.
  Rechaza fondos de marca, rectángulos, círculos, cruces y badges verdes.
- El OCR conserva su texto, selecciones, cuotas e importes; Tesseract sigue siendo
  el motor principal gratuito. El icono se recoge por separado, sin enmascarar ni
  modificar los píxeles que lee OCR. No se añaden dependencias ni servicios cloud.
- El rayo solo acredita modalidad: nunca colocación, cobro o estado final.
  Cashout sigue necesitando recibo inequívoco y cobro conocido. Un rayo con una
  oferta conserva la oferta sin ejecutar. Texto prematch contradictorio deja
  modalidad desconocida; la ausencia de rayo tampoco acredita prematch.
- Borradores históricos existentes: la pantalla recupera sus imágenes privadas y
  comprueba iconos automáticamente, sin volver a subirlas. Añade únicamente metadatos
  visuales y auditoría; conserva texto, selecciones, cuotas y retenciones originales.
  No reescribe apuestas/liquidaciones/movimientos ya registrados.
- El resumen espera al final de la comprobación visual y muestra «⚡ En vivo».
  Tras consentimiento del lote se guardan live y historicalTiming.mode de forma
  coherente. La evidencia no puede referirse al SHA de otra imagen.
- Todo se adapta al esquema actual: **sin SQL ni migraciones nuevas**.

## Validación

- **700/700** unitarias, TypeScript de aplicación y suites OCR/carga y build.
- Captura aportada comprobada localmente con Tesseract real y detector: modalidad
  live, estado Cashout, stake/retorno exactos y neto en céntimos. La imagen y el
  informe privado permanecen fuera de Git y del QA remoto.
- QA autorizado con imagen sintética de rayo en un borrador ya guardado: modalidad
  visible antes del consentimiento y persistida tras importación/recarga. Cinco
  grupos previos conservados: 17 apuestas, 17 liquidaciones, 34 movimientos,
  un duplicado sin cargo, dos excepciones y neto −S/760.00.
- Banco real 28/28: **1067/1089**, mismas 22 discrepancias y exactamente las mismas
  dos mejoras respecto a la línea base 1065. Cero regresiones por check, cambios de
  valores erróneos, selecciones omitidas/adicionales o estados financieros falsos.
  Corpus, admisiones, oráculos y recursos OCR intactos.
- Carga y revisión UI en 375/768/1440, consentimiento y teclado conservados.
- El primer y último partido de una captura muy alta también conservan el rayo;
  la exclusión del logotipo se mide por anchura y no recorta extremos del boleto.
- El harness FASE 3 dejó de usar el hash ficticio fixture-hash y calcula el SHA real
  del Blob: la nueva prueba de procedencia no admite asociar un icono a otra imagen.
  No se alteró ningún valor esperado, imagen u oráculo.
- FASE 3 real: tres repeticiones, siete diferencias literales conocidas, ninguna
  nueva y paridad 7/7 entre ejecución instrumentada y normal.

Evidencia local ignorada: `test-results/live-lightning/`, `automatic-qa/`,
`ocr-phase4b/`, `ocr-phase3/`, `capture-upload/` y `ocr-phase3-ui/`.

## Alcance de publicación

Preparado para revisión y publicación. Producción sigue en PR #9; no se ha cambiado
Supabase productivo, esquema ni registros existentes durante este trabajo.
No aplicar correcciones retroactivas a apuestas ya guardadas. Publicar Hosting
requiere autorización para esta nueva versión conforme a AGENTS.md.
