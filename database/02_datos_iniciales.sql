-- =====================================================================
--  SGTH - Sistema de Gestión de Talento Humano - DRIM DUIT S.A.S.
--  Script 02: datos iniciales
--  Ejecutar DESPUÉS de 01_esquema.sql
--  Versión del modelo: 1.3  -  Fecha: 05/11/2026
-- =====================================================================

USE sgth;
SET NAMES utf8mb4;
START TRANSACTION;

-- 1. Roles
INSERT INTO roles (codigo, nombre, descripcion) VALUES
  ('ADMIN', 'Administrador', 'Gestiona usuarios, catálogos, plantillas y configuración. Acceso total.'),
  ('TH', 'Talento Humano', 'Colaboradores, documentos, dotación, equipos, muebles y otros elementos.'),
  ('SST', 'Seguridad y Salud en el Trabajo', 'Inventario y entregas de EPP; consulta de colaboradores.'),
  ('CONSULTA', 'Consulta', 'Solo lectura y reportes.');

-- 2. Permisos
INSERT INTO permisos (codigo, modulo, descripcion) VALUES
  ('usuarios.gestionar', 'usuarios', 'Crear, editar e inactivar usuarios y asignar roles'),
  ('configuracion.gestionar', 'configuracion', 'Modificar parámetros del sistema'),
  ('auditoria.ver', 'auditoria', 'Consultar el registro de auditoría'),
  ('catalogos.ver', 'catalogos', 'Consultar catálogos'),
  ('catalogos.gestionar', 'catalogos', 'Crear y editar cargos, áreas, tipos de documento, entidades y proveedores'),
  ('colaboradores.ver', 'colaboradores', 'Consultar datos básicos de colaboradores'),
  ('colaboradores.gestionar', 'colaboradores', 'Crear, editar y retirar colaboradores'),
  ('colaboradores.ver_sensibles', 'colaboradores', 'Ver salario y datos sensibles'),
  ('documentos.ver', 'documentos', 'Ver todos los documentos del expediente'),
  ('documentos.ver_sst', 'documentos', 'Ver solo documentos marcados como visibles para SST'),
  ('documentos.gestionar', 'documentos', 'Cargar, reemplazar e inactivar documentos'),
  ('inventario_dotacion.ver', 'inventario', 'Consultar inventario de dotación'),
  ('inventario_dotacion.gestionar', 'inventario', 'Catálogo, entradas y ajustes de dotación'),
  ('inventario_epp.ver', 'inventario', 'Consultar inventario de EPP'),
  ('inventario_epp.gestionar', 'inventario', 'Catálogo, entradas, ajustes y matriz de EPP'),
  ('inventario_activos.ver', 'inventario', 'Consultar equipos, muebles y otros'),
  ('inventario_activos.gestionar', 'inventario', 'Catálogo, activos, entradas y bajas de equipos, muebles y otros'),
  ('actas.ver', 'actas', 'Consultar actas y descargar PDF'),
  ('actas_dotacion.gestionar', 'actas', 'Registrar entregas de dotación'),
  ('actas_epp.gestionar', 'actas', 'Registrar entregas de EPP'),
  ('actas_activos.gestionar', 'actas', 'Registrar entregas, traspasos y devoluciones de equipos, muebles y otros'),
  ('plantillas.ver', 'actas', 'Ver textos de las plantillas de acta'),
  ('plantillas.gestionar', 'actas', 'Editar textos de las plantillas de acta'),
  ('alertas_th.ver', 'alertas', 'Ver alertas de Talento Humano'),
  ('alertas_sst.ver', 'alertas', 'Ver alertas de SST'),
  ('reportes.ver', 'reportes', 'Consultar y exportar reportes');

-- 3. Permisos por rol (ADMIN recibe todos)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p WHERE r.codigo = 'ADMIN';

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo IN ('catalogos.ver', 'colaboradores.ver', 'colaboradores.gestionar', 'colaboradores.ver_sensibles', 'documentos.ver', 'documentos.gestionar', 'inventario_dotacion.ver', 'inventario_dotacion.gestionar', 'inventario_epp.ver', 'inventario_activos.ver', 'inventario_activos.gestionar', 'actas.ver', 'actas_dotacion.gestionar', 'actas_activos.gestionar', 'plantillas.ver', 'alertas_th.ver', 'reportes.ver')
WHERE r.codigo = 'TH';

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo IN ('catalogos.ver', 'colaboradores.ver', 'documentos.ver_sst', 'inventario_dotacion.ver', 'inventario_epp.ver', 'inventario_epp.gestionar', 'inventario_activos.ver', 'actas.ver', 'actas_epp.gestionar', 'plantillas.ver', 'alertas_sst.ver', 'reportes.ver')
WHERE r.codigo = 'SST';

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo IN ('colaboradores.ver', 'inventario_dotacion.ver', 'inventario_epp.ver', 'inventario_activos.ver', 'actas.ver', 'alertas_th.ver', 'alertas_sst.ver', 'reportes.ver')
WHERE r.codigo = 'CONSULTA';

