-- =====================================================================
--  SGTH - Cambio 009: descartar alertas con motivo (Fase 6)
--  Fecha: 11/11/2026
--
--  Ejecutar en HeidiSQL conectado como ROOT. Se puede repetir sin error.
-- =====================================================================

USE sgth;

ALTER TABLE alertas
  ADD COLUMN IF NOT EXISTS motivo_descarte VARCHAR(255) NULL
      COMMENT 'Por qué se descartó a mano' AFTER atendida_en;

-- Verificación: debe salir 1
SELECT COUNT(*) AS columna_motivo FROM information_schema.columns
 WHERE table_schema = 'sgth' AND table_name = 'alertas' AND column_name = 'motivo_descarte';
