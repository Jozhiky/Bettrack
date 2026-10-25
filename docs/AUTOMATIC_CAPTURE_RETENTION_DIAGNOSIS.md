# Diagnóstico de las trece capturas retenidas

25/10/2026. Diagnóstico sobre `3d022af` del PR #13, sin modificar el motor,
las reglas de admisión, los oráculos ni datos productivos. Las trece corresponden
al banco autorizado de 28 imágenes; no son un recuento de la cuenta productiva.

## Evidencia comprobada

Se revisó el informe completo de calificación (15 aptas, 13 retenidas), se
cotejaron visualmente nueve imágenes y se repitió OCR local de las ocho sin
acuerdo válido, guardando ahora ambos valores de cada discrepancia. El navegador
solo pudo acceder a localhost: cero destinos externos y cero escrituras financieras.
Las ocho reprodujeron sus retenciones: 429/443 checks exactos, cero selecciones
omitidas o añadidas y cero atribuciones de colocación/resultado/cashout sin evidencia.
Este subconjunto no sustituye la medición general de 1068/1089 ni su oráculo.

Diagnóstico privado, ignorado por Git:
`test-results/retention-diagnosis/report.json` y
`test-results/retention-diagnosis.mjs`. No publicar OCR completo ni imágenes.

## Causa por captura

| Caso del banco                 | Bloqueo reproducido                                                                                     | Mejora que debe verificarse                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `three-first-half-second`      | Más/Mas en selección y mercado entre los dos pases; ningún otro bloqueo                                 | Comparar el significado del vocabulario reconocido, preservando texto original y cifras                                  |
| `mixed-five-selections`        | Más/Mas en una selección; ningún otro bloqueo                                                           | Misma comparación semántica acotada                                                                                      |
| `mixed-team-match-scorer`      | Más/Mas en mercados y selecciones; ningún otro bloqueo                                                  | Misma comparación semántica, sin alterar el participante                                                                 |
| `three-team-goals`             | Más/Mas y Milán/Milan en el nombre del equipo                                                           | Releer la región del nombre; no eliminar tildes globalmente de identidades                                               |
| `seven-first-half-goals`       | Más/Mas y colocación no acreditada por las reglas actuales                                              | Resolver ambos controles; la tilde por sí sola no habilita el registro                                                   |
| `player-four-early`            | Cuota de la segunda selección: null en un pase y 2.30 en el otro; 2.30 es visible                       | Recorte de la cuota con contexto de su fila y lectura independiente concordante                                          |
| `team-goals-juventus-brighton` | Ambos pases leen `€.`, donde la imagen muestra `&`; evento y mercado dejan de coincidir                 | Relectura localizada del participante; no sustituir caracteres a ciegas ni adivinar equipos                              |
| `player-four-updated`          | Nombre anterior tachado junto a sustituto, identidad ambigua y colocación no acreditada                 | Interpretación visual de tachado y Suplente de Oro, conservando ambos nombres y procedencia; verificar colocación aparte |
| `failed-leg-juventus`          | Solo colocación no acreditada; hay cruz roja de selección y potencial cero, sin cabecera global Perdida | Validar señales visuales del boleto colocado y distinguir resultado de selección de liquidación global                   |
| `failed-leg-three-goals`       | Solo colocación no acreditada; selección fallida dentro de combinada, sin cabecera global Perdida       | Mismo análisis, con exclusión de sistemas, devoluciones, parciales y cashouts previos                                    |
| `three-first-half-goals`       | Solo colocación no acreditada; datos y lectura concuerdan                                               | Reconocer evidencia adicional del formato de boleto aceptado, sin basarse únicamente en que está en vivo                 |
| `brugge-builder-early`         | Solo colocación no acreditada; texto completo, sin oferta o recibo                                      | Validar contexto de boleto colocado; conservar Pendiente y mercados internos                                             |
| `brugge-builder-later`         | Solo colocación no acreditada; una línea marcada no liquida todo el Builder                             | Misma comprobación; no convertir un acierto parcial en Ganada                                                            |

