# Cierre cloud BETTRACK · 20/10/2026

## Ampliación de mercados y cierre verificado · 22/10/2026

Publicado y activo index-Ukk8j5sL.js en hosting:bettrack (wostcloud1). 29 familias léxicas; 79 pares etiqueta/selección probados en Simple y Builder, periodos partidos entre líneas, valores cortos y signos preservados, singular/plural corregido, Doble/Triple normalizados a combinadas y checks verdes separados del texto sin liquidar. Detalle y fuentes oficiales en docs/OCR_MARKETS.md.

Al reanudar, las tres Dobles (46)/(48)/(55) ya estaban saved en Supabase. El usuario había liquidado su historial: no se alteraron esas decisiones. Una nueva bet (71) fallaba por el horario Esta noche y por la cuota 1.33 desplazada a otra fila en el OCR del navegador real. Corregidos ambos casos con guardias espaciales y regresiones; no se calculan cuotas ni se infieren equipos.

La captura existente 0bf751d4-853c-43a5-9cf1-dbbbf7e4e8d2 se reprocesó desde Mejorar lectura en la app publicada. SQL confirma saved, Combinada, stake 2000, odds 2.59, potential 5187, tres selecciones y cero liquidaciones. UI confirma Barranquilla FC vs. América de Cali (1.33), Deportivo Toluca FC vs. Club Tijuana (+3, cuota 1.50), Independiente Santa Fe vs. Jaguares de Córdoba (1.30). Sin capturas por resolver, una pendiente y diez terminadas. Evidencia artifacts/ocr/expanded-markets-live.jpg.

292 pruebas/14 archivos aprobados con npm.cmd test -- --maxWorkers=4. Build correcto; aviso preexistente del bundle principal. Dos scripts de OCR validan 14 originales identificados por hash; verify-expanded-markets.mjs incluye ocho recientes y audit-pending-captures.mjs los seis previos. verify-hosting.mjs verifica ocho rutas/recursos por hash, login/signup a 375/768/1440 y cero errores de página. Otros deportes tienen cobertura de vocabulario/fixtures, todavía no capturas reales de validación. No se cambió el esquema cloud, auth, contabilidad ni los cuatro estados.

## Próximo gol por minuto · 21/10/2026

Corregida la familia singular próximo/siguiente/primer/último gol: bet (44) y (45) ya separan Lille OSC vs. Galatasaray SK y conservan mercados antes de 70:00/60:00 (Gol 5). 173 unitarias y OCR original/mejorado/WebP aprobados; build y hosting verificados. Bundle index-CsEh_VW7.js. Actualización activada y las dos capturas reales reprocesadas desde UI; ambas saved comprobadas por SQL, dos pendientes y ninguna liquidación automática. Detalles docs/OCR_TIMED_GOALS.md. No se recreó actividad histórica ausente ni se alteraron resultados.

## Corrección de dirección deportiva · 21/10/2026

El usuario rechazó la paleta ciruela/iris. Nueva capa visual grafito/naranja con superficies neutras, navegación superior oscura, cuotas compactas y tipografía de mayor contraste; incluye acceso, claro/oscuro y mantiene colores semánticos. Solo presentación: sin cambios de datos, OCR ni contabilidad. Harness visual y modal aprobados en 375/768/1440; build correcto. Bundle index-B73odaSA.js, CSS index-CiiGFLss.css. Sustituye la dirección visual anterior. Detalles en docs/VISUAL_SYSTEM.md.

## Identidad visual tinta e iris · 21/10/2026

Publicado hosting:bettrack con index-Do2m9SqR.js. Resumen de riesgo/resultado y distribución real por estados en Mis apuestas, tarjetas jerarquizadas, navegación ciruela/iris, acciones con iconos, tokens de gráficos, modo oscuro y modal coherentes. Detalle en docs/VISUAL_SYSTEM.md. Sin cambios de backend, OCR ni registros. 162 pruebas y build aprobados; fixture visual y modal a 375/768/1440 sin overflow ni errores. Se actualizó la pestaña real, se verificó el bundle nuevo y la vista con sus diez apuestas; evidencia artifacts/ocr/bettrack-visual-live.jpg. La revisión no realizó liquidaciones ni borrados.

## Verificación en la cuenta real · 21/10/2026

La pestaña seguía ejecutando index-jmyQN9KD.js, anterior a las correcciones. Se activó index-D-pHVN1W.js y se utilizó Reintentar 6 lecturas con las imágenes ya almacenadas. Las seis llegaron a registrarse. Comprobación posterior: bet (15), (17), (19), (21) y (23) permanecen saved en Supabase con 4/1/18/5/8 eventos y los importes esperados. bet (24) tiene auditoría Crear apuesta a las 03:02:36Z, Liquidar apuesta a las 03:16:15Z y Eliminar apuesta y revertir movimientos a las 03:16:44Z; no se recreó el registro eliminado. La cuenta cambió durante la continuación y muestra actualmente 10 apuestas (1 pendiente, 9 terminadas), sin capturas bloqueadas. No se realizaron liquidaciones ni eliminaciones en esta verificación. Evidencia visual artifacts/ocr/real-account-verified.jpg. Las notas anteriores que pedían reintentar las seis quedan superadas.

