# Capturas tomadas o subidas después de la aceptación

25/10/2026. Rama `codex/delayed-capture-context`, basada en `abcca92` del PR #13.

## Aclaración del usuario

Las capturas aportadas se toman después de que Betano acepta la apuesta. Pueden
subirse tarde, cuando el partido está en vivo o terminado. En el boleto de cuatro
jugadores, el nombre tachado corresponde al jugador original y el nombre superior
a su sustituto mediante Suplente de Oro. Tres selecciones acertadas no equivalen
a un resultado final del boleto.

Esta aclaración queda documentada como declaración del usuario, no como texto
leído por OCR ni como autorización para escribir en producción. La detección
visual del tachado y la nueva forma de acreditar colocación siguen pendientes;
este cambio corrige la cronología y la distinción entre partido y apuesta.

## Defectos reproducidos y corrección

Se añadieron primero seis pruebas: cinco fallaron antes de cambiar la aplicación.
Tres demostraron que Hoy/Mañana/Esta noche se fechaban usando el día de subida;
otra que un rayo convertía una modalidad de colocación desconocida en live; otra
que una apuesta explícitamente prematch se volvía desconocida si la captura
posterior mostraba un partido en vivo.

- Los horarios relativos conservan etiqueta y selección, con `at: null`. Una
  fecha completa visible conserva su calendario. La fecha de carga y la contable
  siguen separadas de apuesta, liquidación y partido. No se exigen campos manuales.
- La modalidad de colocación exige una etiqueta explícita completa. Instrucciones,
  negaciones, minutos, horarios y el rayo no acreditan cuándo se apostó. Si falta
  esa evidencia, se conserva desconocida, sin convertirla en prematch por defecto.
- La UI distingue **Partido en vivo en la captura** de **Apuesta colocada en vivo**.
  La lectura visual del rayo permanece intacta y no acredita aceptación ni cobro.
- La comprobación automática incluye la modalidad de colocación para detectar
  cambios entre lecturas. Los originales y las retenciones siguen conservados.
- El build detectó una incompatibilidad entre promociones vacías de selecciones
  guardadas y el tipo del OCR en una línea ya presente en `abcca92`. Se normaliza
  únicamente promoción vacía a ausencia al comparar; la prueba nueva comprueba
  un único stake al recibir el resultado posterior con la misma referencia.

No hay migraciones, nuevas dependencias, cambios al corpus/oráculos ni operaciones
sobre apuestas existentes. El valor de procedencia legado `upload-reference` se
mantiene por compatibilidad; **`at: null` no afirma ninguna fecha**. Las estimaciones
antiguas se siguen mostrando identificadas como anteriores, sin reescribirlas.

## Validación

- Suite completa: **790/790**, incluidas 17 pruebas nuevas. Las expectativas
  afectadas por el defecto reproducido ahora exigen fecha nula y modalidad
  desconocida; se mantienen las pruebas del rayo, del cobro y de los originales.
- TypeScript y build aprobados; persiste el aviso de bundle mayor de 500 kB.
- OCR real: **28/28**, **1068/1089**, mismas 21 diferencias, cero omisiones,
  adiciones, colocaciones, victorias o cashouts ejecutados sin evidencia.
- Calificación automática: **15/28**, idénticas decisiones y checks por imagen a
  la base. No se afirma que estas correcciones resuelvan las trece retenciones.
- QA por lote: **6 grupos aprobados**, 18 apuestas/18 liquidaciones/36 movimientos
  sintéticos. Verifica fechas relativas nulas y modalidad de apuesta desconocida
  aun cuando el rayo se muestra en UI, recarga, concurrencia y respuesta perdida.
  UI verificada a 375/768/1440, sin entradas de fecha obligatorias ni desbordamiento.
- QA de registro automático por cuenta: **9 grupos aprobados**, 7 apuestas,
  7 liquidaciones y 14 movimientos sintéticos; neto S/6.00. Carga PNG/JPEG/WebP,
  estados finales, duplicados, conflictos, respuesta perdida, Storage privado,
  aislamiento de cuentas, recarga, sincronización y revocación verificados.

Evidencia ignorada: `test-results/delayed-context-*.log`,
`test-results/automatic-qa/report.json`,
`test-results/automatic-registration-qa/report.json` y
`test-results/automatic-gate/report.json`. Comandos del agente:
`npm.cmd test -- --maxWorkers=4`, `npx.cmd tsc --noEmit`, `npm.cmd run build`,
`node scripts/ocr-phase4b/run.mjs`, `node scripts/ocr-phase4b/automatic-gate.mjs`,
`npm.cmd run test:automatic:qa`, `npm.cmd run test:automatic-registration:qa`.
Los dos QA se ejecutan en serie exclusivamente en el proyecto aislado autorizado.

El fallo anterior de contrato FASE 3 documentado en el PR #13 sigue pendiente;
no se modifica ni se presenta como aprobado. No se despliega ni se activa el modo
automático en cuentas reales. Integrar dependencias #12 y #13 requiere su revisión.