-- 4. Usuario administrador inicial
--    Usuario: admin   Clave temporal: Sgth2026*
--    El sistema obliga a cambiar la clave en el primer ingreso (debe_cambiar_clave = 1).
INSERT INTO usuarios (usuario, clave_hash, nombre_completo, cargo, rol_id, debe_cambiar_clave)
SELECT 'admin', '$2b$10$iJ.r1KW/yiarwgJZiUqe3u9YEvVxG0aFWUBND09.ccld3kUMuoI2W',
       'Administrador SGTH', 'Administrador del sistema', id, 1
FROM roles WHERE codigo = 'ADMIN';

-- 5. Tipos de documento de identidad
INSERT INTO tipos_documento_identidad (codigo, nombre) VALUES
  ('CC', 'Cédula de ciudadanía'),
  ('CE', 'Cédula de extranjería'),
  ('TI', 'Tarjeta de identidad'),
  ('PPT', 'Permiso por Protección Temporal'),
  ('PA', 'Pasaporte');

-- 6. Tipos de documento del expediente
INSERT INTO tipos_documento_expediente (nombre, maneja_vencimiento, dias_alerta, visible_sst, es_sensible) VALUES
  ('Documento de identidad', 0, NULL, 0, 0),
  ('Hoja de vida', 0, NULL, 0, 0),
  ('Contrato de trabajo', 1, '30', 0, 0),
  ('Otrosí al contrato', 0, NULL, 0, 0),
  ('Certificados de estudio', 0, NULL, 0, 0),
  ('Certificados laborales', 0, NULL, 0, 0),
  ('Antecedentes (Procuraduría, Contraloría, Policía)', 0, NULL, 0, 0),
  ('RUT', 0, NULL, 0, 0),
  ('Certificación bancaria', 0, NULL, 0, 1),
  ('Afiliación EPS', 0, NULL, 0, 0),
  ('Afiliación fondo de pensiones', 0, NULL, 0, 0),
  ('Afiliación ARL', 0, NULL, 1, 0),
  ('Afiliación caja de compensación', 0, NULL, 0, 0),
  ('Examen médico ocupacional de ingreso', 1, '30', 1, 1),
  ('Examen médico ocupacional periódico', 1, '30', 1, 1),
  ('Examen médico ocupacional de retiro', 0, NULL, 1, 1),
  ('Certificado de trabajo seguro en alturas', 1, '30', 1, 0),
  ('Inducción y reinducción SST', 0, NULL, 1, 0),
  ('Autorización de tratamiento de datos personales', 0, NULL, 0, 0),
  ('Renuncia o carta de terminación', 0, NULL, 0, 0),
  ('Paz y salvo', 0, NULL, 0, 0),
  ('Otros', 0, NULL, 0, 0);

-- 7. Entidades de seguridad social (lista inicial: revisar y completar en el sistema)
INSERT INTO entidades_seguridad_social (tipo, nombre) VALUES
  ('EPS', 'Nueva EPS'),
  ('EPS', 'EPS Sura'),
  ('EPS', 'Sanitas'),
  ('EPS', 'Salud Total'),
  ('EPS', 'Coosalud'),
  ('EPS', 'Compensar'),
  ('EPS', 'Famisanar'),
  ('EPS', 'Emssanar'),
  ('EPS', 'S.O.S. Servicio Occidental de Salud'),
  ('EPS', 'Asmet Salud'),
  ('AFP', 'No aplica'),
  ('AFP', 'Colpensiones'),
  ('AFP', 'Porvenir'),
  ('AFP', 'Protección'),
  ('AFP', 'Colfondos'),
  ('AFP', 'Skandia'),
  ('ARL', 'Positiva'),
  ('ARL', 'ARL Sura'),
  ('ARL', 'Colmena Seguros'),
  ('ARL', 'Seguros Bolívar'),
  ('ARL', 'AXA Colpatria'),
  ('ARL', 'Seguros de Vida Alfa'),
  ('ARL', 'La Equidad Seguros'),
  ('ARL', 'Mapfre'),
  ('CCF', 'No aplica'),
  ('CCF', 'Comfandi'),
  ('CCF', 'Comfenalco Valle Delagente'),
  ('CESANTIAS', 'Porvenir'),
  ('CESANTIAS', 'Protección'),
  ('CESANTIAS', 'Colfondos'),
  ('CESANTIAS', 'Skandia'),
  ('CESANTIAS', 'Fondo Nacional del Ahorro');

