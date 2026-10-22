# Betano: capturas y reglas de interpretación

## Cómo aportar nuevos casos

Envía el boleto completo en PNG/JPG original, sin reducirlo ni comprimirlo. Deben verse la cabecera, todas las selecciones y el pie con monto y retorno. Adjunta un acercamiento adicional cuando haya símbolos o texto pequeño. Los recortes sirven para estudiar un mercado, pero no permiten inventar el evento, stake o cuota que quedaron fuera. Si el boleto no muestra una fecha verificable, se utiliza la fecha de carga y se etiqueta como tal. Para registrar un cashout ejecutado pulsa Cashout e ingresa el total cobrado; el botón de oferta del boleto no demuestra que se ejecutó.

## Promociones verificadas

Fuentes oficiales consultadas el 15/10/2026; las condiciones de una campaña concreta pueden cambiar.

- **Suplente de Oro**: el jugador que entra hereda el progreso del jugador sustituido, en mercados elegibles identificados por su icono. `1+` significa al menos uno; no se transforma en `14` ni en una cuota. [Ayuda oficial](https://support.betano.pe/hc/es-pe/articles/33391121411101--Como-funciona-la-oferta-Suplente-de-Oro).
- **Pago anticipado +2**: una selección elegible se paga como ganadora cuando el equipo alcanza dos goles de ventaja. El icono identifica la promoción; no demuestra que ya se cumplió. BETTRACK no liquida la apuesta a partir del icono. [Ayuda oficial](https://support.betano.pe/hc/es-pe/articles/38347366234653--C%C3%B3mo-funciona-la-oferta-2-Goles-de-Ventaja-Pago-Anticipado).
- **Multi Bono**: añade un bono a las ganancias de una combinada ganadora elegible. La tabla oficial muestra 50 % para 12 selecciones y cuota mínima 1.50 por selección; esto no basta para garantizar elegibilidad de un boleto histórico. [Ayuda oficial](https://support.betano.pe/hc/es-pe/articles/38347974699549--C%C3%B3mo-funciona-la-oferta-Multi-Bono).

En `bet (11)`, el producto de las doce cuotas visibles es 95,518.20288996646, consistente con cuota/retorno visible 95,518.20 para stake 1.00. `(95,518.20 − 1.00) × 50 % = 47,758.60`, exactamente el bono mostrado. Esto **sugiere que el bono es adicional** y el potencial con bono sería 143,276.80 si aplica. Es una deducción aritmética: la ayuda no aclara cómo esa pantalla incluye/excluye el bono. El programa conserva retorno y bono por separado, inicialmente «Sin confirmar», y ninguno afecta el beneficio realizado.

## Implementación y límites

El motor local detecta candidatos a icono por color, tamaño y posición, los aparta del OCR de texto y conserva una promoción editable. No reconoce de forma infalible cualquier símbolo. Las apuestas completas se guardan automáticamente; promociones, cuotas, mercados y nombres se pueden corregir desde el detalle. Se reintenta leer la marca y cuotas omitidas mediante otras regiones/modos reales de Tesseract. Los ejemplos del usuario nunca se usan como respuestas prefijadas del motor.

Los mercados «Ambos equipos anotan» y «Ambos equipos reciben una tarjeta» conservan textos distintos aunque ambos tengan selección «Sí». Cada Bet Builder mantiene sus mercados y promociones internos.

## Regresión 20/10/2026 · bet (30)

Causa reproducida: Tesseract lee «Mañana» como «Manana»; el parser conservaba esa etiqueta como equipo y desplazaba los mercados de Bet Builder. Se excluyen ahora sufijos de calendario completos por posición en la columna derecha, incluyendo horarios y fechas fragmentadas por OCR. No se usan fechas de partidos como fecha de colocación.

Verificación con el flujo real `readCapture`: 11 selecciones, 14 mercados internos, stake 200 céntimos, cuota 51.53, retorno original 10307 céntimos y oferta de cashout 200 céntimos. Se conserva el céntimo de diferencia respecto de stake × cuota; no se liquida el cashout ofrecido. «Paris Saint-Germain +2» se conserva como hándicap, separado de los iconos de pago anticipado.

Regresión local sobre los 7 originales: `node scripts/verify-betano-ocr.mjs D:/richa` (requiere `npm.cmd run dev`). Las imágenes no se suben a ningún servicio desde esta prueba. Evidencia en `artifacts/ocr/betano-regression.json`. Suite unitaria: 80/80; build TypeScript/PWA correcto.

## Rendimiento y detalle · 20/10/2026

El lector se reutiliza entre cargas durante dos minutos de inactividad. Las operaciones se serializan; un fallo descarta el lector y permite recrearlo en la siguiente captura. Al cerrar la cuenta se descarta la sesión y no se guardan lecturas tardías. Los modelos permanecen solo en RAM: no se añade almacenamiento local de apuestas.

El registro usa los metadatos de la captura ya guardada, sin descargar nuevamente sus píxeles ni reescribir el archivo. La cola vacía deja de abrir una transacción cada cinco segundos. No se cambia la resolución, los parsers ni el segundo intento de contraste.

Medición local con `scripts/benchmark-ocr.mjs`: ocho originales disponibles (1, 2, 3, 4, 6, 7, 8, 9), 28.026 ms con inicialización por archivo frente a 23.291 ms reutilizando el lector (17 % menos). Los resultados estructurados coinciden exactamente entre modos. Mide reconocimiento local, no subida/guardado ni una garantía de tiempo por dispositivo. Los siete originales de la regresión anterior ya no estaban disponibles en sus rutas, por lo que no se afirma haber repetido esa suite de imágenes en esta iteración. La evidencia anterior se conserva.

El detalle es un modal centrado con cabecera fija y cuerpo desplazable. `scripts/verify-detail-modal.mjs` renderiza el componente real con datos sintéticos aislados, sin cuentas ni escrituras cloud, y verifica 375/768/1440 px, centrado, ausencia de desbordamiento, cierre visible, Escape, foco contenido y devolución del foco. Evidencia: `test-results/detail-modal.json` y capturas `detail-*.png`. Pruebas unitarias: 85 aprobadas.
