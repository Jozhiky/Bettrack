# BETTRACK · validación de la v0.1

> Evidencia histórica de la versión local. Para las pruebas y límites de la versión cloud del 19/10/2026 consulta [CLOUD.md](CLOUD.md).

Fecha: 16/10/2026. Entorno: Windows, Node 24.14.1, Chromium de Playwright, compilación de producción Vite.

## Resultados

- `npm.cmd test`: **70 pruebas aprobadas**, 6 archivos. Vitest, Testing Library, fake-indexeddb.
- `npm.cmd run build`: **aprobado**, sin errores TypeScript ni imports rotos. Advertencia no bloqueante: bundle principal de aproximadamente 560 kB antes de gzip.
- Suite completa con `BETTRACK_TICKET_DIR` y `BETTRACK_FRAGMENT_PATH`: **20 recorridos aprobados** en Chromium, incluidos seis boletos reales Betano. Tras compactar las tarjetas y ampliar la comprobación de filtros móviles, se repitieron los recorridos afectados (resultado al final de este documento).
- `npm.cmd audit --omit=dev --audit-level=moderate`: **0 vulnerabilidades reportadas** en dependencias de producción al momento de ejecutar. No equivale a una certificación de seguridad.

## Cobertura financiera y de datos

- Registro simple y combinadas con selecciones relacionadas.
- Saldo inicial y persistencia IndexedDB después de cerrar/reabrir la conexión.
- Cashout +20, cashout −5, pérdida −10 y ganancia +10 para stake 10.
- Contrato de cuatro estados y dos tipos. Rechazo de cierres incompletos, estados retirados y segundos resultados. Migración de tipos anteriores conservando selecciones y cobros para revisión.
- Liquidaciones concurrentes: solo una cierra la misma posición.
- Depósitos, retiros y transferencias no se convierten en ganancias.
- Reversión de liquidación y recálculo, edición/eliminación, audit y rollback ante errores.
- Monedas separadas y transferencia entre monedas bloqueada.
- SHA-256, huella semántica y repetición deliberada permitida.
- CSV de Sheets, cashouts ejecutados, fecha faltante/inválida, selecciones/liquidaciones exportadas.
- Respaldo JSON validado y rechazo de libro contable alterado.
- Céntimos mediante conversión decimal a entero con BigInt; importes con más de dos decimales requieren corrección.

## Recorridos en navegador

1. Capital 100 → apuesta 10 → recarga → cashout 5. Resultado −5, banca 95, stake abierto 0. Creación de casa y streamer; ningún error JavaScript capturado en ese recorrido.
2. Siete vistas y redirección desde la antigua ruta de capturas en **375 px**, tema oscuro, formulario sin desbordamiento, cierre con Escape.
3. Las mismas comprobaciones en **768 px**.
4. Las mismas comprobaciones en **1440 px**.
5. OCR real desde un PNG generado en Canvas: reconoce stake 10, cuota 2 y retorno 20 **sin red**. Se guarda automáticamente el boleto y su imagen, se exporta JSON, se restaura en otro perfil y se restaura nuevamente sin duplicar apuesta ni banca. La captura original vuelve a mostrarse. **Cero peticiones a dominios externos observadas** en el perfil que procesa la imagen.

6–8. Capturas reales Betano `bet (27).png`, `bet (23).png`, `bet (21).png`: 1/11/18 eventos, stake 7/1.50/1.50, cuotas 1.44/46/61.62, retornos 10.08/69.01/92.43. Cinco grupos Bet Builder con 16 mercados internos en la combinada de 11; edición de campos internos, periodo del primer tiempo, rango 1–4 y selección Sí comprobados. Formulario sin desbordamiento en 375/768/1440 px. Cero peticiones externas durante el OCR. Se guardaron solo en el perfil aislado de pruebas, nunca en el perfil del usuario.

9–11. Capturas `bet (20).png`, `bet (11).png`, `bet (18).png`: 22/12/12 eventos y 10/0/2 mercados internos de Bet Builder. Stakes 1.10/1.00/5.00, cuotas 717.29/95518.20/22.46 y retornos 789.02/95518.20/112.32. Se comprobaron 12/12/4 iconos de pago anticipado, cuota recuperada 2.30 y bono 47,758.60 con tratamiento «Sin confirmar». Se distinguen «Ambos equipos anotan» y «Ambos equipos reciben una tarjeta». Revisión responsive en 375/768/1440 px y sin peticiones externas.

12. Recorte real de Haris Tabakovic: sin datos esenciales del boleto, permanece como captura por revisar y no genera apuesta ni movimientos ficticios. La interpretación del mercado y promoción se cubre en las pruebas del parser.

13. Tres capturas simultáneas sin capital inicial → recarga durante lectura → tres apuestas guardadas automáticamente → Ganada, Perdida y Cashout 30. Resultado neto conjunto +20; un solo campo para cashout. Una cuarta imagen idéntica queda como captura duplicada en la lista conjunta y no aumenta la cantidad de apuestas. Cards verificadas en 375/768/1440 px.

14. Imagen pegada desde portapapeles → otra imagen con oferta cashout → vínculo al mismo boleto. Una apuesta, dos imágenes y un solo stake en el respaldo. Pérdida deshecha desde el aviso; cashout recibido 6 sobre monto apostado 10 cierra todo el boleto y da neto −4. Historial de actualizaciones visible y bandeja responsive en 375/768/1440 px.

15. 61 capturas de prueba → primera y última página → tamaño 24 → filtro vacío y regreso. Todas accesibles, conteos y página ajustados, sin desbordamiento en móvil.

