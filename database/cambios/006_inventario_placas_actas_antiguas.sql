-- =====================================================================
--  SGTH - Cambio 006: inventario (Fase 4)
--  Fecha: 09/11/2026
--
--  Agrega:
--   - Consecutivo de placas de inventario (DD-EQ-0001, DD-MU-0001).
--   - Datos para registrar actas antiguas (entregas hechas antes del sistema).
--   - Parámetros: dirección del sistema (para el QR de los stickers)
--     y prefijo de las placas.
--
--  Ejecutar en HeidiSQL conectado como ROOT (no como sgth_app).
--  Se puede repetir sin error.
-- =====================================================================

USE sgth;

CREATE TABLE IF NOT EXISTS consecutivos_placa (
  prefijo   VARCHAR(10)  NOT NULL COMMENT 'DD-EQ, DD-MU',
  ultimo    INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (prefijo)
) ENGINE=InnoDB COMMENT='Último número de placa usado por tipo de activo';

ALTER TABLE actas
  ADD COLUMN IF NOT EXISTS es_historica TINYINT(1) NOT NULL DEFAULT 0
      COMMENT '1 = entrega hecha antes del sistema; no descuenta inventario' AFTER tipo_acta,
  ADD COLUMN IF NOT EXISTS fecha_entrega_original DATE NULL
      COMMENT 'Solo actas antiguas: fecha en que realmente se entregó' AFTER fecha;

INSERT IGNORE INTO configuracion (clave, valor, descripcion) VALUES
  ('url_sistema', 'http://localhost:3000', 'Dirección con la que se abre el sistema en la red; va en el QR de los stickers'),
  ('prefijo_placa', 'DD', 'Prefijo de las placas de inventario: DD-EQ-0001');

-- Verificación
SELECT 'consecutivos_placa' AS objeto, COUNT(*) AS existe FROM information_schema.tables
 WHERE table_schema = 'sgth' AND table_name = 'consecutivos_placa'
UNION ALL
SELECT 'actas.es_historica', COUNT(*) FROM information_schema.columns
 WHERE table_schema = 'sgth' AND table_name = 'actas' AND column_name = 'es_historica'
UNION ALL
SELECT 'parámetros nuevos', COUNT(*) FROM configuracion WHERE clave IN ('url_sistema', 'prefijo_placa');
