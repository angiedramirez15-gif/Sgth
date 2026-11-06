-- =====================================================================
--  SGTH - Script 03: usuario de MariaDB para el backend (NestJS)
--  Ejecutar DESPUÉS de 01 y 02, conectado como root.
--
--  ANTES DE EJECUTAR: reemplazar CAMBIAR_ESTA_CLAVE (4 veces) por una
--  clave segura (mínimo 12 caracteres). Esa misma clave va en el archivo
--  .env del backend (DB_PASSWORD). No subir la clave real a GitHub.
--
--  Notas para MariaDB en Windows:
--   - Se crea el usuario para 'localhost' y para '127.0.0.1' porque el
--     backend se conecta por TCP a 127.0.0.1 y MariaDB los trata distinto.
--   - Se fuerza mysql_native_password. Si el usuario no existe o la
--     autenticación no coincide, MariaDB en Windows responde con el error
--     "unknown plugin auth_gssapi_client", que despista.
-- =====================================================================

CREATE USER IF NOT EXISTS 'sgth_app'@'localhost'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('CAMBIAR_ESTA_CLAVE');
CREATE USER IF NOT EXISTS 'sgth_app'@'127.0.0.1'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('CAMBIAR_ESTA_CLAVE');

-- Si el usuario ya existía, deja la clave y el método de autenticación correctos
ALTER USER 'sgth_app'@'localhost'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('CAMBIAR_ESTA_CLAVE');
ALTER USER 'sgth_app'@'127.0.0.1'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('CAMBIAR_ESTA_CLAVE');

-- Leer y escribir datos; sin permisos para borrar tablas ni crear usuarios
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON sgth.* TO 'sgth_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON sgth.* TO 'sgth_app'@'127.0.0.1';

FLUSH PRIVILEGES;

-- Verificación: deben aparecer 2 filas con plugin mysql_native_password
SELECT user, host, plugin FROM mysql.user WHERE user = 'sgth_app';
