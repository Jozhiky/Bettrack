# Catálogo de reconocimiento de mercados · 20/10/2026

## Continuación y horario nocturno · 22/10/2026

La versión ampliada index-DEqNPgfG estaba activa en la pestaña real; las capturas Doble (46), (48) y (55) ya estaban saved en Supabase al reanudar. Se respetan las liquidaciones que realizó el usuario mientras el trabajo estaba interrumpido.

Una captura nueva, bet (71), conservaba el rótulo derecho Esta noche 20:00 como si fuera otro equipo. El original local coincide por SHA-256 con el upload cloud 0bf751d4-853c-43a5-9cf1-dbbbf7e4e8d2. Se reconoce el horario completo únicamente en la columna derecha, con variantes de OCR nocte/noc*e y mañana/tarde; un nombre izquierdo como Esta Noche FC no se elimina. No se infiere la fecha de colocación a partir del horario del evento.

Se preservan los tres eventos, Club Tijuana +3, cuota total 2.59, stake S/20.00 y retorno visible S/51.87. El cashout S/16.99 sigue siendo una oferta. Original, mejorado y WebP validan los tres eventos; evidencia ticket-71-before.json y ticket-71-after.json en artifacts/ocr. El selector de pasadas mantiene la lectura original, que conserva la oferta de cashout.

La verificación en producción detectó otra diferencia entre motores de navegador: la cuota 1.33 aparecía en una fila aislada bajo el título, aunque la reproducción local la mantenía alineada. El parser ahora asocia una cuota leída a la fila inmediatamente anterior solo si no hay texto en su columna izquierda, el título no contiene otra cuota ni es una etiqueta de mercado y la distancia no supera 1.25 alturas de glifo. No calcula ni inventa cuotas; no atraviesa espacios grandes. Dos regresiones cubren la recuperación y el rechazo de asociaciones ambiguas.

Validación actual: 292 pruebas en 14 archivos; build completo aprobado. `verify-expanded-markets.mjs` añade esta captura a las siete anteriores con verificaciones de importes y eventos. Son 14 capturas reales cubiertas junto al lote previo de seis, además de los fixtures de etiquetas de otros deportes.

Publicación y verificación final: index-Ukk8j5sL.js activo en Firebase y en la pestaña real. Después de Mejorar lectura, Supabase confirma bet (71) saved con tres selecciones, stake 2000 céntimos, cuota 2.59, potencial 5187 céntimos y cero liquidaciones. UI sin capturas por resolver; una pendiente y diez terminadas. No se modificaron las liquidaciones del usuario. Captura de prueba en artifacts/ocr/expanded-markets-live.jpg. Ocho rutas/recursos coinciden por hash con dist; acceso/registro a 375/768/1440 sin errores de página.

## Ampliación y regresión · 21/10/2026

El catálogo pasa de 26 a 29 familias de reconocimiento. No es un listado exhaustivo de la oferta de Betano ni un motor de liquidación. Las etiquetas se conservan literalmente; el vocabulario no asigna un deporte, equipo, jugador ni resultado.

### Referencias adicionales consultadas