## Última entrega: mercados y seis capturas · 20/10/2026, 21:57 Lima

Publicado catálogo de 26 familias en src/ocr/markets.ts basado en ayuda oficial de Betano y capturas; cobertura ampliada, no exhaustiva. Correcciones de goleadores, gol/asistencia, saques de banda, nombre con paréntesis multilínea, aviso Ganado con Pago Anticipado y fallback de cuotas en Simple. Rechazo señala la selección incompleta. Las seis capturas 15/17/19/21/23/24 se registran en pruebas cloud reales (57 eventos y 51 mercados internos) con importes correctos, sin liquidación automática y persistencia tras recarga. 162 unitarias, build y 13 controles API pasan.

Se descubrió y corrigió el rechazo contable de Simple con un único Bet Builder: repositorio y JSON/CSV conservan el tipo; migración remota/local 20261021025000_allow_simple_bet_builder cambia exclusivamente la guardia Simple a count de selecciones externas. Sigue rechazando dos selecciones externas en Simple con rollback íntegro. CAS, auth.uid, RLS y demás guardias intactos. Advisor sin nuevos problemas; advertencia histórica de contraseñas filtradas continúa documentada.

Hosting exclusivo bettrack, bundle final index-D-pHVN1W.js. Evidencia test-results/markets-local.json, markets-production.json y firebase-live.json. El último ajuste tras prueba OCR de producción fue coherencia JSON/CSV, cubierto por unitarias y nueva compilación/publicación. Dos cuentas QA y sus objetos eliminados, remaining_qa_users=0; credenciales retiradas. Las seis capturas reales siguen en review sin modificación: actualizar PWA y pulsar Reintentar 6 lecturas (no requiere subirlas de nuevo). Documentación: docs/OCR_MARKETS.md. No se implementó una garantía de lectura para mercados nuevos ni otros deportes sin capturas de validación.

## Última entrega: lotes de capturas · 20/10/2026, 21:20 Lima

Publicada la preparación paralela limitada y hasta dos lectores OCR adaptados al dispositivo, con fallos independientes y botón Reintentar subidas fallidas. Timeout por tarea OCR de dos minutos y reconstrucción del lector atascado. Serialización CAS y aislamiento de cuentas conservados. 103 pruebas aprobadas y build correcto. Bundle actual index-Mlq9AWvp.js, comprobado por hash contra producción.

Medición del mismo lote real de cuatro imágenes en producción: 23.004 → 19.479 ms (15,3 % menos), salida OCR exactamente igual: tres registros y una revisión. Fallo Storage simulado y reintento selectivo verificados en producción sin duplicados; login/signup responsive y ocho recursos públicos correctos. Detalles en docs/BATCH_CAPTURES.md. Dos cuentas QA y sus archivos eliminados con identidad exacta, remaining_qa_users=0; credenciales locales retiradas. No se modificaron datos reales. Actualizar la PWA para recibir esta versión.

## Historial de entregas

Trabajo solicitado completado y publicado en https://bettrack-wostcloud1.web.app. Registro directo por usuario/contraseña, confirmación de correo desactivada por autorización expresa, contraseña mínima 10. Supabase wfrpqzyokzrstafuqujf de Jozhiky 2; Firebase solo hosting:bettrack en wostcloud1.

Evidencia en docs/QA_CLOUD.md: 78 unitarias, 4 E2E sobre producción, 14 controles API, compilación correcta. Una advertencia conocida de Supabase: protección de contraseñas filtradas requiere Pro y no se contrató. No existe recuperación autónoma de contraseña ni invitaciones de grupo.

Limpieza terminada: cinco cuentas QA y capturas eliminadas; una cuenta real conservada. No volver a eliminar datos indiscriminadamente: el usuario ya puede estar registrando actividad real. Los archivos .env.qa.json y .env.qa-cleanup.sql fueron eliminados. Para futuras pruebas provisionar cuentas sintéticas nuevas.

No se creó automatización: no fue necesaria para completar el trabajo. No hay commit porque el workspace no es un repositorio Git. No volver a publicar salvo cambios nuevos; nunca desplegar otros sitios de wostcloud1.

Actualización OCR del 20/10/2026: publicado el fix de «Manana» y widgets de fecha/hora en Betano. bet (30) pasa con 11 selecciones y 14 mercados internos, preservando S/103.07. Regresión real de los 7 originales y 80 pruebas unitarias aprobadas. No se modificaron registros de la cuenta real. Para la captura que sigue en revisión, actualizar la PWA y pulsar Mejorar lectura; no hace falta volver a subirla. La pestaña IAB accesible estaba sin sesión, por lo que no se ejecutó ese botón en la cuenta del usuario.