-- 8. Períodos de dotación (Art. 232 CST)
INSERT INTO periodos_dotacion (anio, numero, fecha_limite) VALUES
  (2026, 1, '2026-04-30'),
  (2026, 2, '2026-08-31'),
  (2026, 3, '2026-12-20'),
  (2027, 1, '2027-04-30'),
  (2027, 2, '2027-08-31'),
  (2027, 3, '2027-12-20');

-- 9. Configuración
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('empresa_nombre', 'DRIM DUIT S.A.S.', 'Nombre que aparece en las actas'),
  ('ciudad_actas', 'Palmira', 'Ciudad por defecto de las actas'),
  ('prefijo_acta', 'ACT', 'Prefijo del consecutivo: ACT-AAAA-NNNN'),
  ('ruta_archivos', 'C:\\SGTH\\archivos', 'Carpeta base de documentos y actas'),
  ('tamano_max_archivo_mb', '10', 'Tamaño máximo por archivo (RF-25)'),
  ('dias_alerta_documentos', '30', 'Anticipación general de alertas de documentos'),
  ('dias_alerta_contrato', '30', 'Anticipación de alerta de fin de contrato'),
  ('dias_alerta_epp', '15', 'Anticipación de alerta de reposición de EPP'),
  ('dias_alerta_dotacion', '30', 'Anticipación de alerta antes de la fecha límite del período'),
  ('smmlv_anio', '2026', 'Año del valor de salario mínimo registrado'),
  ('smmlv_valor', NULL, 'PENDIENTE: ingresar el salario mínimo vigente según el decreto del Gobierno (RN-06)'),
  ('dotacion_tope_smmlv', '2', 'Derecho a dotación hasta este número de salarios mínimos (Art. 230 CST)'),
  ('dotacion_meses_minimos', '3', 'Meses de servicio para tener derecho a dotación (Art. 230 CST)'),
  ('sesion_minutos_inactividad', '30', 'Minutos de inactividad antes de cerrar la sesión (RF-02)'),
  ('login_intentos_maximos', '5', 'Intentos fallidos antes de bloquear el usuario 15 minutos');

-- 10. Consecutivo de actas
INSERT INTO consecutivos_acta (anio, ultimo) VALUES (2026, 0);

