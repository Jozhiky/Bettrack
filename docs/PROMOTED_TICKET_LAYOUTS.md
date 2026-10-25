# Superaumento, Super Mejorada y Bet Builder

24/10/2026. Rama `codex/promoted-ticket-layouts`, base `35177e0` posterior al
despliegue #11. Correcciones de lectura, interpretación y explicación del borrador;
sin cambiar motor/modelos, contabilidad, esquemas ni apuestas históricas.

## Tres casos reproducidos con los originales adjuntos

| Caso | Fallo anterior | Resultado de la corrección |
| --- | --- | --- |
| bet365 Superaumento | Sin casa, stake, cuota ni selecciones | Reconoce el formato del producto, stake S/25.00, cuota aplicada 3.00 y un único Crear apuesta del mismo evento con tres mercados |
| Betano, combate con 20% Super Mejorada | El banner era una selección; faltaban evento, cuota y mercado | Una selección completa, mercado Forma del Triunfo (7-way), cuota 6.00; Ganada con retorno leído S/61.92, stake S/10.32 y neto S/51.60 |
| Betano Bet Builder | Cuatro mercados leídos, pero dos participantes con ámbito ambiguo | Conserva los cuatro mercados; el icono de Suplente de Oro aporta contexto explícito de jugador, sin buscar plantillas ni inventar suplentes |

Los tres originales se usaron solo en localhost y con destinos externos bloqueados.
No se publican imágenes, IDs de boletos, OCR privado ni ficheros de diagnóstico.
Los fixtures unitarios añadidos son sintéticos y con participantes genéricos.

## Reglas y evidencia

### bet365

[Ayuda oficial: aumentos y Superaumento](https://help.bet365.com/s/es/sports/bet-boost)
explica que la cuota aumentada aparece junto a la cuota anterior tachada.
[Crear apuesta](https://help.bet365.com/s/es/sports/bet-builder) es también el nombre
del producto que reúne mercados del mismo evento: no es siempre una orden de envío.

El parser nuevo exige conjuntamente cabecera con stake/Crear apuesta, fila del
producto con flechas y cuota final, etiqueta Superaumento, mercados y dos equipos.
Sin logo visible, identifica la casa por ese formato y mantiene su confianza para
revisión. No usa nombres de archivos como prueba. La cuota anterior ilegible queda
ausente; no convierte `00` en 2.00. La cuota aplicada se toma después de la flecha,
sin multiplicar mercados dependientes del mismo partido.

El pie S/75.00 se conserva como **importe mostrado sin cobro acreditado**. Los
checks de los mercados y la palabra Ganancias no se convierten en una liquidación
global, en un cashout ni en aceptación automática. La captura original no contiene
un estado global textual legible por el reconocimiento actual; sigue en revisión
financiera. El mensaje distingue esta falta de evidencia de un boleto abierto
acreditado. Un botón real Crear apuesta sin el formato de título sigue siendo
evidencia de preparación; las retenciones de colocación continúan protegidas.

### Betano: promoción y combate

La captura aportada muestra la etiqueta 20% Super Mejorada, cuota anterior 5.00
y aplicada 6.00. Eso no demuestra un depósito, freebet ni dinero adicional. No se
encontró una ficha oficial pública específica de esta variante en las búsquedas;
la implementación se limita al texto/precio/cobro visibles del propio boleto,
sin importar condiciones comerciales de otra promoción.

Se descarta el banner como posible selección, se separa la columna de precio
anterior del precio aplicado y se recompone el título de método de victoria
dividido solo con proximidad y alineación, seguido de su mercado explícito.
El participante debe coincidir exactamente con uno de los dos luchadores leídos.
Métodos desconocidos o nombres no coincidentes siguen en revisión. No se deduce
el deporte, la liga ni la fecha histórica a partir del nombre de un luchador.

El porcentaje se conserva como metadato de cuota. No se aplica otra vez a 6.00
ni a S/61.92. El retorno se obtiene del pie liquidado, nunca de stake × cuota.

### Bet Builder

[Betano: Bet Builder](https://support.betano.pe/hc/es-pe/articles/7468762144029--Qu%C3%A9-es-BetBuilder)
reúne mercados del mismo evento. Unas líneas resueltas y otras abiertas no dan
por ganado el boleto entero. En el caso adjunto se mantienen un evento, cuatro
mercados, stake S/20.10, cuota 2.92 y retorno **potencial** S/58.69. El botón
Cash Out S/24.32 es una oferta; no se genera retorno ni liquidación ejecutada.

[Suplente de Oro](https://support.betano.pe/hc/es-pe/articles/33391121411101--Como-funciona-la-oferta-Suplente-de-Oro)
identifica mercados de jugadores. El contexto de ese icono, asociado al mercado
leído, permite clasificar los nombres de tiros como jugadores. No cambia su texto,
no identifica un sustituto, no atribuye equipo si falta y no significa victoria.
Sin ese contexto, un nombre ambiguo sigue en revisión. Pago anticipado +2 no
convierte un participante desconocido en jugador ni liquida el boleto completo.

## Comprobaciones

- **740/740** en 34 archivos; TypeScript y build aprobados. Persiste el aviso
  conocido de chunks mayores de 500 kB.
- Pruebas nuevas: cuotas aumentadas/tachadas, banner no seleccionable, método de
  combate, coincidencia exacta del luchador, tres mercados de bet365, ambigüedad de
  períodos, promociones, ausencia de colocación, ausencia de doble bono/cargo,
  reintento tras respuesta perdida y consentimiento obligatorio.
- Prueba contable sintética del combate: una apuesta, una liquidación y dos
  movimientos; neto S/51.60 y cero depósitos. Sin consentimiento: cero movimientos.
- Prueba sintética del Builder aceptado: una pendiente, un cargo, cero retornos y
  cero liquidaciones. bet365 sin aceptación acreditada permanece sin escrituras.
- OCR real de los tres adjuntos ejecutado y contrastado antes/después localmente.
- Banco de 28: **1068/1089**, 21 diferencias (antes 1067/1089, 22); una mejora de
  ámbito de jugador respaldada por la promoción, **cero regresiones por check**,
  cero selecciones omitidas/añadidas ni colocaciones/ganancias/cashouts inventados.
  Corpus, admisión, oráculos y recursos idénticos. La primera corrida se invalidó
  porque el formateador se ejecutó a la vez y activó la barrera de integridad;
  se repitió con fuentes fijas y todas las barreras aprobadas.
- UI aislada a 375/768/1440 con los tres casos, promociones y resumen: un histórico
  preparable, dos excepciones, sin desbordamiento y cero backend/finanzas reales.
- QA autorizado aislado: tres barreras de destino y seis grupos aprobados, con
  recarga, dos sesiones, duplicados, concurrencia, respuesta perdida y guardas
  atómicas. Solo datos sintéticos; no se enviaron originales privados al QA.

Evidencia local ignorada: `test-results/promoted-tickets/`,
`test-results/ocr-phase4b/report.json`, `test-results/automatic-qa/report.json`.

## Entrega

Preparado para revisión, **no desplegado**. No hubo operaciones contra Supabase
productivo. No requiere migración ni dependencias nuevas; Tesseract local gratuito.
Las lecturas futuras aplican el formato nuevo; un borrador anterior que perdió
datos necesita releer su imagen conservada (Mejorar lectura), sin volver a subirla.
No se reescriben ni liquidan automáticamente apuestas guardadas.
