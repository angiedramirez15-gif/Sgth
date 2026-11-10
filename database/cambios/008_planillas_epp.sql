-- =====================================================================
--  SGTH - Cambio 008: entrega grupal de EPP (Fase 5)
--  Fecha: 10/11/2026
--
--  Una planilla agrupa las actas de EPP de varias personas que firman
--  en la misma hoja. Cada persona conserva su propia acta y su fecha de
--  reposición; al subir la planilla firmada quedan completas todas.
--
--  Ejecutar en HeidiSQL conectado como ROOT. Se puede repetir sin error.
-- =====================================================================

USE sgth;

CREATE TABLE IF NOT EXISTS planillas_epp (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  consecutivo           VARCHAR(20)  NOT NULL COMMENT 'PLA-2026-0001',
  fecha                 DATE         NOT NULL,
  motivo                VARCHAR(30)  NOT NULL,
  usuario_id            INT UNSIGNED NOT NULL COMMENT 'Quien entrega y firma',
  firmante_nombre       VARCHAR(150) NOT NULL,
  firmante_cargo        VARCHAR(100) NOT NULL,
  observaciones         VARCHAR(500) NULL,
  ruta_pdf_generado     VARCHAR(500) NULL,
  ruta_planilla_firmada VARCHAR(500) NULL,
  fecha_carga_firmada   DATETIME     NULL,
  creado_en             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_planilla_consecutivo (consecutivo),
  CONSTRAINT fk_planilla_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB COMMENT='Entregas grupales de EPP firmadas en una sola hoja';

CREATE TABLE IF NOT EXISTS consecutivos_planilla (
  anio    SMALLINT UNSIGNED NOT NULL,
  ultimo  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (anio)
) ENGINE=InnoDB COMMENT='Último número de planilla de EPP por año (PLA-AAAA-NNNN)';

ALTER TABLE actas
  ADD COLUMN IF NOT EXISTS planilla_id INT UNSIGNED NULL
      COMMENT 'Entrega grupal de EPP a la que pertenece el acta' AFTER periodo_dotacion_id;

SET @existe := (SELECT COUNT(*) FROM information_schema.table_constraints
                 WHERE constraint_schema = 'sgth' AND table_name = 'actas' AND constraint_name = 'fk_acta_planilla');
SET @sql := IF(@existe = 0,
  'ALTER TABLE actas ADD CONSTRAINT fk_acta_planilla FOREIGN KEY (planilla_id) REFERENCES planillas_epp (id)',
  'SELECT ''fk_acta_planilla ya existe'' AS aviso');
PREPARE paso FROM @sql;
EXECUTE paso;
DEALLOCATE PREPARE paso;

-- Verificación: deben salir 2 y 1
SELECT (SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = 'sgth' AND table_name IN ('planillas_epp', 'consecutivos_planilla')) AS tablas_nuevas,
       (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = 'sgth' AND table_name = 'actas' AND column_name = 'planilla_id') AS columna_planilla;
