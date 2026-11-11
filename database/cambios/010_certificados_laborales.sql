-- =====================================================================
--  SGTH - Cambio 010: certificados laborales
--  Fecha: 11/11/2026
--
--  Talento Humano genera el certificado laboral desde la ficha del
--  colaborador. Cada certificado lleva consecutivo CER-AAAA-NNNN, se
--  guarda el PDF y queda el registro de quién lo generó y para quién.
--  El texto es una plantilla más (Administración › Plantillas de actas).
--
--  Ejecutar en HeidiSQL conectado como ROOT. Se puede repetir sin error.
-- =====================================================================

SET NAMES utf8mb4;
USE sgth;

-- 1. La plantilla del certificado se guarda con las de las actas
ALTER TABLE plantillas_acta
  MODIFY plantilla ENUM('DOTACION','EPP','EQUIPOS','MUEBLES','OTROS','DEVOLUCION','CERTIFICADO') NOT NULL;

-- 2. Consecutivo por año
CREATE TABLE IF NOT EXISTS consecutivos_certificado (
  anio    SMALLINT UNSIGNED NOT NULL,
  ultimo  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (anio)
) ENGINE=InnoDB COMMENT='Último número de certificado laboral por año (CER-AAAA-NNNN)';

-- 3. Certificados generados
CREATE TABLE IF NOT EXISTS certificados_laborales (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  consecutivo       VARCHAR(20)  NOT NULL COMMENT 'CER-2026-0001',
  colaborador_id    INT UNSIGNED NOT NULL,
  plantilla_id      INT UNSIGNED NOT NULL COMMENT 'Versión de los textos usada',
  fecha_expedicion  DATE         NOT NULL,
  con_salario       TINYINT(1)   NOT NULL,
  dirigido_a        VARCHAR(150) NULL COMMENT 'Vacío = A QUIEN INTERESE',
  datos             LONGTEXT     NOT NULL COMMENT 'JSON con cargo, contrato, fechas y salario tal como salieron',
  firmante_nombre   VARCHAR(150) NOT NULL,
  firmante_cargo    VARCHAR(100) NOT NULL,
  ruta_pdf          VARCHAR(500) NULL,
  creado_por        INT UNSIGNED NOT NULL,
  creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_certificado_consecutivo (consecutivo),
  KEY ix_certificado_colaborador (colaborador_id),
  CONSTRAINT fk_certificado_colaborador FOREIGN KEY (colaborador_id) REFERENCES colaboradores (id),
  CONSTRAINT fk_certificado_plantilla   FOREIGN KEY (plantilla_id) REFERENCES plantillas_acta (id),
  CONSTRAINT fk_certificado_usuario     FOREIGN KEY (creado_por) REFERENCES usuarios (id),
  CONSTRAINT ck_certificado_datos       CHECK (JSON_VALID(datos))
) ENGINE=InnoDB COMMENT='Certificados laborales expedidos';

-- 4. Parámetros: NIT, quien firma y su firma escaneada
INSERT IGNORE INTO configuracion (clave, valor, descripcion) VALUES
  ('empresa_nit', NULL, 'NIT de la empresa; va en los certificados laborales'),
  ('certificado_firmante_nombre', NULL, 'Nombre de quien firma los certificados laborales'),
  ('certificado_firmante_cargo', 'Directora Financiera', 'Cargo de quien firma los certificados laborales'),
  ('certificado_firma', NULL, 'Imagen de la firma (se sube desde Configuración)');

-- 5. Textos iniciales del certificado (solo si todavía no existe)
INSERT INTO plantillas_acta (plantilla, version, titulo, texto_introduccion, texto_manifiesta, clausulas)
SELECT 'CERTIFICADO', 1, 'CERTIFICACIÓN LABORAL',
  'La suscrita {{CARGO_FIRMANTE}} de {{EMPRESA}}, identificada con NIT {{NIT}},',
  'CERTIFICA QUE:',
  '["{{EL_SENOR_CAP}} {{NOMBRE}}, {{IDENTIFICADO}} con {{TIPO_DOC}} No. {{NUMERO_DOC}}, {{LABORA}} en nuestra empresa {{PERIODO_LABORAL}}, desempeñando el cargo de {{CARGO}}, {{TIPO_CONTRATO}}.", "Por sus servicios {{DEVENGA}} un salario básico mensual de {{SALARIO}}.", "La presente certificación se expide a solicitud {{DEL_INTERESADO}} en {{CIUDAD}}, el {{FECHA_EXPEDICION}}."]'
 WHERE NOT EXISTS (SELECT 1 FROM plantillas_acta WHERE plantilla = 'CERTIFICADO');

-- Verificación: debe salir 2, 4 y 1
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'sgth'
      AND table_name IN ('certificados_laborales', 'consecutivos_certificado')) AS tablas_nuevas,
  (SELECT COUNT(*) FROM configuracion WHERE clave IN ('empresa_nit', 'certificado_firmante_nombre', 'certificado_firmante_cargo', 'certificado_firma')) AS parametros,
  (SELECT COUNT(*) FROM plantillas_acta WHERE plantilla = 'CERTIFICADO' AND vigente = 1) AS plantilla_certificado;