Última publicación del 20/10/2026: detalle cambiado a modal flotante centrado (cabecera fija, scroll del cuerpo, Escape y foco), lector OCR reutilizable durante 2 minutos, registro sin volver a descargar la imagen y cola vacía sin transacciones periódicas. 85 pruebas pasan y build correcto (persiste aviso no bloqueante de tamaño del bundle principal). Verificado el componente real en un harness local aislado a 375/768/1440 px; no se crearon cuentas ni se modificaron apuestas reales. Medición local de ocho capturas disponibles: 28.026 ms → 23.291 ms, mismos resultados estructurados; otras tres capturas también mantienen exactamente el resultado. Los originales anteriores 30/27/23/21/20/11/18 ya no están en D:/richa, no afirmar que esa suite se repitió. Detalles y límites en docs/BETANO.md.

Deploy exclusivo hosting:bettrack confirmado y 8 rutas/archivos públicos comparados por hash contra dist; bundle principal index-BE-YDQHq.js. Login/signup público sin errores de página. Evidencia: test-results/firebase-live.json, test-results/detail-modal.json, artifacts/ocr/benchmark.json. No hay trabajo pendiente de esta solicitud; si la PWA sigue con la versión anterior, aceptar su aviso de actualización.

## Corrección «Quitar captura» · 20/10/2026

Publicada y verificada en producción; nuevo bundle principal index-B2j7wv0a.js. Causa: CapturePending llamaba a la transacción cloud pero operaba con el repositorio raíz dentro del callback, produciendo una espera circular en la cola de escrituras. Se movió el borrado a LocalRepository.removePendingCapture usando el scope de transact, con auditoría y conservación de imágenes referenciadas. Permite quitar capturas queued/processing/review/error/duplicate, protege las ya registradas y evita que un OCR tardío recree una captura eliminada. Indicador Quitando…, bloqueo de acciones simultáneas y error visible con reintento.

92 pruebas aprobadas y build correcto. scripts/verify-capture-removal.mjs pasó contra desarrollo y Firebase público, usando solo cuentas temporales: fallo simulado conserva el registro; reintento elimina uploads/images y el objeto privado; sincroniza otra pestaña, persiste tras recarga y no cambia movimientos ni apuestas. Evidencia test-results/capture-removal.json. Verificación de 8 rutas/assets públicos correcta. Dos cuentas QA creadas para esta prueba fueron eliminadas con identidad exacta, tras retirar objetos y revocar sesiones; remaining_qa_users=0. Credenciales QA locales eliminadas. No se modificaron registros reales. El usuario debe actualizar/recargar la PWA antes de volver a pulsar el botón; la versión anterior podía dejar la cola de guardado bloqueada en esa pestaña.

## Resumen visual y almacenamiento · 20/10/2026, 20:08 UTC

Publicado exclusivamente en hosting:bettrack. Bundle index-B_orzLOs.js, verificado por hash contra dist. Modal con barras de stake/retorno, acciones al principio, cashout dentro del propio detalle, selecciones/notas plegables e imágenes bajo demanda. Compresión local WebP sin pérdida con comprobación de píxeles y fallback al original; SHA original/almacenado; archivos compartidos por cuenta con borrados seguros; caché RAM de 32 MiB; progreso de lectura sin escrituras de porcentaje. Configuración muestra espacio conocido y permite liberar imágenes de apuestas terminadas conservando finanzas. Son 97 pruebas aprobadas, build correcto y modal comprobado a 375/768/1440 px. Scripts de almacenamiento y quitar captura pasan en desarrollo y en producción; archivos reales comprimidos y registros financieros sintéticos explícitos, ninguna apuesta real modificada. Ver docs/CAPTURE_STORAGE_UX.md para cobertura y límites (no se implementó paginación servidor ni delta por fila).

Dos cuentas QA de esta iteración eliminadas con UUID/correo/metadata exactos, tras limpiar objetos por Storage API y revocar sesiones; remaining_qa_users=0. Registro local de credenciales y SQL de limpieza retirados. Trabajo solicitado terminado. Para ver los cambios en una PWA abierta, aceptar la actualización o recargar.

## Betano Clasifica · 20/10/2026, 20:12 UTC

Corregida y publicada la lectura de bet (16).png. El OCR leía Clasifica, pero marketLine no lo reconocía como mercado y la selección Vasco da Gama RJ vs. Boca Juniors quedaba sin evento/mercado. Regla exacta añadida en betano.ts, con regresiones simple y Bet Builder. Se comprobó el original, el modo mejorado y la imagen comprimida: cuatro selecciones válidas, dos builders con cuatro mercados internos, stake 3500, cuota 2.43, retorno original 8533 y oferta cashout 2868 sin ejecutarla.

99 pruebas aprobadas, build correcto y deploy exclusivo hosting:bettrack. Asset index-jmyQN9KD.js comparado por hash contra dist. scripts/verify-clasifica-ticket.mjs cargó la imagen real en una cuenta QA usando el OCR real de producción, registró automáticamente la combinada, verificó los cuatro eventos/mercados y persistencia tras recarga, sin liquidación automática. Evidencia test-results/clasifica-ticket.json y artifacts/ocr/ticket-diagnostic.json. Dos cuentas QA y sus archivos fueron eliminados por identidad exacta, remaining_qa_users=0; registro local de credenciales eliminado. No se modificaron registros reales. Para la captura ya pendiente en la cuenta real: actualizar la PWA y pulsar Mejorar lectura.
