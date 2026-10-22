# BETTRACK · arquitectura y decisiones

> Documento histórico del MVP local. La versión cloud vigente, que sustituye IndexedDB y añade cuentas, está descrita en [CLOUD.md](CLOUD.md).

## Alcance comprobable de esta versión

Aplicación PWA de un usuario por perfil/origen de navegador. No tiene cuentas ni servicios externos en tiempo de ejecución. IndexedDB es la fuente de verdad. No coloca apuestas ni consulta casas de apuestas.

Capas:

- `src/domain/model.ts`: entidades, Zod, céntimos enteros, estado derivado, normalización, fechas Lima y métricas.
- `src/data/db.ts`: Dexie, migraciones locales hasta versión 3, tablas e índices.
- `src/data/repository.ts`: interfaz de repositorio y adaptador local; comandos transaccionales, saldos y auditoría.
- `src/data/transfer.ts`: CSV, respaldo JSON versionado, validación de relaciones y libro contable, restauración por fusión atómica.
- `src/ocr`: motor Tesseract, Canvas, SHA-256 y parser conservador por reglas.
- `src/components`: controles accesibles sobre Radix Dialog, formularios RHF + Zod, filtros, tabla y detalle.
- `src/pages`: ocho vistas; suscripciones Dexie actualizan vistas sin recargar.

React Router, React/TypeScript/Vite, Tailwind, Inter local, Lucide y Recharts. Se usan componentes locales con el patrón de composición Radix/shadcn; no hay dependencia de un servicio UI. Zustand no es necesario: el estado persistido proviene de Dexie y el efímero de React.

## Relaciones

Una casa representa una billetera y una moneda inmutable después de registrar movimientos. Una apuesta pertenece a una casa y puede tener un streamer; tiene N selecciones normalizadas, como máximo un resultado y una captura opcional. Los movimientos referencian apuesta, liquidación o pareja de transferencia. El audit registra antes/después de cambios.

## Contabilidad

- Disponible = suma de movimientos de la moneda/billetera.
- Abierto = stake original − suma de stake cerrado.
- Banca nominal = disponible + stake abierto. El stake abierto es capital en riesgo, no dinero garantizado.
- Beneficio realizado = suma de retornos recibidos − stake cerrado.
- Yield = beneficio / monto apostado de boletos liquidados.
- Rentabilidad = beneficio / (capital inicial + depósitos). Retiros y transferencias no generan beneficio.
- Potencial es informativo y nunca altera saldos.
- Montos se guardan como enteros seguros en céntimos. Las cuotas son decimales y el retorno calculado se redondea a céntimos; un retorno explícito prevalece.

Las transacciones serializan escritura de apuestas, selecciones, movimientos y audit. Cada resultado debe cerrar exactamente el monto apostado completo y se rechaza si ya existe otro resultado, incluso en solicitudes concurrentes. Solo se admiten Ganada, Perdida o Cashout; sin resultado, la apuesta está Pendiente. No hay cierres parciales ni anulación en el flujo actual.

Se permite revertir una liquidación (auditable) para corregirla. Cambiar stake, casa o fecha con liquidaciones existentes está bloqueado. Eliminar una apuesta revierte sus movimientos y elimina su captura, conservando la auditoría. Una corrección puede revelar un saldo negativo si ya se gastó un retorno; se alerta y se concilia, no se crea un depósito artificial.

## Filtros

Los filtros de fecha seleccionan apuestas por fecha de colocación en Lima; los resultados de esas apuestas incluyen sus liquidaciones posteriores. No equivalen a un cierre contable por fecha de cobro. La banca, disponible, depósitos y retiros son globales por moneda y están etiquetados como tales. El beneficio, yield, distribución, promedio y tablas responden a los filtros. La serie de beneficio usa fecha efectiva de liquidación. No se mezclan monedas.

## OCR

Todo reconocimiento se ejecuta dentro del navegador. Worker, WASM y modelos español/inglés se descargan en la preparación del proyecto y se sirven localmente. El service worker los precachea para el modo offline. No se envían imágenes ni texto a APIs.

Se calcula SHA-256 del archivo original. La huella semántica usa casa, día Lima, stake, cuota y selecciones normalizadas. Ambos generan confirmación y permiten repetir una operación auténtica.

