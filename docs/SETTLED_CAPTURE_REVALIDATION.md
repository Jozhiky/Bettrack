# Revalidación de históricos — 24/10/2026

## Bloqueo reproducido sobre los formatos realmente usados

La lectura inicial, exclusivamente SELECT, encontró 20 borradores Betano en
producción: 10 Perdida, 4 Ganada y 6 con cabecera terminal `Cash Out`. Los 20
carecían de cuota total y retorno potencial en el OCR. No faltaban las cuotas
individuales de sus selecciones. No se publican identificadores, texto privado,
imágenes ni importes de esos borradores. El usuario puede cambiar su cola mientras
se realiza esta revisión; esas cifras corresponden al diagnóstico inicial.

Dos defectos se reprodujeron con pruebas que fallaban antes del cambio:

1. PR #7 exigía cuota y potencial originales incluso en tickets liquidados donde
   esos datos no aparecen. La restricción también existe en PostgreSQL: no bastaba
   con cambiar la pantalla ni con repetir el OCR.
2. El estado `Cash Out` al final de la cabecera de Betano no era reconocido como
   candidato histórico. Se confundía el formato con ausencia de colocación y la
   revisión no podía abrirse.

Las comprobaciones sintéticas anteriores incluían datos globales que no existen
en estos formatos y recibos de ejecución más explícitos. Se conserva su cobertura
y se añaden variantes que reproducen la ausencia real de datos y la cabecera.

## Corrección preparada

- A petición del usuario, una combinada sin total visible puede usar el producto
  de todas sus cuotas de selección, **truncado una sola vez a dos decimales**:
  2.02 × 2.15 × 1.36 = 5.90648 → **5.90**. Aritmética decimal exacta, sin redondeos
  binarios ni truncamientos intermedios. Se elige en revisión y se marca «calculada».
  Cada Bet Builder cuenta solo su cuota exterior, sin multiplicar mercados hijos.
  Si falta una cuota no se calcula. Un total visible se conserva; promociones y
  cuotas ajustadas por la casa pueden diferir. El cálculo nunca acredita un cobro.
  Se guardan entradas y método, se recalcula tras corregir selecciones y se valida
  la procedencia tanto al registrar como al leer copias de seguridad.
- Cuota total y potencial original pueden conservarse como **null**, únicamente
  en una importación histórica con fecha conocida y liquidación final completa
  dentro de la misma transacción. No se multiplican cuotas ni se sustituye el
  potencial por el cobro. Apuestas pendientes y manuales siguen exigiendo valores.
- La cabecera terminal `Simple/Combinada… S/… Cash Out` abre la revisión. Exige
  una confirmación específica de ejecución/cobro y cierre total. Un botón
  independiente `CASH OUT S/…` sigue siendo solo una oferta.
- `Ganancias …` se muestra como **sugerencia por cotejar**, nunca como cobro
  automático. El usuario puede aceptarla expresamente como retorno total o
  transcribir el importe correcto; después sigue siendo obligatorio el resumen
  y consentimiento financiero. Las lecturas con ruido no se completan por conjetura.
- Las fechas históricas y el stake siguen siendo obligatorios. Se indican los
  campos faltantes; la fecha de subida no se usa como fecha histórica.
- Listado, detalle, dashboard, edición y exportación conservan los desconocidos.
  La cuota promedio excluye las ausentes; todas ausentes muestran «No visible».
  Neto, cargos y retornos se calculan únicamente con importes reales.
- Reapertura de una liquidación con datos globales desconocidos queda bloqueada
  hasta completar sus valores originales. Deduplicación también compara una
  cuota global desconocida frente a la misma captura con cuota conocida.
- Los borradores anteriores se reutilizan desde la misma vista, sin reenvío ni
  relectura; imagen, texto y auditoría se conservan.

## Cambio de esquema pendiente de autorización productiva

[Migración preparada](../supabase/migrations/20261024193847_historical_unknown_quote_guard.sql),
creada con Supabase CLI 2.122.0 y aplicada/probada **solo en QA autorizado**:

- Ajusta una restricción de `bt_bets` para permitir JSON null en esos dos campos
  cuando el registro está marcado como histórico.
- Dos triggers diferidos comprueban el estado final de la transacción: cierre
  completo, estado Ganada/Perdida/Cashout, fuente OCR/import, fecha verificada y
  cronología válida. Eliminar/mover una liquidación no deja un histórico pendiente.
- Función privada **SECURITY INVOKER**, `search_path=''`, sin permiso de ejecución
  directo para anon/authenticated; conserva RLS y las restricciones existentes.
- Nueva función de capacidades de solo lectura, accesible únicamente a usuarios
  autenticados. El cliente comprueba esta capacidad antes del RPC financiero:
  si el backend todavía no está actualizado, bloquea el registro sin movimientos.
- **No actualiza ni elimina registros existentes**, no crea columnas/tablas y
  no cambia Auth, Storage, RLS ni el RPC financiero `bt_commit`. Su definición
  tiene el mismo hash antes/después en QA y producción.

