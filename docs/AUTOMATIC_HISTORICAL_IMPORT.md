# Importación histórica automática por lote

24/10/2026 · rama `codex/automated-ticket-batch` · base `731e918` (PR #8 desplegado).
Publicado para revisión en [PR #9](https://github.com/Jozhiky/Bettrack/pull/9),
implementación `34b36125551aceee20bafb85125090a8f1db80d7`.

## Problema y comportamiento

El flujo anterior reconocía el resultado, pero exigía abrir cada boleto, introducir
dos fechas y cotejar por separado Ganancias/Cash Out. Los borradores existentes
siguen disponibles con sus imágenes, texto, selecciones y retenciones originales.

Mis apuestas muestra ahora un resumen visible del lote, preparado automáticamente.
Una sola acción **Confirmar y registrar N liquidadas** consiente ese resumen exacto;
no hay formularios de fechas ni aceptación individual obligatoria. Se pueden excluir
filas. Se conservan las excepciones y la revisión manual como alternativa.

- Ganada/Cashout: cobro explícito, o recibo Betano con cabecera global terminal,
  stake coincidente y un único pie Ganancias. Un botón/oferta, potencial, parcial,
  importe contradictorio o estado de una selección no acreditan cobro.
- Perdida total inequívoca: retorno cero. Cashout conserva ese estado cualquiera
  que sea su resultado neto. No se obtiene un cobro multiplicando stake por cuota.
- Combinadas sin total: producto exacto de cuotas exteriores, truncado una vez a
  dos decimales, con procedencia. Los mercados hijos del Builder no se multiplican.
- Mercados completos de tarjetas, equipo Más/Menos Córners y asiático de córners
  conservan su ámbito; no se inventan participantes para etiquetas ambiguas.
- Preparación/conflicto de colocación, selecciones incompletas y cuotas de selección
  ausentes siguen excluidas. Una retención antigua de evidencia insuficiente se
  conserva y audita; el recibo terminal completo y consentimiento del lote permiten
  registrar sin fingir una revisión humana de cada campo.

La evaluación local de 20 lecturas reales preparó 18: una liquidada tenía un cobro
ilegible y otra era abierta con oferta. Esta es una comprobación de preparación,
**no una importación ni autorización de escritura de esos registros**. No se
publican textos privados, identificadores o capturas; no se copian al QA.

## Fechas y contabilidad

`historicalTiming` separa carga, registro contable, apuesta, liquidación y horarios
de eventos. Las fechas históricas ausentes son null y no bloquean la importación.
La fecha contable permite registrar los movimientos sin atribuirla a la apuesta
original. Si existen instantes históricos inequívocos, se conservan por separado.
El dashboard agrupa estos movimientos por registro contable; no certifica una
cronología histórica que la imagen no proporciona.

Los horarios absolutos válidos de partidos se conservan como evidencia. Hoy/mañana
usan el día de carga de Lima como **referencia señalada**, no como prueba de cuándo
se capturó una imagen antigua. Un horario no asignable conserva contexto desconocido;
la ausencia de horario en una selección no desplaza los de las siguientes. Un reloj
66:14/70:00 no es fecha ni prueba de colocación en vivo. Solo una etiqueta explícita
de apuesta en vivo/prepartido fija ese modo; liquidación es una dimensión diferente.

Una transacción del RPC existente guarda todo el lote: boleto, selecciones,
liquidación final, cargo de stake, retorno y auditoría del consentimiento. La vista
previa comparte la comparación de duplicados con el registro y excluye sus importes
de los totales. Si cambia el resultado esperado de deduplicación, se revierte todo.
El resumen vence a los diez minutos; se puede actualizar sin escribir finanzas.
La versión de cuenta protege otras sesiones; el consentimiento exacto se puede
reintentar tras una respuesta perdida sin otro cargo ni otra auditoría de lote.

## Validación

- **680/680** pruebas unitarias, 30 archivos; TypeScript de aplicación y suites
  OCR/carga; build de producción y comprobación de OCR local.
- QA Supabase aislado: 17 escenarios de persistencia anteriores, ocho grupos
  históricos anteriores y cinco grupos de lote. Datos exclusivamente sintéticos.
- Lote QA de 20 borradores: 18 preparados; 17 apuestas, 17 liquidaciones y 34
  movimientos tras excluir financieramente una imagen duplicada. Dos excepciones
  conservadas. Neto −S/760.00 coincide entre resumen y dashboard. Se verificaron
  simultaneidad, respuesta perdida, recarga, dos sesiones, cuenta ajena, cero
  escrituras antes del consentimiento y rechazo del backend anterior.
- Guardia PostgreSQL rechaza reapertura y fechas históricas falseadas sin cambiar
  la versión de cuenta. SECURITY INVOKER y RLS permanecen activos; anon no ejecuta
  capacidades. Comparación actual de `bt_commit` QA/producción idéntica:
  MD5 de `pg_get_functiondef` `60f1386a6e89b5c114a8640cceffa4da`.
- Móvil 375, tablet 768 y ordenador 1440: resumen adaptable, exclusión, confirmación
  y controles sin desbordamiento. Carga PNG/JPEG/WebP y UI anterior conservadas.
- OCR real 28/28: **1067/1089**, 22 diferencias (antes 1065 y 24). Dos mejoras de
  ámbito en Builder; **cero regresiones por check**, selecciones omitidas/adicionales
  o estados financieros falsos. Corpus, admisiones y 15 recursos OCR idénticos.
- FASE 3 real: tres repeticiones, siete discrepancias literales previas, ninguna
  nueva; paridad 7/7. Oráculos intactos, Tesseract gratuito y sin dependencias nuevas.
- `npm audit --omit=dev --audit-level=high`: sin alta/crítica; permanece un aviso
  moderado transitivo de fast-uri. Advisor QA: aviso previo de protección de
  [contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  desactivada; no se modificó Auth ni se contrató un plan.

Evidencia local ignorada: `test-results/automatic-qa/report.json`,
`automatic-ocr-comparison.json`, `persistence-qa/`, `settled-qa/`,
`compatible-rollback/report.json`, `ocr-phase4b/`, `ocr-phase3-ui/`, `capture-upload/`.

## Esquema y publicación pendiente de autorización específica

Fuente: [20261024210047_automatic_historical_booking.sql](../supabase/migrations/20261024210047_automatic_historical_booking.sql).
Aplicada **solo al QA**, registrada allí como `20261024210641_automatic_historical_booking`.
No ejecutar db push global por las diferencias de timestamp de migraciones anteriores.

Extiende únicamente la guardia final y capacidades para permitir una fecha contable
con cronología histórica separada y exigir cierre completo atómico. No reescribe
filas ni cambia `bt_commit`, RLS, Auth, Storage, usuarios o registros existentes.
El frontend bloquea el lote antes del RPC financiero si falta la capacidad nueva.
Producción mantiene PR #8: este trabajo no ha modificado su esquema ni datos.

Procedimiento tras autorización del usuario:

1. Confirmar SHA remoto e integrar el PR sin forzar conflictos. Repetir gates si
   cambia el código; revisar configuración de destino, bundle y activos OCR.
2. Conservar Hosting anterior y publicar una reversión **compatible con accounting**,
   construida por `npm.cmd run test:historical:rollback`. Lee nuevos registros y
   bloquea localmente nuevas importaciones automáticas incluso con cuotas conocidas:
   cero llamadas de capacidades/commit y cero backend real en las tres anchuras.
3. Aplicar exclusivamente esta migración autorizada y verificar por SELECT funciones,
   permisos y guardias. No hacer apuestas de prueba ni cambios de datos productivos.
4. Desplegar únicamente `hosting:bettrack`, proyecto `wostcloud1`, sitio
   `bettrack-wostcloud1`; verificar recursos, PWA, login y resumen con fixtures
   interceptados, sin registrar finanzas reales. El usuario confirma luego su lote.
5. Si hay fallo crítico, restaurar la reversión compatible. **PR #8 y su reversión
   antigua no son lectores de accounting** después de crear el primer registro nuevo.

Comandos reproducibles de QA: `npm.cmd run test:automatic:qa`,
`test:persistence:qa`, `test:settled:qa` (secuenciales: comparten cuentas desechables),
`test:historical:rollback`, `test:captures:ui`, `test:ocr:phase3:ui`,
`test:ocr:phase3`, `test:ocr:phase4b`. `test:e2e` cloud no fue ejecutado.