16. Historial con 30 boletos en un perfil de prueba: búsqueda, filtros, orden y página conservados al navegar y recargar; tarjetas/tabla, referencia interna y mercados agrupados; regreso del foco al cerrar el detalle. Panel lateral y vista móvil comprobados en 375/768/1440 px.

17. Destacado del gráfico: beneficio acumulado 0, último resultado diario −10, banca global 1,000. Filtrar otra casa no altera la banca global y los filtros activos se pueden limpiar.

18. Cashout negativo: error junto al campo, sin registro. Cashout corregido y Deshacer; aviso fuera del área de trabajo y por encima de la navegación móvil, sin cubrirla.

19. Retiro superior al saldo: el error de repositorio aparece dentro del formulario. Corregir el importe permite guardar y cerrar el diálogo.

La comparación de duplicados presenta las dos imágenes locales antes de vincularlas. El reintento en lote se prueba para asegurar que solo vuelve a poner en cola fallidas/revisables y conserva los duplicados, guardados, vinculados y trabajos en curso.

Las pruebas OCR adicionales comprueban que una lectura completa no necesita otra pasada, que el contraste alternativo puede recuperar datos faltantes y que una pasada peor no reemplaza los importes originales. Las pruebas de datos cubren vínculo idempotente entre fechas diferentes, rechazo al eliminar la apuesta destino y limpieza de imágenes vinculadas.

La persistencia incluye fecha de carga explícita, modalidad desconocida, orden de selecciones, imagen, cola recuperable y bono sin confirmar. Se probó la idempotencia del registro, duplicados semánticos/hash, repetición deliberada, bloqueo por selecciones faltantes, preservación CSV de procedencia de fecha y limpieza de referencias al eliminar.

Pruebas unitarias adicionales: orden espacial, equipos frente a marcadores, grupos y cuotas, diferencia de un céntimo, selección faltante, mercados con guion, compatibilidad de esquemas anteriores, huellas con mercados internos/promociones, lectura de bono sin sumarlo, persistencia/edición/CSV/respaldo de un Bet Builder con promoción, bono y stake único.

Los tests utilizan perfiles y bases aislados. No agregan datos de prueba al navegador del usuario.

20. La ruta antigua redirige a Mis apuestas, con un único botón de subida y sin enlace duplicado en la navegación. Arrastrar desde Terminadas y con una búsqueda activa abre Pendientes, limpia la búsqueda y transforma la captura en una apuesta conservando su ID. Solo queda una tarjeta después de recargar; la imagen original sigue visible en el detalle.

La proyección unificada tiene cinco pruebas unitarias: transición con ID estable, suscripciones desfasadas, posible duplicado que referencia otra apuesta, omisión de saved/linked y paginación estable sin pérdida de elementos.

## Evidencia visual generada

En `test-results/`: dashboards y formulario sintético; `betano-{número del archivo}-{ancho}.png` contiene las capturas reales y su interpretación. Son artefactos locales privados excluidos de Git; no se publicaron ni se enviaron a servicios externos.

## Límites de lo verificado

- Además de la fixture sintética se probaron seis capturas auténticas Betano y un recorte. Los eventos, cuotas, importes y grupos se recuperan, pero la lectura de nombres no es perfecta: se observó «OF Creta» en lugar de «OFI Creta» y «AS Ménaco» en lugar de «AS Mónaco». No se corrigen con datos inventados; deben revisarse. Los iconos se proponen por color/tamaño/posición: requieren confirmación y no están validados en todos los temas o formatos. No se han probado capturas reales Bet365.
- Cámara física, instalación en dispositivos iOS/Android y comportamiento Safari no se probaron en hardware real.
- No existe conexión cloud activa. La migración Supabase no fue aplicada ni probada en un servidor; faltan Auth, Storage, RPCs, Realtime y resolución de conflictos.
- Frontend publicado en Firebase Hosting (`bettrack-wostcloud1.web.app`) el 17/10/2026. La base de apuestas sigue siendo local; Hosting no proporciona sincronización de datos.
- No hay cifrado de la base local ni garantías de audit inmutable frente a quien controla el perfil del navegador.

Última comprobación: 6 recorridos afectados aprobados (UX y vista unificada), incluido un caso nuevo de filtros móviles: rango personalizado, límites del panel y cierre/foco con Escape. Total: 21 escenarios distintos verificados. Compilación final aprobada.

## Publicación Firebase — 17/10/2026

- SDK Firebase: 73 tests unitarios aprobados en total; las 3 pruebas del SDK se repitieron tras fijar el dominio final.
- Build de producción y TypeScript aprobados. Permanece el aviso no bloqueante de bundle principal superior a 500 kB.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilidades.
- 7 recorridos E2E aprobados en `app.spec.ts` y `workspace.spec.ts`, incluyendo OCR offline, respaldo/restauración y tamaños 375/768/1440.
- Despliegue exclusivo en `bettrack-wostcloud1` completado, vinculado a la web app solicitada. `bettrack` fue rechazado por Firebase por estar reservado por otro proyecto.
- `node scripts/verify-hosting.mjs` aprobado contra HTTPS público: rutas profundas HTTP 200; HTML, JS, service worker, manifiesto y recursos OCR coinciden por SHA-256 con `dist`; MIME y cabeceras de caché correctos.
- En perfil aislado sobre la URL pública: OCR de imagen sintética sin red, guardado y recarga offline, cashout de S/5 sobre stake de S/10, dashboard actualizado, sin desbordamiento en 375/768/1440 y sin errores JavaScript.
- Evidencia local: `test-results/firebase-live.json` y `test-results/firebase-live.png`. No se transfirieron apuestas ni capturas reales del usuario.
