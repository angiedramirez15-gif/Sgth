-- =====================================================================
--  SGTH - Cambio 007: actas de entrega (Fase 4b)
--  Fecha: 09/11/2026
--
--  Agrega:
--   - Ubicación del puesto de trabajo en el acta de muebles.
--   - Texto del pie de página de las actas (dirección, teléfono y correo).
--   - Documento original escaneado de las actas antiguas.
--
--  Ejecutar en HeidiSQL conectado como ROOT. Se puede repetir sin error.
-- =====================================================================

USE sgth;

ALTER TABLE actas
  ADD COLUMN IF NOT EXISTS ubicacion VARCHAR(150) NULL
      COMMENT 'Solo actas de muebles: puesto u oficina donde quedan' AFTER ciudad,
  ADD COLUMN IF NOT EXISTS ruta_soporte_original VARCHAR(500) NULL
      COMMENT 'Solo actas antiguas: escaneo del documento original' AFTER ruta_acta_firmada;

INSERT IGNORE INTO configuracion (clave, valor, descripcion) VALUES
  ('pie_actas',
   'Vía Aeropuerto – Cencar KM 5 – 200 ADM, Parque Industrial Guajira 7 | Cencar y Palmira – Colombia. Teléfono: 3009124445 | E-mail: administracion@drimduit.com',
   'Pie de página de las actas; los renglones se separan con |');

-- Verificación: deben salir 2 y 1
SELECT (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = 'sgth' AND table_name = 'actas' AND column_name IN ('ubicacion', 'ruta_soporte_original')) AS columnas_nuevas,
       (SELECT COUNT(*) FROM configuracion WHERE clave = 'pie_actas') AS pie_actas;
