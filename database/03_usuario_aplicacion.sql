-- =====================================================================
--  SGTH - Script 03: usuario de MariaDB para el backend (NestJS)
--  Ejecutar DESPUÉS de 01 y 02, conectado como root.
--
--  ANTES DE EJECUTAR: reemplazar CAMBIAR_ESTA_CLAVE por una clave segura
--  (mínimo 12 caracteres). Esa misma clave va en el archivo .env del
--  backend (DB_PASSWORD). No subir la clave real a GitHub.
-- =====================================================================

-- Solo conexiones desde el mismo PC (el backend corre en el servidor)
CREATE USER IF NOT EXISTS 'sgth_app'@'localhost' IDENTIFIED BY 'CAMBIAR_ESTA_CLAVE';

-- Leer y escribir datos; sin permisos para borrar tablas ni crear usuarios
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON sgth.* TO 'sgth_app'@'localhost';

FLUSH PRIVILEGES;

-- Verificación
SHOW GRANTS FOR 'sgth_app'@'localhost';
