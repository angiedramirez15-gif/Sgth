-- =====================================================================
--  SGTH - Cambio 012: base de pruebas y usuario de respaldo (Fase 7)
--  Fecha: 11/11/2026
--
--  1. sgth_pruebas: base aparte para desarrollar y probar (C:\Proyectos\SGTH).
--     La base "sgth" queda solo para la versión en uso (C:\SGTH\app).
--     Se llena restaurando un respaldo (ver la guía de puesta en marcha).
--  2. sgth_respaldo: usuario de solo lectura que usa el respaldo diario.
--
--  ANTES DE EJECUTAR: reemplace CAMBIAR_CLAVE_RESPALDO (las 4 veces) por una
--  clave larga. No guarde este archivo con la clave real ni lo suba a GitHub.
--  Ejecutar en HeidiSQL conectado como ROOT. Se puede repetir sin error.
-- =====================================================================

SET NAMES utf8mb4;

-- 1. Base de pruebas, con los mismos permisos de la aplicación
CREATE DATABASE IF NOT EXISTS sgth_pruebas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON sgth_pruebas.* TO 'sgth_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON sgth_pruebas.* TO 'sgth_app'@'127.0.0.1';

-- 2. Usuario de respaldo: solo puede leer la base en uso
CREATE USER IF NOT EXISTS 'sgth_respaldo'@'localhost'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('CAMBIAR_CLAVE_RESPALDO');
CREATE USER IF NOT EXISTS 'sgth_respaldo'@'127.0.0.1'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('CAMBIAR_CLAVE_RESPALDO');
ALTER USER 'sgth_respaldo'@'localhost'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('CAMBIAR_CLAVE_RESPALDO');
ALTER USER 'sgth_respaldo'@'127.0.0.1'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('CAMBIAR_CLAVE_RESPALDO');
GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER, EVENT ON sgth.* TO 'sgth_respaldo'@'localhost';
GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER, EVENT ON sgth.* TO 'sgth_respaldo'@'127.0.0.1';
FLUSH PRIVILEGES;

-- Verificación: debe salir sgth_pruebas y 2 filas de sgth_respaldo
SHOW DATABASES LIKE 'sgth_pruebas';
SELECT user, host FROM mysql.user WHERE user = 'sgth_respaldo';
