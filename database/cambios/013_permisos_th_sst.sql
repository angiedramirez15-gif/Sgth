-- =====================================================================
--  SGTH - Cambio 013: ajuste de permisos de Talento Humano y SST
--  Fecha: 13/11/2026
--
--  Talento Humano: todo menos Configuración, Usuarios y editar plantillas.
--    + EPP completo (inventario, matriz, entregas y planillas)
--    + editar catálogos, ver la auditoría y las alertas de SST
--  SST: solo lo que le compete.
--    colaboradores, documentos marcados para SST, EPP y SOLO las actas de EPP.
--    Ya no ve el inventario de dotación, equipos y muebles, las plantillas ni
--    las actas de dotación, equipos, muebles y devoluciones.
--
--  Las personas con estos roles deben volver a iniciar sesión (se cierran sus
--  sesiones al ejecutar este script).
--  Ejecutar en HeidiSQL conectado como ROOT. Se puede repetir sin error.
-- =====================================================================

SET NAMES utf8mb4;
USE sgth;

INSERT IGNORE INTO permisos (codigo, modulo, descripcion)
VALUES ('actas_epp.ver', 'actas', 'Consultar solo las actas y planillas de EPP');

-- Talento Humano
INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p
    ON p.codigo IN ('inventario_epp.gestionar', 'actas_epp.gestionar', 'catalogos.gestionar', 'auditoria.ver', 'alertas_sst.ver')
 WHERE r.codigo = 'TH';

-- SST: quitar lo que no le compete y dar solo las actas de EPP
DELETE rp FROM rol_permisos rp
  JOIN roles r ON r.id = rp.rol_id
  JOIN permisos p ON p.id = rp.permiso_id
 WHERE r.codigo = 'SST'
   AND p.codigo IN ('inventario_dotacion.ver', 'inventario_activos.ver', 'plantillas.ver', 'actas.ver');
INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo = 'actas_epp.ver' WHERE r.codigo = 'SST';

-- El administrador tiene todos los permisos, también el nuevo
INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p WHERE r.codigo = 'ADMIN';

-- Cierra las sesiones de TH y SST para que entren con los permisos nuevos
UPDATE usuarios u JOIN roles r ON r.id = u.rol_id
   SET u.version_sesion = u.version_sesion + 1
 WHERE r.codigo IN ('TH', 'SST');

-- Verificación: permisos de cada rol
SELECT r.codigo AS rol, COUNT(*) AS permisos,
       GROUP_CONCAT(p.codigo ORDER BY p.codigo SEPARATOR ', ') AS detalle
  FROM roles r JOIN rol_permisos rp ON rp.rol_id = r.id JOIN permisos p ON p.id = rp.permiso_id
 WHERE r.codigo IN ('TH', 'SST')
 GROUP BY r.codigo;
