# Diagnóstico de seis capturas en revisión · 20/10/2026

Actualización posterior: las causas identificadas se corrigieron y las seis capturas pasaron registro OCR real en cuentas QA conectadas a Supabase. Ver docs/OCR_MARKETS.md para cambios, validación y límites. Las capturas de la cuenta real no se alteraron durante las pruebas.

## Alcance y evidencia

Consulta de solo lectura a las seis capturas en revisión de la cuenta afectada. Los seis originales locales coinciden por SHA-256 con originalHash guardado en Supabase. Imágenes inspeccionadas visualmente y reproducción con el OCR y validador actuales, sin modificar capturas ni registrar apuestas en producción.

Evidencia privada ignorada por Git: artifacts/ocr/six-captures-cloud.json y six-captures-reproduction.json. Script de reproducción: scripts/audit-pending-captures.mjs. La prueba bloquea conexiones externas y lee los originales locales.

## Causas por archivo

| Archivo | Resultado guardado | Causa comprobada |
| --- | --- | --- |
| bet (15).png | 4/4 selecciones; inválida la tercera | Anotar en cualquier momento no pertenece al vocabulario de marketLine. Se convierte en otra selección interna sin mercado, en vez de asociarse a Erling Haaland. |
| bet (19).png | 18/18; inválida la cuarta | Mismo mercado de goleador de Haaland no reconocido. |
| bet (23).png | 8/8; inválida la sexta | Mismo mercado de goleador. El 4+ tiros al arco sí se conserva separado. |
| bet (21).png | 5/5; inválida la segunda | Total de Saques de banda no reconocido como mercado; queda separado de Más de 31.5. |
| bet (24).png | 21/21; inválida la segunda | Ganado con Pago Anticipado se trata como una tercera línea de equipo. El parser exige exactamente dos y vacía el evento Real Madrid vs. Sevilla FC. |
| bet (17).png | Cuota ausente y 0/1 selecciones | La captura contiene 4.50. Relectura local normal y comprimida recuperan cuota y evento; el modo binario mejorado omite ambas cuotas. Persisten dos problemas estructurales: Jugador que anota o da una asistencia no reconocido y Ousmane Dembélé (Paris Saint-Germain) partido en dos líneas que se interpretan como picks independientes. |

La omisión histórica de cuota en bet (17) no se reprodujo con una lectura normal nueva; no se atribuye a una causa exacta no demostrada. Sí se verificó que el fallback de cuotas en engine.ts solo se activa para cabeceras Combinada de N, no Simple.

## Implementación pendiente, por prioridad

1. Ampliar el reconocimiento explícito de mercados de goleador, gol/asistencia y saques de banda, manteniendo el texto y las líneas originales. No convertir estas categorías a goles totales.
2. Segmentar cada componente Bet Builder por geometría/marcadores; unir continuaciones de un nombre y de un mercado sin inventar texto ni absorber el siguiente pick. Mantener Suplente de Oro en el jugador correcto.
3. Separar avisos de resultado por selección de equipos y mercados. Ganado con Pago Anticipado en una selección no liquida toda la combinada.
4. Recuperar cuotas en simples además de combinadas con lectura focalizada de la región numérica. Conservar evidencia de cada pasada; no calcular la cuota a partir del retorno/stake ni reemplazar una lectura mejor por una peor.
5. Explicar el campo y selección que impiden guardar, en lugar de pedir una imagen más nítida ante mercados no soportados. Releer el archivo almacenado tras corregir el parser, sin pedir una nueva carga.
6. Añadir regresiones de estos seis boletos y controles de nombres multilínea, promociones y mercados parecidos antes de publicar y reprocesar.

## Estado

Auditoría realizada; no se cambiaron reglas de producción ni estados de las seis capturas. Las subidas llegaron a Supabase y terminaron OCR: se trata de rechazos de validación posteriores a la lectura, no de seis fallos de carga.