**El usuario autorizó explícitamente aplicar esta migración en producción y
completar el despliegue**, además del cálculo de combinadas descrito. **Publicación
y ajuste de esquema ejecutados** según el [recibo](HISTORICAL_IMPORT_DEPLOYMENT_2026_10_24.md),
sin modificar registros existentes. El orden siguiente queda como referencia.

## Evidencia automática

- **648/648 pruebas**, 28 archivos; base 613 más 35 casos. Incluyen términos
  ausentes en los tres estados, Cashout con pérdida/beneficio/cero, consentimiento,
  reintento exacto/alterado, reapertura bloqueada y correcciones auditadas.
  También producto/truncamiento, precisión decimal, cuotas ausentes, Bet Builder
  sin doble conteo y rechazo de cálculos alterados o atribuidos sobre un total visible.
- TypeScript principal/FASE 1/FASE 3/carga y build aprobados; aviso conocido de
  chunk >500 kB sin error de compilación.
- **3/3 controles de destino**, **17/17** escenarios previos y **8/8** grupos de
  importación histórica real sobre el Supabase QA autorizado.
- QA utiliza 20 borradores **sintéticos** (4 Ganada, 10 Perdida, 6 Cash Out) y una
  oferta; todos los históricos carecen de cuota/potencial globales. No se copiaron
  datos ni imágenes de producción al QA.
- Resultado comprobado: 7 apuestas, 7 liquidaciones, 7 cargos, 7 retornos,
  resultado neto −S/40.00. Incluye concurrencia entre dos sesiones, respuesta
  perdida, duplicado por otra foto, Storage privado, recarga y separación por cuenta.
  Una combinada persiste cuota **5.90** con entradas/método y potencial desconocido;
  la media usa esa cuota calculada sin convertir las otras seis ausentes en cero.
- Se simuló un backend anterior: incluso tras consentimiento, cero apuestas y
  cero movimientos antes de habilitar la capacidad. Intentar borrar la liquidación
  de un histórico sin cuota revierte en PostgreSQL con la versión de cuenta intacta.
- Carga/revisión y resumen a 375/768/1440 px, sin desbordamiento del modal.
- OCR real: 28/28, **1065/1089**, mismas 24 diferencias conocidas, 0 selecciones
  omitidas/adicionales y falsos estados financieros. Calidad por imagen/repetición
  y hashes de corpus/admisiones/activos idénticos a la referencia. Oráculos intactos.
- FASE 3 real con tres repeticiones: siete divergencias literales conocidas,
  ninguna nueva y paridad 7/7. Reversión compatible construida con
  `npm.cmd run build:historical:rollback`, sin desplegar ni contactar al backend.
- El build de reversión se verificó a 375/768/1440 con registros null sintéticos:
  sigue mostrando históricos y estadísticas y rechaza nuevas importaciones de
  ese tipo con cero llamadas `bt_commit` o capacidades y cero backend real.

Evidencia local ignorada en `test-results/settled-qa/`, `persistence-qa/`,
`capture-upload/`, `ocr-phase3-ui/` e informes OCR. Solo consultas de lectura en
producción; ninguna captura real fue registrada, liquidada o modificada por Codex.

## Publicación segura, tras autorización del esquema

1. Integrar el PR revisado sin conflictos y fijar el SHA. Repetir gates si cambia
   el árbol. Preparar el build normal, con destino productivo y OCR local gratuito.
2. Conservar la versión Hosting vigente y preparar una reversión **compatible con
   null**. El frontend anterior a esta corrección no puede leer esos históricos:
   después de crear el primero no debe restaurarse ciegamente la versión de PR #7.
3. Publicar el frontend compatible únicamente en `bettrack-wostcloud1`, proyecto
   `wostcloud1`; antes de aplicar el esquema, las importaciones con null permanecen
   bloqueadas por capacidad. Verificar bundle, OCR, PWA y revisión con fixtures
   interceptados, sin sesión ni escrituras de producción.
4. Solo con permiso específico, aplicar la migración de esquema. Verificar por
   SELECT restricciones/funciones y permisos, sin crear apuestas de prueba reales.
   Mantener sin cambios las imágenes, apuestas, movimientos y usuarios existentes.
5. Actualizar las sesiones/PWA antes de confirmar históricos. Cada boleto exige
   sus fechas, pago cotejado y consentimiento; los parciales/ambiguos quedan retenidos.
   La demo 5188 es efímera; el sitio publicado es el que conserva los datos por cuenta.

Una reversión del frontend debe seguir leyendo null y bloquear nuevas importaciones
de ese tipo. Conservar el esquema evita conversiones de desconocidos a ceros y
reescrituras de datos reales. No ejecutar una migración inversa sobre históricos
ya importados ni hacer un rollback que los vuelva ilegibles.
El comando de reversión genera `test-results/historical-compatible-rollback`
y su manifiesto fuera del directorio web; reemplaza únicamente la consulta de
capacidad por un rechazo local. Conserva todas las vistas compatibles y no publica.
