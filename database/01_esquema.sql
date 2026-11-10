-- =====================================================================
--  SGTH - Sistema de Gestión de Talento Humano
--  DRIM DUIT S.A.S.
--  Script 01: esquema de base de datos
--  Motor: MariaDB 10.6 o superior (probado con sintaxis de MariaDB 11)
--  Versión del modelo: 1.3 + cambio 004  -  Fecha: 06/11/2026
--  Instalación nueva: este script ya incluye el cambio 004 (no hace falta ejecutarlo).
--
--  Cómo ejecutarlo en HeidiSQL:
--    1. Conectarse al servidor MariaDB con el usuario root.
--    2. Archivo > Cargar archivo SQL... > seleccionar este archivo.
--    3. Ejecutar todo (F9).
--  ADVERTENCIA: el script BORRA la base sgth si ya existe.
-- =====================================================================

DROP DATABASE IF EXISTS sgth;
CREATE DATABASE sgth CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci;
USE sgth;

-- ---------------------------------------------------------------------
--  1. SEGURIDAD
-- ---------------------------------------------------------------------

CREATE TABLE roles (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(20)  NOT NULL COMMENT 'ADMIN, TH, SST, CONSULTA',
  nombre          VARCHAR(60)  NOT NULL,
  descripcion     VARCHAR(255) NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_codigo (codigo)
) ENGINE=InnoDB COMMENT='Perfiles de usuario';

CREATE TABLE permisos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(60)  NOT NULL COMMENT 'modulo.accion, ej. colaboradores.crear',
  modulo          VARCHAR(40)  NOT NULL,
  descripcion     VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permisos_codigo (codigo)
) ENGINE=InnoDB COMMENT='Acciones que se pueden autorizar';

CREATE TABLE rol_permisos (
  rol_id          INT UNSIGNED NOT NULL,
  permiso_id      INT UNSIGNED NOT NULL,
  PRIMARY KEY (rol_id, permiso_id),
  CONSTRAINT fk_rolperm_rol     FOREIGN KEY (rol_id)     REFERENCES roles (id),
  CONSTRAINT fk_rolperm_permiso FOREIGN KEY (permiso_id) REFERENCES permisos (id)
) ENGINE=InnoDB COMMENT='Permisos asignados a cada rol';

CREATE TABLE usuarios (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario             VARCHAR(40)  NOT NULL COMMENT 'Nombre de inicio de sesión',
  clave_hash          VARCHAR(255) NOT NULL COMMENT 'Hash bcrypt, nunca la clave en texto plano',
  nombre_completo     VARCHAR(150) NOT NULL COMMENT 'Aparece en la firma ENTREGA del acta',
  cargo               VARCHAR(100) NOT NULL COMMENT 'Aparece en la firma ENTREGA del acta',
  correo              VARCHAR(150) NULL,
  rol_id              INT UNSIGNED NOT NULL,
  colaborador_id      INT UNSIGNED NULL COMMENT 'Si el usuario también es colaborador',
  debe_cambiar_clave  TINYINT(1)   NOT NULL DEFAULT 1,
  intentos_fallidos   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta     DATETIME     NULL,
  ultimo_acceso       DATETIME     NULL,
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por          INT UNSIGNED NULL,
  actualizado_en      DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por     INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_usuario (usuario),
  KEY ix_usuarios_rol (rol_id),
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles (id)
  -- fk_usuarios_colaborador se crea al final (colaboradores aún no existe)
) ENGINE=InnoDB COMMENT='Personas que usan el sistema';

CREATE TABLE auditoria (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id      INT UNSIGNED NULL,
  accion          ENUM('LOGIN','LOGIN_FALLIDO','CREAR','EDITAR','INACTIVAR','ANULAR','CONSULTAR_SENSIBLE','DESCARGAR') NOT NULL,
  tabla           VARCHAR(60)  NULL,
  registro_id     INT UNSIGNED NULL,
  datos_antes     LONGTEXT     NULL COMMENT 'JSON',
  datos_despues   LONGTEXT     NULL COMMENT 'JSON',
  ip              VARCHAR(45)  NULL,
  PRIMARY KEY (id),
  KEY ix_auditoria_tabla (tabla, registro_id),
  KEY ix_auditoria_usuario (usuario_id, fecha),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
  CONSTRAINT ck_auditoria_antes   CHECK (datos_antes IS NULL OR JSON_VALID(datos_antes)),
  CONSTRAINT ck_auditoria_despues CHECK (datos_despues IS NULL OR JSON_VALID(datos_despues))
) ENGINE=InnoDB COMMENT='Registro de cambios y consultas de datos sensibles';

