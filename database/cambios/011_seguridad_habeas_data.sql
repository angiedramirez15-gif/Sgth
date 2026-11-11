-- =====================================================================
--  SGTH - Cambio 011: seguridad y Habeas Data (Ley 1581 de 2012)
--  Fecha: 11/11/2026
--
--  - Cierre de las sesiones abiertas al inactivar un usuario o cambiar su clave
--  - Contraseñas: historial (no repetir las últimas 5) y vencimiento
--  - Doble verificación con código de 6 dígitos (app en el celular)
--  - Compromiso de confidencialidad que cada usuario acepta (con versiones)
--  - Autorización de tratamiento de datos obligatoria para todos, con alerta
--
--  Ejecutar en HeidiSQL conectado como ROOT. Se puede repetir sin error.
-- =====================================================================

SET NAMES utf8mb4;
USE sgth;

-- 1. Usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS version_sesion   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Al aumentar se cierran todas las sesiones abiertas' AFTER bloqueado_hasta,
  ADD COLUMN IF NOT EXISTS clave_cambiada_en DATETIME NULL COMMENT 'Para el vencimiento de la clave' AFTER version_sesion,
  ADD COLUMN IF NOT EXISTS totp_secreto     VARCHAR(255) NULL COMMENT 'Secreto de la doble verificación, cifrado' AFTER clave_cambiada_en,
  ADD COLUMN IF NOT EXISTS totp_activo      TINYINT(1) NOT NULL DEFAULT 0 AFTER totp_secreto,
  ADD COLUMN IF NOT EXISTS totp_respaldo    TEXT NULL COMMENT 'JSON con los hashes de los códigos de respaldo sin usar' AFTER totp_activo,
  ADD COLUMN IF NOT EXISTS totp_ultimo_paso BIGINT NULL COMMENT 'Último código aceptado; impide usarlo dos veces' AFTER totp_respaldo;

UPDATE usuarios SET clave_cambiada_en = NOW() WHERE clave_cambiada_en IS NULL;

-- 2. Claves anteriores (para no repetir las últimas 5)
CREATE TABLE IF NOT EXISTS historial_claves (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NOT NULL,
  clave_hash  VARCHAR(255) NOT NULL,
  creado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_historial_claves_usuario (usuario_id, id),
  CONSTRAINT fk_historial_claves_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB COMMENT='Hashes de las claves anteriores de cada usuario';

-- 3. Textos legales con versiones y su aceptación
CREATE TABLE IF NOT EXISTS textos_legales (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo        ENUM('CONFIDENCIALIDAD') NOT NULL,
  version     SMALLINT UNSIGNED NOT NULL,
  texto       TEXT         NOT NULL,
  vigente     TINYINT(1)   NOT NULL DEFAULT 1,
  creado_por  INT UNSIGNED NULL,
  creado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_texto_legal_version (tipo, version),
  CONSTRAINT fk_texto_legal_usuario FOREIGN KEY (creado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB COMMENT='Compromiso de confidencialidad y otros textos que los usuarios aceptan';

CREATE TABLE IF NOT EXISTS aceptaciones_legales (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED NOT NULL,
  texto_id     INT UNSIGNED NOT NULL,
  aceptado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip           VARCHAR(45)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aceptacion (usuario_id, texto_id),
  CONSTRAINT fk_aceptacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
  CONSTRAINT fk_aceptacion_texto   FOREIGN KEY (texto_id) REFERENCES textos_legales (id)
) ENGINE=InnoDB COMMENT='Quién aceptó cada versión del compromiso, cuándo y desde qué equipo';

INSERT INTO textos_legales (tipo, version, texto)
SELECT 'CONFIDENCIALIDAD', 1,
'Como usuario del Sistema de Gestión de Talento Humano (SGTH) de DRIM DUIT S.A.S., me comprometo a:

1. Usar la información de los colaboradores solo para las funciones de mi cargo y para las finalidades autorizadas por cada titular.
2. Guardar reserva sobre los datos personales y, en especial, sobre los datos sensibles (salud, exámenes médicos, datos de salario y bancarios), durante mi vinculación y después de ella.
3. No copiar, descargar, imprimir, enviar ni compartir información del sistema sin una razón laboral, y no dejarla al alcance de personas no autorizadas.
4. No prestar mi usuario, mi contraseña ni mi código de verificación, y cerrar la sesión cuando me retire del equipo.
5. Informar de inmediato al área de Talento Humano cualquier pérdida, acceso indebido o uso sospechoso de la información.

Entiendo que el sistema registra las consultas y acciones que realizo, y que el incumplimiento de este compromiso puede dar lugar a sanciones disciplinarias y a las responsabilidades previstas en la Ley 1581 de 2012 y demás normas sobre protección de datos personales.'
 WHERE NOT EXISTS (SELECT 1 FROM textos_legales WHERE tipo = 'CONFIDENCIALIDAD');

-- 4. Autorización de tratamiento de datos: obligatoria para todos los cargos
ALTER TABLE tipos_documento_expediente
  ADD COLUMN IF NOT EXISTS obligatorio_todos TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Obligatorio para todos los colaboradores, sin importar el cargo' AFTER es_sensible;

INSERT IGNORE INTO tipos_documento_expediente (nombre, maneja_vencimiento, visible_sst, es_sensible)
VALUES ('Autorización de tratamiento de datos personales', 0, 0, 0);
UPDATE tipos_documento_expediente SET obligatorio_todos = 1, activo = 1
 WHERE nombre = 'Autorización de tratamiento de datos personales';

ALTER TABLE alertas
  MODIFY tipo ENUM('DOCUMENTO_POR_VENCER','DOCUMENTO_VENCIDO','CONTRATO_POR_VENCER','EPP_REPOSICION','DOTACION_PENDIENTE','ACTA_SIN_FIRMAR','ELEMENTOS_SIN_DEVOLVER','AUTORIZACION_DATOS') NOT NULL;

-- 5. Parámetros
INSERT IGNORE INTO configuracion (clave, valor, descripcion) VALUES
  ('clave_dias_vigencia', '90', 'Días que dura una clave antes de pedir cambiarla'),
  ('clave_longitud_minima', '12', 'Caracteres mínimos de una clave');

-- Verificación: debe salir 7, 3 y 1
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'sgth' AND table_name = 'usuarios'
      AND column_name IN ('version_sesion','clave_cambiada_en','totp_secreto','totp_activo','totp_respaldo','totp_ultimo_paso'))
  + (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'sgth' AND table_name = 'tipos_documento_expediente' AND column_name = 'obligatorio_todos') AS columnas_nuevas,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'sgth'
      AND table_name IN ('historial_claves','textos_legales','aceptaciones_legales')) AS tablas_nuevas,
  (SELECT COUNT(*) FROM tipos_documento_expediente WHERE obligatorio_todos = 1) AS autorizacion_obligatoria;