Agrupación excluyente: **3** diferencias de vocabulario, **1** nombre con tilde,
**1** cuota perdida, **1** carácter de participante, **1** sustitución con colocación
pendiente, **5** solo colocación y **1** tilde más colocación: **13**.
La colocación afecta a **7** en total. No son trece fallos de reconocimiento de texto.

## Límites de las reglas actuales

`automaticEvidence.ts` compara cadenas completas de términos críticos: aun cuando
`semantics.ts` interpreta Más/Mas como el mismo operador, el acuerdo automático
rechaza esa diferencia literal. Hay tres candidatos claros para quitar ese falso
bloqueo; subir de 15 a 18 aptas es una hipótesis verificable, no una mejora entregada.

`placement.ts` acredita recibo textual, cabecera terminal Betano u oferta cashout
contextual. No modela todavía otras señales visuales de aceptación. Por eso
«colocación desconocida» describe la limitación del detector; no prueba que el
usuario no haya realizado esas apuestas ni que todas esas imágenes sean imposibles
de automatizar. Rayo, marcador, cruz roja y potencial cero no deben funcionar como
pruebas aisladas de aceptación o liquidación.

Los dos pases usan el mismo motor: pueden repetir el mismo error, como ocurre con
Brighton. Coincidencia textual y porcentaje de confianza no garantizan exactitud.
Hace falta cotejar regiones, relaciones entre campos y evidencia visual validada.

## Trabajo siguiente, por prioridad

1. Acuerdo semántico limitado a vocabulario conocido de mercados y selecciones.
   Debe conservar operador, línea numérica, período, ámbito, participante y cuotas;
   nunca normalizar nombres libremente. Añadir negativos Más/Menos, 0.5/1.5,
   equipo/partido, primer tiempo/partido completo y nombres similares.
2. Recortes automáticos del campo discrepante con margen, escala y segmentación
   adecuados. Empezar por cuota 2.30, ampersand y nombre con tilde. Mantener OCR
   original y vincular el nuevo dato a sus píxeles y fila; ninguna reconstrucción
   de una cuota ausente a partir del producto de otras.
3. Reconocimiento visual de tachados, sustituciones, aceptación y estados por casa.
   Exige ejemplos positivos y negativos de preparación, boleto abierto, resultado
   parcial y liquidado. El banco actual por sí solo no acredita todos esos formatos.
4. Repetir el banco completo inalterado, pruebas de no registro incorrecto y QA
   aislado si se modifica la ruta de registro. Revisar además el contrato FASE 3
   pendiente que ya fallaba en la base PR #12; no maquillar su expectativa.

No se necesita un OCR de pago ni otra instalación para empezar los puntos 1 y 2.
Los originales disponibles bastan para esas reproducciones. Comparar otro modelo
local solo tendría sentido después de medir qué errores persisten con este trabajo.

## Documentación oficial consultada

- [Tesseract: mejorar calidad](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html):
  escala, contraste, márgenes y segmentación. El proyecto ya amplía/invierte las
  imágenes; falta aplicar ajustes específicos a los campos que discrepan.
- [Tesseract.js: API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md):
  regiones mediante `rectangle`, modos de segmentación y parámetros del reconocedor.
- [Betano: Suplente de Oro](https://support.betano.pe/hc/es-pe/articles/33391121411101--Como-funciona-la-oferta-Suplente-de-Oro):
  la promoción puede trasladar la selección al sustituto. Explica el formato, pero
  no acredita por sí sola qué nombre concreto está tachado en una imagen.
- [Betano: tipos de apuestas](https://support.betano.pe/hc/es-pe/articles/7412097332253--Cu%C3%A1les-son-los-tipos-de-apuestas):
  diferencia simples, combinadas y sistemas. La regla de una selección perdida en
  combinada no debe generalizarse a sistemas ni reemplazar evidencia de liquidación.

Esta entrega documenta causas y pruebas de reproducción. No implementa todavía
las mejoras propuestas ni cambia la cobertura automática de 15/28. No se repitieron
unitarias/build por un cambio exclusivamente documental. Producción intacta.