El parser detecta Betano/Bet365 por texto. Canvas amplía las capturas estrechas sin reducirlas por su altura e invierte boletos oscuros. Tesseract usa texto disperso y devuelve palabras con coordenadas; las líneas se reordenan visualmente para asociar cada cuota con su selección. El adaptador Betano separa equipos, marcadores, horarios, mercados de equipo y mercados internos de Bet Builder. Se conservan el texto reconocido y el retorno mostrado, incluso con un céntimo de diferencia respecto del cálculo. No hay diccionario de equipos ni resultados de reconocimiento prefijados.

Cada evento de una combinada es una fila de `selections`. Su campo opcional `builderMarkets` contiene objetos `{market,pick}` editables; la cuota pertenece al grupo y no se multiplica otra vez por cada mercado interno. Es una extensión compatible con datos y respaldos v1 anteriores: no cambia índices ni elimina registros. JSON, CSV, auditoría y huella semántica conservan los mercados internos. Un Bet Builder individual admite un evento con al menos dos mercados.

Se probaron seis capturas reales Betano (1, 11, 18, 22, 12 y 12 eventos) y un recorte de jugador. Esto no garantiza todos los formatos: nombres pequeños pueden perder letras. Se guarda automáticamente cuando están disponibles los campos esenciales y las selecciones completas; el detalle permite correcciones posteriores. No se reconoce el logo mediante visión; se lee su texto. Sin fecha verificable se usa la fecha de carga (`dateSource: upload`), nunca se deduce de «Hoy» ni del reloj en vivo. `timingUnknown` separa la modalidad desconocida de prepartido. Una oferta cashout nunca crea liquidación. Bet365 conserva el parser genérico basado en etiquetas, sin validación con boletos reales de esa casa.

La versión 2 de IndexedDB añade `uploads` sin borrar tablas anteriores. Cada archivo se persiste antes del OCR. Una Web Lock por origen serializa el procesamiento entre pestañas; los registros `processing` se recuperan tras una recarga. Registro de apuesta, stake y estado de cola se guardan en la misma transacción, con ID estable para evitar doble registro. Los duplicados se detienen y permiten repetir explícitamente. La selección conserva su `order` dentro del boleto. Las capturas se pueden registrar sin banca previa, dejando déficit contable visible; no se generan movimientos ficticios. El respaldo incluye la cola y restaura tareas interrumpidas como revisables.

El procesamiento respeta fecha de entrada y reutiliza un worker Tesseract durante el lote. `readCapture` compara pasadas de contraste por completitud de campos y selecciones válidas: no combina valores de distintas lecturas ni sustituye una lectura por otra peor. Los archivos idénticos a un boleto existente se detectan antes de ejecutar OCR. La consulta de la vista unificada carga solo metadatos de trabajos sin resolver. `workspaceItems` los combina con las apuestas filtradas antes de paginar; solo las capturas de la página visible cargan sus blobs.

Una coincidencia semántica independiente del día propone vincular capturas; no vincula automáticamente. `linkCapture` registra el vínculo y su auditoría atómicamente con estado `linked`; conserva la imagen original y el libro contable. El detalle muestra el historial de imágenes y las ofertas como referencias, nunca como cobros. Eliminar una actualización no elimina la apuesta; eliminar la apuesta limpia también sus imágenes vinculadas. Los respaldos conservan esos vínculos.

La bandeja de pendientes usa el estado del boleto. El cierre rápido crea un resultado con ID propio y ofrece revertir exactamente ese resultado. Cashout solo pide el monto recibido y cierra todo el boleto. Los tipos son Simple y Combinada; varios mercados del mismo partido se conservan dentro de la combinada.

La migración local v3 convierte Doble, Triple y Bet Builder a Combinada, con auditoría y sin cambiar selecciones ni dinero. Los esquemas de lectura de respaldos permiten datos antiguos para no perder información. Un cobro antiguo incompatible se marca para revisión dentro de Pendientes y bloquea nuevos cobros hasta revertir los anteriores; no se lo transforma silenciosamente en una ganancia o cashout. CSV no importa resultados incompletos o estados retirados como resultados nuevos. `closedStake` se conserva internamente para validar y leer el libro anterior, pero las escrituras nuevas exigen que coincida con el monto total.

## Interacción y lectura

