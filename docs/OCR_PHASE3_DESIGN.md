# FASE 3 — alcance incremental y decisión de almacenamiento

Base: d54d5eb52651da13809e9c623fac054ad01a402a. Fecha: 23/10/2026.

Antes de implementar: no se necesita cambiar esquemas. `uploads.draftJson` conserva
metadatos de revisión; `audit.before/after` conserva decisiones y correcciones humanas
con fecha, captura y evidencia originales. Se mantienen los límites actuales y el
aislamiento por cuenta existente. No se realizan migraciones ni operaciones cloud.

1. Clasificar los motivos: colocación, OCR incompleto, semántica, cuota y duplicado.
2. «Añadir comprobante» crea una captura independiente auditada respecto al borrador
   de origen. No transfiere confirmación ni importes entre imágenes. El original se
   conserva; el comprobante debe superar todas las validaciones y duplicados.
3. «Revisar datos» requiere una colocación reconocida. Permite corregir eventos,
   etiquetas, selecciones y cuotas individuales, conservando OCR original. Cabecera
   financiera sin editar; datos de cabecera ausentes requieren otra captura.
4. Mostrar vista previa exacta y consentimiento explícito antes de registrar. Los
   mercados no clasificados se conservan literalmente como revisados por una persona,
   no se convierten en inferencias semánticas confirmadas. Resultado inicial Pendiente;
   ninguna oferta cashout provoca cobro. Verificar borrador/imagen vigentes para impedir
   confirmar una vista previa obsoleta; revisión y registro en la misma transacción.
5. Una lectura posterior no elimina una falta previa de colocación en la misma imagen.
   Preparación/conflicto exige otro comprobante. Si la primera lectura era desconocida
   y una posterior sí muestra aceptación, exigir revisión explícita, nunca autoguardado.
6. Ampliar con dos imágenes de fútbol compartidas por el usuario; retirar metadatos
   y verificar visualmente ausencia de PII. Los archivos actuales difieren de los
   adjuntos históricos: se anota la imagen realmente inspeccionada. Una tercera
   captura liquidada contiene ID de boleto y se excluye sin copiarla al repositorio.
   No hay cobertura nueva de NBA ni creación: reportar huecos, no fabricar evidencia.
7. Medir texto, atributos semánticos y estados por separado sobre el mismo corpus en
   base y versión actual. Mantener los cuatro errores literales conocidos visibles.