- [Mercados elegibles de Multi Bono](https://support.betano.pe/hc/es-pe/articles/38347974699549--C%C3%B3mo-funciona-la-oferta-Multi-Bono): referencia de mercados principales por deporte, no utilizada para calcular bonos ni extrapolar elegibilidad.
- [Mercados de esports](https://support.betano.pe/hc/es-pe/articles/7468760978589--C%C3%B3mo-puedo-participar-en-los-juegos-de-ESports): ganador y mapas. Se usa únicamente el vocabulario de mercados; no se implementan reglas del juego descritas en el artículo.
- [Bet Builder para esports](https://support.betano.pe/hc/es-pe/articles/32067237185821-Bet-Builder-para-Esports): rondas, paridad, mitades y duelos. No se añade liquidación ni cashout automático.
- [Deportes virtuales](https://support.betano.pe/hc/es-pe/articles/7468730355101--Qu%C3%A9-juegos-est%C3%A1n-disponibles-en-los-Deportes-Virtuales): variantes resultado final y marcador del juego. No acredita compatibilidad visual con capturas virtuales.

### Qué se comprobó

| Ámbito | Etiquetas y separación verificadas en fixtures de geometría |
| --- | --- |
| Fútbol | Resultado final, ganador por tiempo, marcador, clasificación, goles, goleadores, próximo gol y ventana temporal, jugadores, tarjetas, remates, córners, estadísticas, hándicap europeo y asiático |
| Básquet y fútbol americano | Ganador, cuartos/mitades, total de puntos, calificadores de prórroga; métricas combinadas de jugador en básquet |
| Tenis y vóley | Ganador, sets, juegos, puntos y calificadores; aces, dobles faltas y tie-break en tenis |
| Hockey y balonmano | Resultado, goles y calificadores de tiempo reglamentario |
| Béisbol | Ganador, hándicap y total de carreras |
| Boxeo/MMA | Ganador, asaltos y método de victoria |
| Esports | Mapas, rondas, ronda de pistola, mitades, paridad, duelos y tiempo extra |

Se añadieron 102 pruebas: 79 pares de etiqueta/selección procesados tanto en una Simple como dentro de un Bet Builder, cuatro descripciones con periodo partido en otra línea, tres rechazos de texto desconocido/incompleto y 16 controles de nombres que no deben convertirse en mercados. Son fixtures de geometría declarados como tales, no capturas supuestamente leídas por Tesseract. Algunos sinónimos son extensiones léxicas; no se afirma que cada redacción esté disponible hoy para cada evento.

Las selecciones cortas (0, X, 1X), los signos +/− y las fracciones decimales se conservan. Un periodo aislado solo se une después de un mercado conocido; no crea un mercado por sí mismo. Se corrigió también la distinción entre singular/plural de goleador, penal, amonestación y expulsión.

La prueba con píxeles reales detectó que el icono de vivo podía leerse como un 4 junto al reloj. Se excluyen valores numéricos de esa columna derecha y se mantienen los de la columna izquierda. Regresión añadida para evitar que ese icono se convierta en equipo o selección.

### Evidencia de esta ampliación

- Suite completa: 284 pruebas aprobadas en 14 archivos (102 de ampliación de mercados y nueve de cabeceras/símbolos nuevas).
- Seis originales previamente identificados por SHA-256: 4/1/18/5/8/21 eventos; sin selecciones inválidas. Resultado en `artifacts/ocr/six-captures-reproduction.json`.
- bet (44) y (45): OCR original, mejorado y WebP almacenado; evento, mercado, selección, cuota, stake y retorno válidos en los tres modos. Resultados en `artifacts/ocr/expanded-markets-44.json` y `expanded-markets-45.json`. La oferta de cashout no se reconoce en el modo mejorado de estas dos imágenes; la lectura normal, conservada por el selector de pasadas, sí la reconoce.
- Durante la revisión aparecieron bet (46), (48) y (55) con cabecera Doble: se normaliza a Combinada con dos eventos; Triple se normaliza a tres. `src/ocr/header.ts` comparte el reconocimiento entre motor, parser y lectura espacial. Doble oportunidad y Triple doble nunca se tratan como cabeceras. Un Builder cuenta como un evento externo, no como varios.
- bet (48) incluye checks verdes que el OCR confundía con letras junto a 1+. Se enmascaran los iconos compactos verdes sin asignar promoción ni liquidación; Suplente de Oro se conserva aparte. Sus siete líneas 1+ y dos eventos pasan la reproducción.
- `node scripts/verify-expanded-markets.mjs` comprueba originales por SHA-256 y afirma tipo, conteo, stake, cuota y retorno en bet (44)/(45)/(46)/(48)/(55)/(58)/(59). Los cinco originales nuevos coinciden con los hashes de sus registros cloud. Resultado: `artifacts/ocr/expanded-markets-verified.json`. Junto a las seis anteriores, 13 capturas reales.
- Compilación TypeScript/Vite sin errores; advertencia existente del tamaño del bundle principal.
- Las pruebas de OCR fueron locales sin escrituras externas. No se modificaron reglas contables, esquema de Supabase ni estados de apuesta.

**Límite:** la validación de OCR con imágenes reales sigue siendo de boletos de fútbol de Betano. Para los demás deportes se ha comprobado la separación de texto/selección en el formato conocido; faltan boletos reales para acreditar geometría y reconocimiento visual de cada formato. No se garantiza lectura universal ni se aceptan etiquetas desconocidas inventando su significado.

## Fuentes y alcance

Investigación en documentación pública oficial de Betano Perú y seis boletos reales. El objetivo es registrar lo visible, no decidir resultados ni reproducir reglas de liquidación.

- [Definiciones de mercados de fútbol](https://support.betano.pe/hc/es-pe/articles/36520716638877-Definiciones-de-mercados-de-f%C3%BAtbol): familias estadísticas de goles, asistencias, fuera de juego, remates, atajadas, quites, pases, saques de meta, tarjetas y córners.
- [Mercados relacionados con el tiempo en fútbol](https://support.betano.pe/hc/es-pe/articles/38453092097437--C%C3%B3mo-funcionan-los-mercados-relacionados-con-el-tiempo-en-f%C3%BAtbol): conservar periodo y ventanas temporales, también en saques de banda.
- [Mercados relacionados con el tiempo en varios deportes](https://support.betano.pe/hc/es-pe/articles/38453115630237--C%C3%B3mo-funcionan-los-mercados-relacionados-con-el-tiempo-en-varios-deportes): ganador, puntos, sets/juegos y asaltos; no transferir reglas entre deportes.
- [Cómo encontrar un mercado](https://support.betano.pe/hc/es-pe/articles/7412097280669--C%C3%B3mo-puedo-encontrar-un-mercado-espec%C3%ADfico): oferta consultable dentro de cada evento.
- [Pide tu apuesta](https://support.betano.pe/hc/es-pe/articles/7412124809629--C%C3%B3mo-puedo-usar-la-funci%C3%B3n-Pide-tu-apuesta): existe la posibilidad de solicitar mercados personalizados. No es razonable afirmar un catálogo cerrado de todos los textos futuros.
- [Suplente de Oro](https://support.betano.pe/hc/es-pe/articles/33391121411101--Como-funciona-la-oferta-Suplente-de-Oro): conservar la promoción junto al jugador; no tratar el icono como parte del nombre ni como resultado.

El enlace al reglamento completo redirigió a una restricción regional en la herramienta de consulta. No se eludió esa restricción. La investigación pública no acredita cobertura exhaustiva.

## Catálogo implementado

`src/ocr/markets.ts` centraliza 26 familias léxicas: resultado/clasificación, marcador, goleadores, goles, asistencias, remates/tiros, córners, tarjetas, ambos equipos, hándicap, más/menos, saques de banda, saques de meta, fuera de juego, atajadas, quites/entradas, pases, faltas, posesión, penales/tiros libres, portería a cero, puntos, rebotes, otros términos de básquet, tenis y asaltos/rondas.

Las familias son herramientas de reconocimiento, no identificadores que sustituyan el texto original. Algunos sinónimos deportivos son extensiones léxicas y no se presentan como una lista oficial de productos disponibles. La cobertura de otros deportes no está acreditada con capturas reales: requiere fixtures de sus boletos antes de considerarla soporte completo.

Las líneas no se enumeran una a una: valores como 1+, 4+, Más de 2.5, Menos de 1.5, -0.25 o +2 se preservan como selección. Tampoco se cambian el equipo, el jugador, los periodos o la descripción asiática. Un término desconocido sigue requiriendo revisión; no se inventa un mercado para superar la validación.

## Correcciones estructurales

- Nombre de jugador con paréntesis abierto continuado en la siguiente línea; conserva el guion de un nombre y no absorbe un nuevo marcador OCR o un mercado reconocido.
- Aviso Ganado con Pago Anticipado separado de equipos y conservado en las observaciones. No liquida el boleto ni dispara una liquidación parcial.
- Recuperación secundaria de cuotas aplicada también a cabeceras Simple; sigue leyendo píxeles, sin inferir cuota mediante retorno/stake.
- Rechazo informa la selección y tipo de dato incompleto; el archivo existente sirve para releerlo sin otra subida.
- Un boleto Simple puede contener una sola selección Bet Builder con varios mercados internos. Se corrigió el conteo en repositorio y guardia de commit cloud; sigue rechazándose una Simple con dos selecciones externas. No cambian las guardias contables, el bloqueo por cuenta ni auth.uid(). Migración 20261021025000_allow_simple_bet_builder.

## Validación

162 pruebas unitarias pasan, incluyendo etiquetas, valores que no deben clasificarse como mercados, nombres multilínea, ámbito de equipo/periodo/línea, avisos de una selección y registro de Simple con Bet Builder.

La reproducción local de las seis capturas identificadas por SHA-256 pasa el esquema completo: 4, 1, 18, 5, 8 y 21 eventos respectivamente. `scripts/verify-market-captures.mjs` verifica el flujo real de carga/OCR/registro cloud con cuentas desechables y comprueba importes, cantidades de submercados, promoción, eventos, persistencia y ausencia de liquidaciones automáticas.

El guardado contra Supabase también verifica el rechazo y rollback completo de una Simple con una segunda selección externa. Auditor de seguridad sin nuevos hallazgos; persiste la advertencia conocida de [protección de contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se cambió la configuración de autenticación.

Las seis imágenes pasaron el registro real desde desarrollo y Firebase (test-results/markets-local.json y markets-production.json), incluidos 57 eventos y 51 mercados internos de Bet Builder en total. Los cashouts visibles permanecen ofertas y no se crean liquidaciones. La prueba API pasó 13 controles de aislamiento, auditoría, CAS y contabilidad. Dos cuentas temporales eliminadas después de limpiar sus objetos y revocar sesiones, remaining_qa_users=0. Se eliminaron las credenciales de pruebas locales.

JSON y CSV también conservan el tipo Simple cuando existe un único Bet Builder; regresión de exportación/importación incluida.

Verificación posterior en la cuenta real (21/10/2026): la pestaña mantenía index-jmyQN9KD.js. Tras activar index-D-pHVN1W.js y Reintentar 6 lecturas, las seis se registraron usando los archivos existentes. Cinco siguen saved con sus cantidades e importes correctos. La auditoría confirma que bet (24) también se creó y posteriormente fue liquidada y eliminada; se respeta esa eliminación. La UI actual no contiene capturas bloqueadas. Esta verificación no alteró resultados ni recreó registros eliminados.

## Ampliación futura

Cada nueva etiqueta debe aportar un boleto de ejemplo, conservar el texto original y una regresión positiva y negativa. El vocabulario no reemplaza la geometría ni garantiza que el OCR lea correctamente cualquier fuente, resolución o captura recortada. No se consulta Betano durante la lectura de boletos y no se agregaron servicios de pago.