-- ---------------------------------------------------------------------
--  2. CATÁLOGOS
-- ---------------------------------------------------------------------

CREATE TABLE areas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre          VARCHAR(100) NOT NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por      INT UNSIGNED NULL,
  actualizado_en  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_areas_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE cargos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre          VARCHAR(100) NOT NULL,
  area_id         INT UNSIGNED NULL,
  nivel_riesgo_arl TINYINT UNSIGNED NULL COMMENT 'Riesgo ARL sugerido para el cargo (1 a 5)',
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por      INT UNSIGNED NULL,
  actualizado_en  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cargos_nombre (nombre),
  CONSTRAINT fk_cargos_area FOREIGN KEY (area_id) REFERENCES areas (id),
  CONSTRAINT ck_cargos_riesgo CHECK (nivel_riesgo_arl IS NULL OR nivel_riesgo_arl BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE tipos_documento_identidad (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(5)   NOT NULL COMMENT 'CC, CE, TI, PPT, PA',
  nombre          VARCHAR(60)  NOT NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tdi_codigo (codigo)
) ENGINE=InnoDB;

CREATE TABLE tipos_documento_expediente (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre               VARCHAR(100) NOT NULL,
  maneja_vencimiento   TINYINT(1)   NOT NULL DEFAULT 0,
  dias_alerta          SMALLINT UNSIGNED NULL COMMENT 'Días de anticipación; NULL = valor general de configuracion',
  visible_sst          TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'SST puede ver este tipo de documento',
  es_sensible          TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Datos médicos u otros datos sensibles (Ley 1581)',
  activo               TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tde_nombre (nombre)
) ENGINE=InnoDB COMMENT='Contrato, examen médico, curso de alturas, etc.';

CREATE TABLE entidades_seguridad_social (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo            ENUM('EPS','AFP','ARL','CCF','CESANTIAS') NOT NULL COMMENT 'CCF = caja de compensación',
  nombre          VARCHAR(120) NOT NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ess_tipo_nombre (tipo, nombre)
) ENGINE=InnoDB COMMENT='EPS, fondos de pensión, ARL, cajas de compensación y fondos de cesantías';

CREATE TABLE proveedores (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nit             VARCHAR(20)  NULL,
  nombre          VARCHAR(150) NOT NULL,
  telefono        VARCHAR(30)  NULL,
  correo          VARCHAR(150) NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por      INT UNSIGNED NULL,
  actualizado_en  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_proveedores_nit (nit)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
--  3. COLABORADORES Y EXPEDIENTE
-- ---------------------------------------------------------------------

CREATE TABLE colaboradores (
  id                          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_documento_id           INT UNSIGNED NOT NULL,
  numero_documento            VARCHAR(20)  NOT NULL,
  nombres                     VARCHAR(100) NOT NULL,
  apellidos                   VARCHAR(100) NOT NULL,
  sexo                        ENUM('M','F') NOT NULL COMMENT 'Ajusta el texto de las actas',
  fecha_nacimiento            DATE         NULL,
  tipo_sangre                 ENUM('O+','O-','A+','A-','B+','B-','AB+','AB-') NULL COMMENT 'Dato de salud: visible para TH, Administrador y SST',
  estado_civil                ENUM('SOLTERO','CASADO','UNION_LIBRE','SEPARADO','DIVORCIADO','VIUDO') NULL,
  numero_hijos                TINYINT UNSIGNED NULL,
  personas_a_cargo            TINYINT UNSIGNED NULL,
  nivel_educativo             ENUM('PRIMARIA','BACHILLER','TECNICO','TECNOLOGO','PROFESIONAL','ESPECIALIZACION','MAESTRIA','DOCTORADO') NULL,
  telefono                    VARCHAR(30)  NULL,
  correo                      VARCHAR(150) NULL,
  direccion                   VARCHAR(200) NULL,
  ciudad_residencia           VARCHAR(80)  NULL,
  contacto_emergencia_nombre  VARCHAR(150) NULL,
  contacto_emergencia_telefono VARCHAR(30) NULL,
  cargo_id                    INT UNSIGNED NOT NULL,
  area_id                     INT UNSIGNED NOT NULL,
  jefe_id                     INT UNSIGNED NULL,
  fecha_ingreso               DATE         NOT NULL,
  tipo_contrato               ENUM('INDEFINIDO','FIJO','OBRA_LABOR','APRENDIZAJE','PRESTACION_SERVICIOS') NOT NULL,
  fecha_fin_contrato          DATE         NULL COMMENT 'Genera alerta de contrato por vencer',
  salario                     DECIMAL(12,2) NULL COMMENT 'Dato sensible',
  banco                       VARCHAR(80)  NULL COMMENT 'Dato sensible',
  tipo_cuenta                 ENUM('AHORROS','CORRIENTE') NULL COMMENT 'Dato sensible',
  numero_cuenta               VARCHAR(30)  NULL COMMENT 'Dato sensible',
  derecho_dotacion            ENUM('AUTO','SI','NO') NOT NULL DEFAULT 'AUTO' COMMENT 'AUTO = según salario y antigüedad (RN-06)',
  eps_id                      INT UNSIGNED NULL,
  afp_id                      INT UNSIGNED NULL,
  arl_id                      INT UNSIGNED NULL,
  ccf_id                      INT UNSIGNED NULL,
  cesantias_id                INT UNSIGNED NULL,
  nivel_riesgo_arl            TINYINT UNSIGNED NULL,
  ruta_foto                   VARCHAR(500) NULL,
  estado                      ENUM('ACTIVO','RETIRADO') NOT NULL DEFAULT 'ACTIVO',
  fecha_retiro                DATE         NULL,
  motivo_retiro               VARCHAR(255) NULL,
  activo                      TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en                   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por                  INT UNSIGNED NULL,
  actualizado_en              DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por             INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_colab_documento (tipo_documento_id, numero_documento),
  KEY ix_colab_nombre (apellidos, nombres),
  KEY ix_colab_estado (estado),
  CONSTRAINT fk_colab_tipodoc FOREIGN KEY (tipo_documento_id) REFERENCES tipos_documento_identidad (id),
  CONSTRAINT fk_colab_cargo   FOREIGN KEY (cargo_id) REFERENCES cargos (id),
  CONSTRAINT fk_colab_area    FOREIGN KEY (area_id)  REFERENCES areas (id),
  CONSTRAINT fk_colab_jefe    FOREIGN KEY (jefe_id)  REFERENCES colaboradores (id),
  CONSTRAINT fk_colab_eps     FOREIGN KEY (eps_id)   REFERENCES entidades_seguridad_social (id),
  CONSTRAINT fk_colab_afp     FOREIGN KEY (afp_id)   REFERENCES entidades_seguridad_social (id),
  CONSTRAINT fk_colab_arl     FOREIGN KEY (arl_id)   REFERENCES entidades_seguridad_social (id),
  CONSTRAINT fk_colab_ccf     FOREIGN KEY (ccf_id)   REFERENCES entidades_seguridad_social (id),
  CONSTRAINT fk_colab_cesantias FOREIGN KEY (cesantias_id) REFERENCES entidades_seguridad_social (id),
  CONSTRAINT ck_colab_riesgo  CHECK (nivel_riesgo_arl IS NULL OR nivel_riesgo_arl BETWEEN 1 AND 5),
  CONSTRAINT ck_colab_retiro  CHECK (estado = 'ACTIVO' OR fecha_retiro IS NOT NULL)
) ENGINE=InnoDB COMMENT='Datos personales y laborales';

CREATE TABLE colaborador_tallas (
  colaborador_id  INT UNSIGNED NOT NULL,
  tipo_talla      ENUM('CAMISA','PANTALON','CALZADO','GUANTES','OVEROL','OTRA') NOT NULL,
  talla           VARCHAR(10)  NOT NULL,
  PRIMARY KEY (colaborador_id, tipo_talla),
  CONSTRAINT fk_tallas_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores (id)
) ENGINE=InnoDB;

CREATE TABLE documentos (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colaborador_id      INT UNSIGNED NOT NULL,
  tipo_documento_id   INT UNSIGNED NOT NULL,
  descripcion         VARCHAR(200) NULL,
  nombre_original     VARCHAR(255) NOT NULL,
  ruta_archivo        VARCHAR(500) NOT NULL COMMENT 'Ruta relativa dentro de C:\\SGTH\\archivos',
  mime_type           VARCHAR(80)  NOT NULL,
  tamano_bytes        INT UNSIGNED NOT NULL,
  fecha_expedicion    DATE         NULL,
  fecha_vencimiento   DATE         NULL,
  version             SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  reemplaza_a_id      INT UNSIGNED NULL COMMENT 'Versión anterior del mismo documento',
  vigente             TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0 cuando fue reemplazado',
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por          INT UNSIGNED NULL,
  actualizado_en      DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por     INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_docs_colab (colaborador_id, tipo_documento_id),
  KEY ix_docs_vencimiento (fecha_vencimiento),
  CONSTRAINT fk_docs_colab    FOREIGN KEY (colaborador_id)    REFERENCES colaboradores (id),
  CONSTRAINT fk_docs_tipo     FOREIGN KEY (tipo_documento_id) REFERENCES tipos_documento_expediente (id),
  CONSTRAINT fk_docs_reemplaza FOREIGN KEY (reemplaza_a_id)   REFERENCES documentos (id)
) ENGINE=InnoDB COMMENT='Metadatos de los archivos del expediente';

CREATE TABLE documentos_obligatorios_cargo (
  cargo_id            INT UNSIGNED NOT NULL,
  tipo_documento_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (cargo_id, tipo_documento_id),
  CONSTRAINT fk_docoblig_cargo FOREIGN KEY (cargo_id)          REFERENCES cargos (id),
  CONSTRAINT fk_docoblig_tipo  FOREIGN KEY (tipo_documento_id) REFERENCES tipos_documento_expediente (id)
) ENGINE=InnoDB COMMENT='Documentos que debe tener cada cargo';

-- ---------------------------------------------------------------------
--  4. INVENTARIO
-- ---------------------------------------------------------------------

CREATE TABLE elementos (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  categoria_inventario  ENUM('DOTACION','EPP','EQUIPO','MUEBLE','OTRO') NOT NULL,
  nombre                VARCHAR(150) NOT NULL COMMENT 'Ej.: Botas de seguridad punta de acero',
  subcategoria          VARCHAR(80)  NULL COMMENT 'Cabeza, manos, pies, uniforme, cómputo, oficina...',
  unidad                VARCHAR(20)  NOT NULL DEFAULT 'Und' COMMENT 'Columna UNIDAD del acta',
  controla_por_unidad   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = equipos y muebles (tabla activos)',
  maneja_tallas         TINYINT(1)   NOT NULL DEFAULT 0,
  norma_certificacion   VARCHAR(150) NULL COMMENT 'Solo EPP',
  vida_util_dias        SMALLINT UNSIGNED NULL COMMENT 'Solo EPP: base para la fecha de reposición',
  stock_minimo          INT UNSIGNED NULL COMMENT 'Reservado para alerta en v1.1 del sistema',
  activo                TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por            INT UNSIGNED NULL,
  actualizado_en        DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por       INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_elementos_nombre (categoria_inventario, nombre),
  CONSTRAINT ck_elem_unidad CHECK (controla_por_unidad = 0 OR categoria_inventario IN ('EQUIPO','MUEBLE')),
  CONSTRAINT ck_elem_vida   CHECK (vida_util_dias IS NULL OR categoria_inventario = 'EPP')
) ENGINE=InnoDB COMMENT='Catálogo único de todo lo que se entrega';

CREATE TABLE existencias (
  elemento_id     INT UNSIGNED NOT NULL,
  talla           VARCHAR(10)  NOT NULL DEFAULT 'UNICA' COMMENT 'UNICA si el elemento no maneja tallas',
  cantidad        INT          NOT NULL DEFAULT 0,
  actualizado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (elemento_id, talla),
  CONSTRAINT fk_exist_elemento FOREIGN KEY (elemento_id) REFERENCES elementos (id),
  CONSTRAINT ck_exist_cantidad CHECK (cantidad >= 0)
) ENGINE=InnoDB COMMENT='Stock por elemento y talla (dotación, EPP, otros)';

CREATE TABLE activos (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  elemento_id            INT UNSIGNED NOT NULL,
  serial                 VARCHAR(80)  NULL,
  placa_inventario       VARCHAR(40)  NULL,
  marca                  VARCHAR(80)  NULL,
  modelo                 VARCHAR(80)  NULL,
  descripcion_adicional  VARCHAR(255) NULL COMMENT 'Ej.: número de línea de la SIM, color, accesorios',
  estado                 ENUM('DISPONIBLE','ASIGNADO','EN_REPARACION','DADO_DE_BAJA') NOT NULL DEFAULT 'DISPONIBLE',
  condicion              ENUM('NUEVO','BUENO','REGULAR','MALO') NOT NULL DEFAULT 'NUEVO' COMMENT 'Columna ESTADO del acta',
  colaborador_actual_id  INT UNSIGNED NULL,
  fecha_compra           DATE         NULL,
  proveedor_id           INT UNSIGNED NULL,
  valor_compra           DECIMAL(12,2) NULL,
  observaciones          VARCHAR(255) NULL,
  activo                 TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por             INT UNSIGNED NULL,
  actualizado_en         DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por        INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_activos_serial (serial),
  UNIQUE KEY uq_activos_placa (placa_inventario),
  KEY ix_activos_colab (colaborador_actual_id),
  KEY ix_activos_estado (estado),
  CONSTRAINT fk_activos_elemento  FOREIGN KEY (elemento_id)           REFERENCES elementos (id),
  CONSTRAINT fk_activos_colab     FOREIGN KEY (colaborador_actual_id) REFERENCES colaboradores (id),
  CONSTRAINT fk_activos_proveedor FOREIGN KEY (proveedor_id)          REFERENCES proveedores (id),
  CONSTRAINT ck_activos_asignado  CHECK ((estado = 'ASIGNADO') = (colaborador_actual_id IS NOT NULL))
) ENGINE=InnoDB COMMENT='Unidades individuales de equipos y muebles';

-- ---------------------------------------------------------------------
--  5. DOTACIÓN Y SST
-- ---------------------------------------------------------------------

CREATE TABLE periodos_dotacion (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  anio            SMALLINT UNSIGNED NOT NULL,
  numero          TINYINT UNSIGNED  NOT NULL COMMENT '1, 2 o 3',
  fecha_limite    DATE         NOT NULL COMMENT '30 abr, 31 ago, 20 dic (Art. 232 CST)',
  PRIMARY KEY (id),
  UNIQUE KEY uq_periodo (anio, numero),
  CONSTRAINT ck_periodo_numero CHECK (numero BETWEEN 1 AND 3)
) ENGINE=InnoDB;

CREATE TABLE matriz_epp_cargo (
  cargo_id        INT UNSIGNED NOT NULL,
  elemento_id     INT UNSIGNED NOT NULL COMMENT 'Debe ser de categoría EPP',
  cantidad        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  observacion     VARCHAR(255) NULL,
  PRIMARY KEY (cargo_id, elemento_id),
  CONSTRAINT fk_matriz_cargo    FOREIGN KEY (cargo_id)    REFERENCES cargos (id),
  CONSTRAINT fk_matriz_elemento FOREIGN KEY (elemento_id) REFERENCES elementos (id)
) ENGINE=InnoDB COMMENT='EPP que requiere cada cargo';

-- ---------------------------------------------------------------------
--  6. ACTAS (entregas y devoluciones de cualquier categoría)
-- ---------------------------------------------------------------------

CREATE TABLE plantillas_acta (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plantilla           ENUM('DOTACION','EPP','EQUIPOS','MUEBLES','OTROS','DEVOLUCION') NOT NULL,
  version             SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  titulo              VARCHAR(150) NOT NULL,
  texto_introduccion  TEXT         NOT NULL COMMENT 'Con campos {{campo}}',
  texto_manifiesta    VARCHAR(150) NOT NULL COMMENT 'Ej.: {{EL_TRABAJADOR}} MANIFIESTA QUE:',
  clausulas           LONGTEXT     NOT NULL COMMENT 'Arreglo JSON de párrafos',
  vigente             TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Solo una versión vigente por plantilla',
  creado_en           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por          INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plantilla_version (plantilla, version),
  CONSTRAINT ck_plantilla_json CHECK (JSON_VALID(clausulas))
) ENGINE=InnoDB COMMENT='Textos editables de las actas; cada cambio crea una versión nueva';

CREATE TABLE consecutivos_acta (
  anio            SMALLINT UNSIGNED NOT NULL,
  ultimo          INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (anio)
) ENGINE=InnoDB COMMENT='Último número de acta usado por año (ACT-AAAA-NNNN)';

CREATE TABLE consecutivos_placa (
  prefijo   VARCHAR(10)  NOT NULL COMMENT 'DD-EQ, DD-MU',
  ultimo    INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (prefijo)
) ENGINE=InnoDB COMMENT='Último número de placa usado por tipo de activo';

CREATE TABLE actas (
  id                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  consecutivo              VARCHAR(20)  NOT NULL COMMENT 'ACT-2026-0001',
  tipo_acta                ENUM('ENTREGA','DEVOLUCION') NOT NULL,
  es_historica             TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = entrega hecha antes del sistema; no descuenta inventario',
  plantilla_id             INT UNSIGNED NOT NULL COMMENT 'Versión exacta de la plantilla usada',
  colaborador_id           INT UNSIGNED NOT NULL COMMENT 'Quien recibe (o devuelve)',
  usuario_id               INT UNSIGNED NOT NULL COMMENT 'Usuario en sesión: firma ENTREGA (RECIBE en devoluciones)',
  colaborador_anterior_id  INT UNSIGNED NULL COMMENT 'Solo en traspasos',
  fecha                    DATE         NOT NULL,
  fecha_entrega_original   DATE         NULL COMMENT 'Solo actas antiguas: fecha en que realmente se entregó',
  ciudad                   VARCHAR(80)  NOT NULL DEFAULT 'Palmira',
  ubicacion                VARCHAR(150) NULL COMMENT 'Solo actas de muebles: puesto u oficina donde quedan',
  motivo                   ENUM('INGRESO','DOTACION_PERIODICA','REPOSICION_VIDA_UTIL','DANO','PERDIDA','ASIGNACION','TRASPASO','RETIRO','CAMBIO_CARGO','REPARACION','OTRO') NOT NULL,
  periodo_dotacion_id      INT UNSIGNED NULL COMMENT 'Solo actas de dotación',
  firmante_entrega_nombre  VARCHAR(150) NOT NULL COMMENT 'Copia al momento de generar el acta',
  firmante_entrega_cargo   VARCHAR(100) NOT NULL,
  firmante_recibe_nombre   VARCHAR(150) NOT NULL,
  firmante_recibe_cargo    VARCHAR(100) NOT NULL,
  observaciones            VARCHAR(500) NULL,
  estado                   ENUM('PENDIENTE_ACTA','COMPLETA','ANULADA') NOT NULL DEFAULT 'PENDIENTE_ACTA',
  ruta_pdf_generado        VARCHAR(500) NULL,
  ruta_acta_firmada        VARCHAR(500) NULL,
  ruta_soporte_original    VARCHAR(500) NULL COMMENT 'Solo actas antiguas: escaneo del documento original',
  fecha_carga_firmada      DATETIME     NULL,
  motivo_anulacion         VARCHAR(255) NULL,
  anulada_por              INT UNSIGNED NULL,
  anulada_en               DATETIME     NULL,
  creado_en                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en           DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_actas_consecutivo (consecutivo),
  KEY ix_actas_colab (colaborador_id, fecha),
  KEY ix_actas_estado (estado),
  CONSTRAINT fk_actas_plantilla FOREIGN KEY (plantilla_id)            REFERENCES plantillas_acta (id),
  CONSTRAINT fk_actas_colab     FOREIGN KEY (colaborador_id)          REFERENCES colaboradores (id),
  CONSTRAINT fk_actas_usuario   FOREIGN KEY (usuario_id)              REFERENCES usuarios (id),
  CONSTRAINT fk_actas_colab_ant FOREIGN KEY (colaborador_anterior_id) REFERENCES colaboradores (id),
  CONSTRAINT fk_actas_periodo   FOREIGN KEY (periodo_dotacion_id)     REFERENCES periodos_dotacion (id),
  CONSTRAINT fk_actas_anulador  FOREIGN KEY (anulada_por)             REFERENCES usuarios (id),
  CONSTRAINT ck_actas_firmada   CHECK (estado <> 'COMPLETA' OR ruta_acta_firmada IS NOT NULL),
  CONSTRAINT ck_actas_anulada   CHECK (estado <> 'ANULADA' OR motivo_anulacion IS NOT NULL)
) ENGINE=InnoDB COMMENT='Encabezado de toda entrega o devolución';

CREATE TABLE actas_detalle (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  acta_id            INT UNSIGNED NOT NULL,
  elemento_id        INT UNSIGNED NOT NULL,
  activo_id          INT UNSIGNED NULL COMMENT 'Solo equipos y muebles',
  talla              VARCHAR(10)  NOT NULL DEFAULT 'UNICA',
  cantidad           INT UNSIGNED NOT NULL DEFAULT 1,
  condicion          ENUM('NUEVO','BUENO','REGULAR','MALO') NULL COMMENT 'Estado al entregar o devolver',
  fecha_reposicion   DATE         NULL COMMENT 'Solo EPP: fecha del acta + vida_util_dias',
  repuesto           TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Solo EPP: ya se entregó el reemplazo',
  repuesto_en_acta_id INT UNSIGNED NULL COMMENT 'Acta con la que se repuso',
  observaciones      VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY ix_detalle_acta (acta_id),
  KEY ix_detalle_reposicion (fecha_reposicion, repuesto),
  CONSTRAINT fk_detalle_acta     FOREIGN KEY (acta_id)             REFERENCES actas (id),
  CONSTRAINT fk_detalle_elemento FOREIGN KEY (elemento_id)         REFERENCES elementos (id),
  CONSTRAINT fk_detalle_activo   FOREIGN KEY (activo_id)           REFERENCES activos (id),
  CONSTRAINT fk_detalle_repuesto FOREIGN KEY (repuesto_en_acta_id) REFERENCES actas (id),
  CONSTRAINT ck_detalle_cantidad CHECK (cantidad > 0 AND (activo_id IS NULL OR cantidad = 1))
) ENGINE=InnoDB COMMENT='Elementos de cada acta';

CREATE TABLE movimientos_inventario (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  elemento_id       INT UNSIGNED NOT NULL,
  talla             VARCHAR(10)  NOT NULL DEFAULT 'UNICA',
  activo_id         INT UNSIGNED NULL,
  tipo_movimiento   ENUM('ENTRADA','SALIDA','DEVOLUCION','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','BAJA','ANULACION') NOT NULL,
  cantidad          INT UNSIGNED NOT NULL,
  proveedor_id      INT UNSIGNED NULL COMMENT 'Solo entradas',
  numero_factura    VARCHAR(40)  NULL,
  acta_id           INT UNSIGNED NULL COMMENT 'Acta que originó el movimiento',
  usuario_id        INT UNSIGNED NOT NULL,
  observacion       VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY ix_mov_elemento (elemento_id, talla, fecha),
  CONSTRAINT fk_mov_elemento  FOREIGN KEY (elemento_id)  REFERENCES elementos (id),
  CONSTRAINT fk_mov_activo    FOREIGN KEY (activo_id)    REFERENCES activos (id),
  CONSTRAINT fk_mov_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores (id),
  CONSTRAINT fk_mov_acta      FOREIGN KEY (acta_id)      REFERENCES actas (id),
  CONSTRAINT fk_mov_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios (id),
  CONSTRAINT ck_mov_cantidad  CHECK (cantidad > 0)
) ENGINE=InnoDB COMMENT='Historial de entradas, salidas y ajustes; existencias es el saldo';

-- ---------------------------------------------------------------------
--  7. ALERTAS Y CONFIGURACIÓN
-- ---------------------------------------------------------------------

CREATE TABLE alertas (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo              ENUM('DOCUMENTO_POR_VENCER','DOCUMENTO_VENCIDO','CONTRATO_POR_VENCER','EPP_REPOSICION','DOTACION_PENDIENTE','ACTA_SIN_FIRMAR','ELEMENTOS_SIN_DEVOLVER') NOT NULL,
  rol_destino       ENUM('TH','SST','TODOS') NOT NULL,
  colaborador_id    INT UNSIGNED NULL,
  referencia_tabla  VARCHAR(40)  NOT NULL COMMENT 'documentos, actas_detalle, actas, colaboradores...',
  referencia_id     INT UNSIGNED NOT NULL,
  fecha_evento      DATE         NOT NULL COMMENT 'Fecha de vencimiento o límite',
  mensaje           VARCHAR(255) NOT NULL,
  estado            ENUM('ACTIVA','ATENDIDA','DESCARTADA') NOT NULL DEFAULT 'ACTIVA',
  generada_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atendida_por      INT UNSIGNED NULL,
  atendida_en       DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alerta (tipo, referencia_tabla, referencia_id, fecha_evento) COMMENT 'Evita duplicar la alerta en cada ejecución diaria',
  KEY ix_alertas_estado (estado, rol_destino),
  CONSTRAINT fk_alertas_colab    FOREIGN KEY (colaborador_id) REFERENCES colaboradores (id),
  CONSTRAINT fk_alertas_atendida FOREIGN KEY (atendida_por)   REFERENCES usuarios (id)
) ENGINE=InnoDB COMMENT='Generadas por la tarea diaria de NestJS';

CREATE TABLE configuracion (
  clave           VARCHAR(60)  NOT NULL,
  valor           VARCHAR(255) NULL,
  descripcion     VARCHAR(255) NULL,
  actualizado_en  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  actualizado_por INT UNSIGNED NULL,
  PRIMARY KEY (clave)
) ENGINE=InnoDB COMMENT='Parámetros generales del sistema';

-- ---------------------------------------------------------------------
--  8. LLAVES FORÁNEAS DIFERIDAS (dependencias circulares)
-- ---------------------------------------------------------------------

ALTER TABLE usuarios
  ADD CONSTRAINT fk_usuarios_colaborador FOREIGN KEY (colaborador_id) REFERENCES colaboradores (id);

-- ---------------------------------------------------------------------
--  9. VISTAS DE CONSULTA (útiles en HeidiSQL y en reportes)
-- ---------------------------------------------------------------------

-- Equipos y muebles asignados hoy, con su responsable
CREATE OR REPLACE VIEW v_activos_asignados AS
SELECT a.id AS activo_id, e.categoria_inventario, e.nombre AS elemento,
       a.marca, a.modelo, a.serial, a.placa_inventario, a.condicion,
       c.id AS colaborador_id, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador,
       c.estado AS estado_colaborador
FROM activos a
JOIN elementos e      ON e.id = a.elemento_id
JOIN colaboradores c  ON c.id = a.colaborador_actual_id
WHERE a.estado = 'ASIGNADO';

-- EPP entregados que aún no se han repuesto, con días para la reposición
CREATE OR REPLACE VIEW v_epp_por_reponer AS
SELECT d.id AS detalle_id, ac.consecutivo, ac.fecha AS fecha_entrega,
       c.id AS colaborador_id, CONCAT(c.nombres, ' ', c.apellidos) AS colaborador,
       e.nombre AS epp, d.talla, d.cantidad, d.fecha_reposicion,
       DATEDIFF(d.fecha_reposicion, CURDATE()) AS dias_para_reposicion
FROM actas_detalle d
JOIN actas ac         ON ac.id = d.acta_id
JOIN elementos e      ON e.id = d.elemento_id
JOIN colaboradores c  ON c.id = ac.colaborador_id
WHERE e.categoria_inventario = 'EPP'
  AND ac.tipo_acta = 'ENTREGA'
  AND ac.estado <> 'ANULADA'
  AND d.repuesto = 0
  AND d.fecha_reposicion IS NOT NULL
  AND c.estado = 'ACTIVO';

-- Documentos vigentes con fecha de vencimiento
CREATE OR REPLACE VIEW v_documentos_por_vencer AS
SELECT dc.id AS documento_id, c.id AS colaborador_id,
       CONCAT(c.nombres, ' ', c.apellidos) AS colaborador,
       t.nombre AS tipo_documento, dc.fecha_vencimiento,
       DATEDIFF(dc.fecha_vencimiento, CURDATE()) AS dias_para_vencer
FROM documentos dc
JOIN colaboradores c              ON c.id = dc.colaborador_id
JOIN tipos_documento_expediente t ON t.id = dc.tipo_documento_id
WHERE dc.vigente = 1 AND dc.activo = 1
  AND dc.fecha_vencimiento IS NOT NULL
  AND c.estado = 'ACTIVO';

-- Existencias de dotación, EPP y otros (los activos se cuentan aparte)
CREATE OR REPLACE VIEW v_existencias AS
SELECT e.id AS elemento_id, e.categoria_inventario, e.nombre, ex.talla, ex.cantidad, e.unidad
FROM existencias ex
JOIN elementos e ON e.id = ex.elemento_id
UNION ALL
SELECT e.id, e.categoria_inventario, e.nombre, 'UNICA', COUNT(a.id), e.unidad
FROM elementos e
LEFT JOIN activos a ON a.elemento_id = e.id AND a.estado = 'DISPONIBLE'
WHERE e.controla_por_unidad = 1
GROUP BY e.id, e.categoria_inventario, e.nombre, e.unidad;
