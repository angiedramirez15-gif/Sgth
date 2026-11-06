-- =====================================================================
--  SGTH - Cambio 004: datos adicionales del colaborador (Fase 3)
--  Fecha: 06/11/2026
--
--  Agrega: tipo de sangre, estado civil, hijos, personas a cargo,
--  nivel educativo, datos bancarios y fondo de cesantías.
--
--  Ejecutar UNA VEZ en HeidiSQL, conectado como root, después de los
--  scripts 01, 02 y 03. Se puede repetir sin error (IF NOT EXISTS).
-- =====================================================================

USE sgth;

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS tipo_sangre ENUM('O+','O-','A+','A-','B+','B-','AB+','AB-') NULL
      COMMENT 'Dato de salud: visible para TH, Administrador y SST' AFTER fecha_nacimiento,
  ADD COLUMN IF NOT EXISTS estado_civil ENUM('SOLTERO','CASADO','UNION_LIBRE','SEPARADO','DIVORCIADO','VIUDO') NULL AFTER tipo_sangre,
  ADD COLUMN IF NOT EXISTS numero_hijos TINYINT UNSIGNED NULL AFTER estado_civil,
  ADD COLUMN IF NOT EXISTS personas_a_cargo TINYINT UNSIGNED NULL AFTER numero_hijos,
  ADD COLUMN IF NOT EXISTS nivel_educativo ENUM('PRIMARIA','BACHILLER','TECNICO','TECNOLOGO','PROFESIONAL','ESPECIALIZACION','MAESTRIA','DOCTORADO') NULL AFTER personas_a_cargo,
  ADD COLUMN IF NOT EXISTS cesantias_id INT UNSIGNED NULL AFTER ccf_id,
  ADD COLUMN IF NOT EXISTS banco VARCHAR(80) NULL COMMENT 'Dato sensible' AFTER salario,
  ADD COLUMN IF NOT EXISTS tipo_cuenta ENUM('AHORROS','CORRIENTE') NULL COMMENT 'Dato sensible' AFTER banco,
  ADD COLUMN IF NOT EXISTS numero_cuenta VARCHAR(30) NULL COMMENT 'Dato sensible' AFTER tipo_cuenta;

-- Llave foránea del fondo de cesantías (solo si no existe)
SET @existe := (SELECT COUNT(*) FROM information_schema.table_constraints
                 WHERE constraint_schema = 'sgth' AND table_name = 'colaboradores'
                   AND constraint_name = 'fk_colab_cesantias');
SET @sql := IF(@existe = 0,
  'ALTER TABLE colaboradores ADD CONSTRAINT fk_colab_cesantias FOREIGN KEY (cesantias_id) REFERENCES entidades_seguridad_social (id)',
  'SELECT ''fk_colab_cesantias ya existe'' AS aviso');
PREPARE paso FROM @sql;
EXECUTE paso;
DEALLOCATE PREPARE paso;

-- Verificación: deben aparecer las 9 columnas nuevas
SELECT column_name, column_type
  FROM information_schema.columns
 WHERE table_schema = 'sgth' AND table_name = 'colaboradores'
   AND column_name IN ('tipo_sangre','estado_civil','numero_hijos','personas_a_cargo','nivel_educativo',
                       'cesantias_id','banco','tipo_cuenta','numero_cuenta')
 ORDER BY ordinal_position;
