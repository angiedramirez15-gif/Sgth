-- =====================================================================
--  SGTH - Cambio 014: avisos por correo
--  Fecha: 17/11/2026
--
--  Agrega en Configuración el correo que recibe los avisos automáticos:
--  respaldo con error, certificado HTTPS por vencer, sistema caído e
--  intentos de ingreso sospechosos. El valor se escribe después en
--  Administración › Configuración › Avisos por correo.
--
--  Ejecutar en HeidiSQL conectado como ROOT. Se puede repetir sin error.
-- =====================================================================

SET NAMES utf8mb4;
USE sgth;

INSERT IGNORE INTO configuracion (clave, valor, descripcion)
VALUES ('avisos_correo_destino', NULL, 'Correo que recibe los avisos automáticos del sistema');

-- Verificación: debe salir 1 fila
SELECT clave, valor FROM configuracion WHERE clave = 'avisos_correo_destino';