-- 11. Plantillas de acta (versión 1)
--     Campos que reemplaza el backend:
--     {{EL_SENOR}} el señor / la señora          {{EL_TRABAJADOR}} el trabajador / la trabajadora
--     {{EL_TRABAJADOR_MAY}} EL TRABAJADOR / LA TRABAJADORA   {{ESTE}} este / esta
--     {{NOMBRE}} {{TIPO_DOC}} {{NUMERO_DOC}} {{CARGO}} {{EMPRESA}} {{PERIODO}} {{MOTIVO}} {{UBICACION}}
--     {{TRASPASO}} ". Los equipos se encontraban asignados a ..." solo en traspasos; si no, "."
--     PENDIENTE: validación jurídica / SG-SST de las cláusulas.
INSERT INTO plantillas_acta (plantilla, version, titulo, texto_introduccion, texto_manifiesta, clausulas) VALUES
  ('DOTACION', 1, 'ACTA DE ENTREGA DE DOTACIÓN',
   'Por medio de la presente se deja constancia de la entrega de la dotación de calzado y vestido de labor correspondiente al período {{PERIODO}} a {{EL_SENOR}} {{NOMBRE}}, identificado(a) con {{TIPO_DOC}} No. {{NUMERO_DOC}}, quien desempeña el cargo de {{CARGO}} en la empresa {{EMPRESA}}, de conformidad con los artículos 230 y siguientes del Código Sustantivo del Trabajo:',
   '{{EL_TRABAJADOR_MAY}} MANIFIESTA QUE:',
   '["Recibe a satisfacción los elementos arriba descritos, nuevos, en buen estado y en las tallas que suministró a la empresa.", "Se compromete a destinar la dotación exclusivamente a su uso en las labores contratadas. De acuerdo con el artículo 233 del Código Sustantivo del Trabajo, si no la usa, la empresa quedará eximida de hacerle el suministro en el período siguiente.", "Conoce que la dotación no es compensable en dinero (artículo 234 del Código Sustantivo del Trabajo) y que no podrá venderla, cederla ni prestarla a terceros.", "Se compromete a portar la dotación en buen estado de presentación y aseo durante la jornada laboral, y a informar a Talento Humano dentro de los cinco (5) días siguientes a la entrega si alguna prenda presenta defectos de fabricación o no corresponde a su talla, para su cambio."]'),
  ('EPP', 1, 'ACTA DE ENTREGA DE ELEMENTOS DE PROTECCIÓN PERSONAL (EPP)',
   'Por medio de la presente se deja constancia de la entrega de los Elementos de Protección Personal (EPP) que se relacionan a continuación a {{EL_SENOR}} {{NOMBRE}}, identificado(a) con {{TIPO_DOC}} No. {{NUMERO_DOC}}, quien desempeña el cargo de {{CARGO}}, por motivo de {{MOTIVO}}, en cumplimiento del Sistema de Gestión de Seguridad y Salud en el Trabajo de la empresa {{EMPRESA}}:',
   '{{EL_TRABAJADOR_MAY}} MANIFIESTA QUE:',
   '["Recibe los EPP arriba descritos nuevos, en buen estado, en la talla adecuada y sin costo alguno, de acuerdo con los riesgos propios de su cargo.", "Recibió información y capacitación sobre el uso correcto, ajuste, limpieza, almacenamiento, limitaciones y vida útil de cada uno de los elementos entregados.", "Se compromete a usar los EPP de manera obligatoria y permanente durante la ejecución de las labores que lo requieran, a no modificarlos y a no prestarlos, conforme a las obligaciones de los trabajadores establecidas en el Decreto 1072 de 2015 (artículo 2.2.4.6.10) y en la Resolución 2400 de 1979.", "Informará de inmediato al área de Seguridad y Salud en el Trabajo cualquier daño, deterioro o pérdida de los elementos, para su reposición, y devolverá el elemento deteriorado al recibir el nuevo. La reposición por deterioro natural, cumplimiento de la vida útil o daño ocurrido durante el trabajo no tiene costo para el trabajador.", "Conoce que el no uso o el uso inadecuado de los EPP constituye incumplimiento de sus obligaciones en Seguridad y Salud en el Trabajo y podrá dar lugar a las medidas previstas en el Reglamento Interno de Trabajo, previo el debido proceso."]'),
  ('EQUIPOS', 1, 'ACTA DE ENTREGA DE EQUIPOS Y HERRAMIENTAS DE TRABAJO',
   'Por medio de la presente se deja constancia de la entrega de los equipos y herramientas de trabajo que se relacionan a continuación a {{EL_SENOR}} {{NOMBRE}}, {{CARGO}}, para la ejecución de sus labores para la empresa {{EMPRESA}}{{TRASPASO}}',
   '{{EL_TRABAJADOR_MAY}} MANIFIESTA QUE:',
   '["El equipo arriba descrito se entrega a título de herramienta de trabajo para el desempeño de sus funciones, y es de propiedad exclusiva de {{EMPRESA}} En caso de terminación del contrato de trabajo, o cuando la empresa así lo requiera, {{EL_TRABAJADOR}} se compromete a hacer la devolución de forma inmediata, en el estado en que se encuentre, salvo el deterioro natural derivado del uso normal.", "Usará el equipo solo para fines laborales, sin instalar programas no autorizados, retirar placas o sellos, ni prestarlo a terceros. La información que contenga es propiedad de la empresa.", "En caso de daño o pérdida total o parcial, {{EL_TRABAJADOR}} debe informar inmediatamente a la empresa, aclarando y especificando el motivo de dicho suceso. Cualquier descuento por nómina para la reposición o demás medidas a que haya lugar procederá únicamente cuando el daño o la pérdida se originen en culpa grave o dolo de {{EL_TRABAJADOR}}, y siempre que exista autorización previa, expresa, escrita y específica de {{ESTE}} para el descuento en particular, de conformidad con los artículos 59, 149 y 150 del Código Sustantivo del Trabajo y dentro de los límites legales sobre sumas descontables del salario.", "La firma de la presente acta no constituye, por sí sola, la autorización específica de descuento a que se refiere el párrafo anterior. Dicha autorización, de ser necesaria, deberá solicitarse y suscribirse de manera independiente cuando se presente el caso concreto."]'),
  ('MUEBLES', 1, 'ACTA DE ENTREGA DE MUEBLES Y ENSERES',
   'Por medio de la presente se deja constancia de la entrega de los muebles y enseres que se relacionan a continuación a {{EL_SENOR}} {{NOMBRE}}, {{CARGO}}, para su puesto de trabajo en la empresa {{EMPRESA}}, ubicado en {{UBICACION}}:',
   '{{EL_TRABAJADOR_MAY}} MANIFIESTA QUE:',
   '["Los muebles y enseres arriba descritos son de propiedad exclusiva de {{EMPRESA}} y se le asignan para el desarrollo de sus labores en el puesto de trabajo indicado.", "Se compromete a darles un uso adecuado y a cuidarlos, a no trasladarlos a otra área ni retirarlos de las instalaciones sin autorización, y a no retirar sus placas de inventario.", "En caso de terminación del contrato de trabajo, cambio de puesto o cuando la empresa así lo requiera, los devolverá de forma inmediata en el estado en que se encuentren, salvo el deterioro natural derivado del uso normal.", "En caso de daño o pérdida total o parcial, {{EL_TRABAJADOR}} debe informar inmediatamente a la empresa, aclarando y especificando el motivo de dicho suceso. Cualquier descuento por nómina para la reposición o demás medidas a que haya lugar procederá únicamente cuando el daño o la pérdida se originen en culpa grave o dolo de {{EL_TRABAJADOR}}, y siempre que exista autorización previa, expresa, escrita y específica de {{ESTE}} para el descuento en particular, de conformidad con los artículos 59, 149 y 150 del Código Sustantivo del Trabajo y dentro de los límites legales sobre sumas descontables del salario.", "La firma de la presente acta no constituye, por sí sola, la autorización específica de descuento a que se refiere el párrafo anterior. Dicha autorización, de ser necesaria, deberá solicitarse y suscribirse de manera independiente cuando se presente el caso concreto."]'),
  ('OTROS', 1, 'ACTA DE ENTREGA DE ELEMENTOS',
   'Por medio de la presente se deja constancia de la entrega de los elementos que se relacionan a continuación a {{EL_SENOR}} {{NOMBRE}}, {{CARGO}}, para la ejecución de sus labores para la empresa {{EMPRESA}}:',
   '{{EL_TRABAJADOR_MAY}} MANIFIESTA QUE:',
   '["Los elementos arriba descritos se entregan para el desempeño de sus funciones y son de propiedad exclusiva de {{EMPRESA}} En caso de terminación del contrato de trabajo, o cuando la empresa así lo requiera, se compromete a devolverlos de forma inmediata, en el estado en que se encuentren, salvo el deterioro natural derivado del uso normal.", "En caso de daño o pérdida total o parcial, {{EL_TRABAJADOR}} debe informar inmediatamente a la empresa, aclarando y especificando el motivo de dicho suceso. Cualquier descuento por nómina para la reposición o demás medidas a que haya lugar procederá únicamente cuando el daño o la pérdida se originen en culpa grave o dolo de {{EL_TRABAJADOR}}, y siempre que exista autorización previa, expresa, escrita y específica de {{ESTE}} para el descuento en particular, de conformidad con los artículos 59, 149 y 150 del Código Sustantivo del Trabajo y dentro de los límites legales sobre sumas descontables del salario.", "La firma de la presente acta no constituye, por sí sola, la autorización específica de descuento a que se refiere el párrafo anterior. Dicha autorización, de ser necesaria, deberá solicitarse y suscribirse de manera independiente cuando se presente el caso concreto."]'),
  ('DEVOLUCION', 1, 'ACTA DE DEVOLUCIÓN DE ELEMENTOS',
   'Por medio de la presente se deja constancia de que {{EL_SENOR}} {{NOMBRE}}, {{CARGO}}, devuelve a la empresa {{EMPRESA}} los elementos que se relacionan a continuación, por motivo de {{MOTIVO}}:',
   'LAS PARTES MANIFIESTAN QUE:',
   '["La empresa recibe los elementos arriba descritos en el estado indicado en la columna correspondiente. Los faltantes, daños o novedades encontrados quedan registrados en la columna de observaciones.", "Con la firma de la presente acta, los elementos relacionados quedan descargados de la responsabilidad de {{EL_TRABAJADOR}}, y la presente sirve como soporte para su paz y salvo respecto de dichos elementos.", "Si se registran daños o faltantes, cualquier descuento solo procederá en los términos de los artículos 59, 149 y 150 del Código Sustantivo del Trabajo, con autorización previa, expresa, escrita y específica de {{EL_TRABAJADOR}}. La firma de la presente acta no constituye, por sí sola, dicha autorización."]');

COMMIT;

-- Verificación rápida: deben aparecer 4 roles, 26 permisos, 1 usuario y 6 plantillas
SELECT (SELECT COUNT(*) FROM roles) AS roles, (SELECT COUNT(*) FROM permisos) AS permisos,
       (SELECT COUNT(*) FROM usuarios) AS usuarios, (SELECT COUNT(*) FROM plantillas_acta) AS plantillas;