`historyView` valida con Zod y guarda preferencias de historial en sessionStorage, separado del libro financiero de IndexedDB. El área desplazable del espacio de trabajo conserva su posición al volver al historial. Radix mantiene el foco dentro del detalle y devuelve el foco al botón de apertura. El panel es lateral en escritorio y ocupa la pantalla en móvil.

`TicketSummary` cuenta eventos y mercados internos por separado. Las tarjetas pendientes priorizan monto apostado y potencial; las terminadas priorizan beneficio neto, apuesta y cobro. En Mis apuestas todos los filtros están bajo un único desplegable que indica si hay filtros activos; cierra al pulsar fuera o Escape. El dashboard conserva sus filtros principales visibles. La tabla usa cifras alineadas y encabezado fijo en su área desplazable.

El resumen de capturas cuenta toda la bandeja, no solo la página visible. `retryFailedCaptures` solo vuelve a poner en cola registros error/review; excluye guardados, vinculados y duplicados. `CaptureComparison` carga las dos imágenes locales sin enviar archivos a terceros. El área de avisos ocupa una fila propia fuera del área de trabajo; los errores de guardado también aparecen dentro del diálogo abierto y requieren corrección o cierre explícito.

La banca y su gráfico son globales por moneda. Los resultados se filtran por fecha de apuesta/carga e incluyen los cobros posteriores de esos boletos. El destacado del gráfico muestra el beneficio acumulado, el resultado del último día mostrado o la banca final según la métrica seleccionada.

## Persistencia y respaldo

IndexedDB pertenece al origen (protocolo, host y puerto). Usa siempre la misma URL. Cambiar entre `localhost` y `127.0.0.1`, o cambiar de puerto, crea otro espacio. Cerrar/recargar conserva datos; borrar datos del navegador puede eliminarlos. El respaldo JSON incluye capturas base64, configuraciones y auditoría. El CSV es intercambio revisable, no reemplaza un respaldo completo. Los conflictos JSON abortan la fusión entera, y los registros idénticos se omiten.

Los datos son privados respecto de servicios remotos, pero no están cifrados en el equipo. Cualquier persona con acceso al perfil de navegador puede leerlos. No hay audit inmutable frente al dueño del dispositivo.

## Cloud pendiente

La migración Supabase es una base opcional, no una integración activa. Incluye tablas normalizadas, claves compuestas por usuario, RLS de lectura y ningún permiso de escritura para clientes. Esto evita habilitar escrituras financieras incompletas. Faltan adaptador Supabase, Auth, RPCs atómicas, Storage privado, sincronización, Realtime y resolución de conflictos. No se conectó ni modificó ninguna cuenta Supabase.

Antes de habilitar cloud: validar migración en PostgreSQL/Supabase, implementar comandos con bloqueo por billetera/apuesta, probar RLS con dos usuarios y Storage con rutas propias; implementar revisiones optimistas y cola local. Nunca usar service_role en frontend. Google Sheets OAuth también queda pendiente; CSV funciona sin cuenta externa.

Las promociones opcionales de una selección o mercado interno se guardan en `promotion`. Los candidatos se detectan por color y geometría antes de OCR y requieren revisión. El campo opcional `bonus` conserva monto y tratamiento (Sin confirmar, Adicional o Incluido) sin modificar retorno ni movimientos. JSON, CSV y edición conservan estos campos. Consulta [BETANO.md](BETANO.md) para fuentes y casos estudiados.


## Vista unificada de boletos

`Bets` concentra selección de archivos, cámara, arrastrar/soltar y portapapeles mediante `useCaptureInput`. `/capturas` es una redirección compatible y ya no figura en la navegación. `CapturePending` representa únicamente una lectura en curso, incompleta o un posible duplicado. Los registros saved/linked no generan tarjetas independientes.

`workspaceItems` mantiene el ID de la captura al convertirse en apuesta y evita mostrar dos representaciones si las suscripciones de IndexedDB llegan en distinto orden. Los posibles duplicados conservan su propia identidad aunque apunten a un boleto existente. La misma proyección alimenta tarjetas, tabla y paginación. Los contadores de Pendientes/Terminadas/Todas solo cuentan apuestas; los trabajos OCR tienen su indicador separado, sin introducir nuevos estados financieros. No se modifica el esquema ni los registros existentes.
