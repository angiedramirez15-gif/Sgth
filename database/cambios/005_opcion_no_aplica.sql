-- =====================================================================
--  SGTH - Cambio 005: opción "No aplica" en fondo de pensiones y
--  caja de compensación
--  Fecha: 09/11/2026
--
--  Para colaboradores que no cotizan a pensión o no tienen caja de
--  compensación (por ejemplo: aprendices, pensionados o contratos de
--  prestación de servicios). "No aplica" es distinto de dejar el campo
--  vacío, que significa "sin registrar".
--
--  Ejecutar UNA VEZ en HeidiSQL, conectado como root. Se puede repetir
--  sin error.
-- =====================================================================

USE sgth;

INSERT IGNORE INTO entidades_seguridad_social (tipo, nombre) VALUES
  ('AFP', 'No aplica'),
  ('CCF', 'No aplica');

-- Verificación: deben aparecer 2 filas
SELECT id, tipo, nombre, activo
  FROM entidades_seguridad_social
 WHERE nombre = 'No aplica'
 ORDER BY tipo;
