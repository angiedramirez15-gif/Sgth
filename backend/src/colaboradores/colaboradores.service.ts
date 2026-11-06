import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { DatabaseService, type Conexion } from '../database/database.service.js';
import type { ColaboradorDto } from './dto/colaborador.dto.js';
import { CONTRATOS_CON_FIN, LISTAS, valores } from './listas.js';

/** Campo del DTO → columna de la tabla. sensible = salario y datos bancarios (Ley 1581). */
const CAMPOS: { campo: keyof ColaboradorDto; columna: string; sensible?: boolean }[] = [
  { campo: 'tipoDocumentoId', columna: 'tipo_documento_id' },
  { campo: 'numeroDocumento', columna: 'numero_documento' },
  { campo: 'nombres', columna: 'nombres' },
  { campo: 'apellidos', columna: 'apellidos' },
  { campo: 'sexo', columna: 'sexo' },
  { campo: 'fechaNacimiento', columna: 'fecha_nacimiento' },
  { campo: 'tipoSangre', columna: 'tipo_sangre' },
  { campo: 'estadoCivil', columna: 'estado_civil' },
  { campo: 'numeroHijos', columna: 'numero_hijos' },
  { campo: 'personasACargo', columna: 'personas_a_cargo' },
  { campo: 'nivelEducativo', columna: 'nivel_educativo' },
  { campo: 'telefono', columna: 'telefono' },
  { campo: 'correo', columna: 'correo' },
  { campo: 'direccion', columna: 'direccion' },
  { campo: 'ciudadResidencia', columna: 'ciudad_residencia' },
  { campo: 'contactoEmergenciaNombre', columna: 'contacto_emergencia_nombre' },
  { campo: 'contactoEmergenciaTelefono', columna: 'contacto_emergencia_telefono' },
  { campo: 'cargoId', columna: 'cargo_id' },
  { campo: 'areaId', columna: 'area_id' },
  { campo: 'jefeId', columna: 'jefe_id' },
  { campo: 'fechaIngreso', columna: 'fecha_ingreso' },
  { campo: 'tipoContrato', columna: 'tipo_contrato' },
  { campo: 'fechaFinContrato', columna: 'fecha_fin_contrato' },
  { campo: 'salario', columna: 'salario', sensible: true },
  { campo: 'derechoDotacion', columna: 'derecho_dotacion' },
  { campo: 'epsId', columna: 'eps_id' },
  { campo: 'afpId', columna: 'afp_id' },
  { campo: 'arlId', columna: 'arl_id' },
  { campo: 'ccfId', columna: 'ccf_id' },
  { campo: 'cesantiasId', columna: 'cesantias_id' },
  { campo: 'nivelRiesgoArl', columna: 'nivel_riesgo_arl' },
  { campo: 'banco', columna: 'banco', sensible: true },
  { campo: 'tipoCuenta', columna: 'tipo_cuenta', sensible: true },
  { campo: 'numeroCuenta', columna: 'numero_cuenta', sensible: true },
];

const ENTIDADES: { campo: keyof ColaboradorDto; tipo: string; nombre: string }[] = [
  { campo: 'epsId', tipo: 'EPS', nombre: 'EPS' },
  { campo: 'afpId', tipo: 'AFP', nombre: 'fondo de pensiones' },
  { campo: 'arlId', tipo: 'ARL', nombre: 'ARL' },
  { campo: 'ccfId', tipo: 'CCF', nombre: 'caja de compensación' },
  { campo: 'cesantiasId', tipo: 'CESANTIAS', nombre: 'fondo de cesantías' },
];

export interface FilaListaColaborador {
  id: number;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  cargo: string;
  area: string;
  fechaIngreso: string;
  tipoContrato: string;
  fechaFinContrato: string | null;
  estado: 'ACTIVO' | 'RETIRADO';
  tieneFoto: boolean;
  documentosFaltantes: number;
  documentosVencidos: number;
}

export const puedeVerSensibles = (u: UsuarioToken) => u.permisos.includes('colaboradores.ver_sensibles');
/** El tipo de sangre es dato de salud: lo ven quienes ven datos sensibles y SST (emergencias). */
export const puedeVerSalud = (u: UsuarioToken) => puedeVerSensibles(u) || u.permisos.includes('documentos.ver_sst');

@Injectable()
export class ColaboradoresService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(): Promise<FilaListaColaborador[]> {
    const filas = await this.db.consultar<Record<string, unknown>>(
      `SELECT c.id, td.codigo AS tipoDocumento, c.numero_documento AS numeroDocumento, c.nombres, c.apellidos,
              ca.nombre AS cargo, a.nombre AS area, c.fecha_ingreso AS fechaIngreso, c.tipo_contrato AS tipoContrato,
              c.fecha_fin_contrato AS fechaFinContrato, c.estado, (c.ruta_foto IS NOT NULL) AS tieneFoto,
              (SELECT COUNT(*) FROM documentos_obligatorios_cargo o
                 JOIN tipos_documento_expediente t ON t.id = o.tipo_documento_id AND t.activo = 1
                WHERE o.cargo_id = c.cargo_id
                  AND NOT EXISTS (SELECT 1 FROM documentos d WHERE d.colaborador_id = c.id
                                     AND d.tipo_documento_id = o.tipo_documento_id AND d.vigente = 1 AND d.activo = 1)
              ) AS documentosFaltantes,
              (SELECT COUNT(*) FROM documentos d WHERE d.colaborador_id = c.id AND d.vigente = 1 AND d.activo = 1
                  AND d.fecha_vencimiento IS NOT NULL AND d.fecha_vencimiento < CURDATE()) AS documentosVencidos
         FROM colaboradores c
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         JOIN cargos ca ON ca.id = c.cargo_id
         JOIN areas a   ON a.id = c.area_id
        WHERE c.activo = 1
        ORDER BY c.estado, c.apellidos, c.nombres`,
    );
    return filas.map((f) => ({
      ...f,
      tieneFoto: !!f.tieneFoto,
      documentosFaltantes: Number(f.documentosFaltantes),
      documentosVencidos: Number(f.documentosVencidos),
    })) as FilaListaColaborador[];
  }

  /** Ficha completa. Oculta salario y datos bancarios a quien no tiene permiso (Ley 1581). */
  async obtener(id: number, actor: UsuarioToken, ip?: string, cx: Conexion = this.db) {
    const f = await cx.uno<Record<string, unknown>>(
      `SELECT c.*, td.codigo AS tipo_documento_codigo, td.nombre AS tipo_documento_nombre,
              ca.nombre AS cargo_nombre, a.nombre AS area_nombre,
              CONCAT(j.nombres, ' ', j.apellidos) AS jefe_nombre,
              eps.nombre AS eps_nombre, afp.nombre AS afp_nombre, arl.nombre AS arl_nombre,
              ccf.nombre AS ccf_nombre, ces.nombre AS cesantias_nombre
         FROM colaboradores c
         JOIN tipos_documento_identidad td ON td.id = c.tipo_documento_id
         JOIN cargos ca ON ca.id = c.cargo_id
         JOIN areas a ON a.id = c.area_id
         LEFT JOIN colaboradores j ON j.id = c.jefe_id
         LEFT JOIN entidades_seguridad_social eps ON eps.id = c.eps_id
         LEFT JOIN entidades_seguridad_social afp ON afp.id = c.afp_id
         LEFT JOIN entidades_seguridad_social arl ON arl.id = c.arl_id
         LEFT JOIN entidades_seguridad_social ccf ON ccf.id = c.ccf_id
         LEFT JOIN entidades_seguridad_social ces ON ces.id = c.cesantias_id
        WHERE c.id = ? AND c.activo = 1`,
      [id],
    );
    if (!f) throw new NotFoundException('El colaborador no existe');
    const tallas = await cx.consultar<{ tipo_talla: string; talla: string }>(
      'SELECT tipo_talla, talla FROM colaborador_tallas WHERE colaborador_id = ?',
      [id],
    );

    const sensibles = puedeVerSensibles(actor);
    const salud = puedeVerSalud(actor);
    const ficha: Record<string, unknown> = { id: f.id };
    for (const { campo, columna, sensible } of CAMPOS) {
      if (sensible && !sensibles) continue;
      ficha[campo] = f[columna];
    }
    if (!salud) delete ficha.tipoSangre;
    if (ficha.salario !== undefined && ficha.salario !== null) ficha.salario = Number(ficha.salario);

    Object.assign(ficha, {
      tipoDocumentoCodigo: f.tipo_documento_codigo,
      tipoDocumentoNombre: f.tipo_documento_nombre,
      cargoNombre: f.cargo_nombre,
      areaNombre: f.area_nombre,
      jefeNombre: f.jefe_nombre,
      epsNombre: f.eps_nombre,
      afpNombre: f.afp_nombre,
      arlNombre: f.arl_nombre,
      ccfNombre: f.ccf_nombre,
      cesantiasNombre: f.cesantias_nombre,
      estado: f.estado,
      fechaRetiro: f.fecha_retiro,
      motivoRetiro: f.motivo_retiro,
      tieneFoto: !!f.ruta_foto,
      creadoEn: f.creado_en,
      actualizadoEn: f.actualizado_en,
      tallas: Object.fromEntries(tallas.map((t) => [t.tipo_talla, t.talla])),
      permisos: { verSensibles: sensibles, verSalud: salud },
    });

    if (sensibles && cx === this.db) {
      await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'CONSULTAR_SENSIBLE', tabla: 'colaboradores', registroId: id, ip });
    }
    return ficha;
  }

  async crear(dto: ColaboradorDto, actor: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      const id = await this.insertar(dto, actor, cx);
      const ficha = await this.obtener(id, actor, ip, cx);
      await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'CREAR', tabla: 'colaboradores', registroId: id, despues: ficha, ip }, cx);
      return ficha;
    });
  }

  /** Inserta un colaborador ya validado por el DTO. Lo usa también la importación desde Excel. */
  async insertar(dto: ColaboradorDto, actor: UsuarioToken, cx: Conexion): Promise<number> {
    const valores = await this.validar(dto, cx);
    const columnas = [...Object.keys(valores), 'creado_por'];
    try {
      const r = await cx.ejecutar(
        `INSERT INTO colaboradores (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
        [...Object.values(valores), actor.sub],
      );
      await this.guardarTallas(r.insertId, dto.tallas, cx);
      return r.insertId;
    } catch (error) {
      throw this.traducirDuplicado(error, dto);
    }
  }

  async editar(id: number, dto: ColaboradorDto, actor: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      const antes = await this.obtener(id, actor, ip, cx);
      if (antes.estado === 'RETIRADO') throw new BadRequestException('El colaborador está retirado. Reactívelo para modificar su ficha');
      const valores = await this.validar(dto, cx, id);
      // Quien no ve los datos sensibles no puede cambiarlos
      if (!puedeVerSensibles(actor)) for (const c of CAMPOS.filter((x) => x.sensible)) delete valores[c.columna];
      if (!puedeVerSalud(actor)) delete valores.tipo_sangre;
      try {
        await cx.ejecutar(
          `UPDATE colaboradores SET ${Object.keys(valores).map((c) => `${c} = ?`).join(', ')}, actualizado_por = ? WHERE id = ?`,
          [...Object.values(valores), actor.sub, id],
        );
      } catch (error) {
        throw this.traducirDuplicado(error, dto);
      }
      await this.guardarTallas(id, dto.tallas, cx);
      const despues = await this.obtener(id, actor, ip, cx);
      await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'EDITAR', tabla: 'colaboradores', registroId: id, antes, despues, ip }, cx);
      return despues;
    });
  }

  /** Retiro: cambia el estado sin borrar el historial (RF-16, RN-02). */
  async retirar(id: number, fechaRetiro: string, motivoRetiro: string, actor: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      const f = await cx.uno<{ estado: string; fecha_ingreso: string }>(
        'SELECT estado, fecha_ingreso FROM colaboradores WHERE id = ? AND activo = 1', [id],
      );
      if (!f) throw new NotFoundException('El colaborador no existe');
      if (f.estado === 'RETIRADO') throw new BadRequestException('El colaborador ya está retirado');
      if (fechaRetiro < f.fecha_ingreso) throw new BadRequestException('La fecha de retiro no puede ser anterior a la fecha de ingreso');
      await cx.ejecutar(
        `UPDATE colaboradores SET estado = 'RETIRADO', fecha_retiro = ?, motivo_retiro = ?, actualizado_por = ? WHERE id = ?`,
        [fechaRetiro, motivoRetiro, actor.sub, id],
      );
      const pendientes = await cx.uno<{ total: number }>(
        `SELECT COUNT(*) AS total FROM activos WHERE colaborador_actual_id = ? AND estado = 'ASIGNADO'`, [id],
      );
      await this.auditoria.registrar(
        { usuarioId: actor.sub, accion: 'EDITAR', tabla: 'colaboradores', registroId: id, despues: { estado: 'RETIRADO', fechaRetiro, motivoRetiro }, ip },
        cx,
      );
      return { ficha: await this.obtener(id, actor, ip, cx), elementosSinDevolver: Number(pendientes?.total ?? 0) };
    });
  }

  /** Deshace un retiro registrado por error. */
  async reactivar(id: number, actor: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      const r = await cx.ejecutar(
        `UPDATE colaboradores SET estado = 'ACTIVO', fecha_retiro = NULL, motivo_retiro = NULL, actualizado_por = ?
          WHERE id = ? AND activo = 1 AND estado = 'RETIRADO'`,
        [actor.sub, id],
      );
      if (!r.affectedRows) throw new BadRequestException('El colaborador no está retirado');
      await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'EDITAR', tabla: 'colaboradores', registroId: id, despues: { estado: 'ACTIVO' }, ip }, cx);
      return this.obtener(id, actor, ip, cx);
    });
  }

  async guardarFoto(id: number, ruta: string, actor: UsuarioToken, ip?: string) {
    const r = await this.db.ejecutar('UPDATE colaboradores SET ruta_foto = ?, actualizado_por = ? WHERE id = ? AND activo = 1', [ruta, actor.sub, id]);
    if (!r.affectedRows) throw new NotFoundException('El colaborador no existe');
    await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'EDITAR', tabla: 'colaboradores', registroId: id, despues: { foto: 'actualizada' }, ip });
  }

  async rutaFoto(id: number): Promise<string> {
    const f = await this.db.uno<{ ruta_foto: string | null }>('SELECT ruta_foto FROM colaboradores WHERE id = ? AND activo = 1', [id]);
    if (!f?.ruta_foto) throw new NotFoundException('El colaborador no tiene foto');
    return f.ruta_foto;
  }

  /** Listas para los formularios. */
  async opciones() {
    const [tiposDocumento, areas, cargos, entidades, jefes] = await Promise.all([
      this.db.consultar('SELECT id, codigo, nombre FROM tipos_documento_identidad WHERE activo = 1 ORDER BY id'),
      this.db.consultar('SELECT id, nombre FROM areas WHERE activo = 1 ORDER BY nombre'),
      this.db.consultar('SELECT id, nombre, area_id AS areaId, nivel_riesgo_arl AS nivelRiesgoArl FROM cargos WHERE activo = 1 ORDER BY nombre'),
      this.db.consultar('SELECT id, tipo, nombre FROM entidades_seguridad_social WHERE activo = 1 ORDER BY nombre'),
      this.db.consultar(
        `SELECT c.id, CONCAT(c.nombres, ' ', c.apellidos) AS nombre, ca.nombre AS cargo
           FROM colaboradores c JOIN cargos ca ON ca.id = c.cargo_id
          WHERE c.activo = 1 AND c.estado = 'ACTIVO' ORDER BY c.nombres, c.apellidos`,
      ),
    ]);
    return { tiposDocumento, areas, cargos, entidades, jefes, listas: LISTAS };
  }

  /**
   * Reglas que el DTO no puede revisar solo: referencias activas, entidades del tipo correcto, fechas coherentes.
   * Devuelve los valores listos para guardar (columna → valor).
   */
  async validar(dto: ColaboradorDto, cx: Conexion, idActual?: number): Promise<Record<string, unknown>> {
    const errores: string[] = [];
    const existe = async (sql: string, params: unknown[]) => !!(await cx.uno(sql, params));

    if (!(await existe('SELECT 1 FROM tipos_documento_identidad WHERE id = ? AND activo = 1', [dto.tipoDocumentoId]))) {
      errores.push('El tipo de documento no existe o está inactivo');
    }
    if (!(await existe('SELECT 1 FROM cargos WHERE id = ? AND activo = 1', [dto.cargoId]))) errores.push('El cargo no existe o está inactivo');
    if (!(await existe('SELECT 1 FROM areas WHERE id = ? AND activo = 1', [dto.areaId]))) errores.push('El área no existe o está inactiva');

    for (const e of ENTIDADES) {
      const id = dto[e.campo] as number | null | undefined;
      if (id && !(await existe('SELECT 1 FROM entidades_seguridad_social WHERE id = ? AND tipo = ? AND activo = 1', [id, e.tipo]))) {
        errores.push(`La ${e.nombre} seleccionada no existe o está inactiva`);
      }
    }
    if (dto.jefeId) {
      if (idActual && dto.jefeId === idActual) errores.push('Un colaborador no puede ser su propio jefe');
      else if (!(await existe(`SELECT 1 FROM colaboradores WHERE id = ? AND activo = 1 AND estado = 'ACTIVO'`, [dto.jefeId]))) {
        errores.push('El jefe inmediato no existe o está retirado');
      }
    }

    const hoy = new Date().toISOString().slice(0, 10);
    if (dto.fechaNacimiento) {
      if (dto.fechaNacimiento >= dto.fechaIngreso) errores.push('La fecha de nacimiento debe ser anterior a la fecha de ingreso');
      if (dto.fechaNacimiento > hoy) errores.push('La fecha de nacimiento no puede ser futura');
    }
    if (CONTRATOS_CON_FIN.includes(dto.tipoContrato) && !dto.fechaFinContrato) {
      const nombre = LISTAS.tipoContrato.find((t) => t.valor === dto.tipoContrato)?.etiqueta.toLowerCase();
      errores.push(`Un contrato de ${nombre} necesita fecha de fin`);
    }
    if (dto.fechaFinContrato && dto.fechaFinContrato < dto.fechaIngreso) {
      errores.push('La fecha de fin de contrato no puede ser anterior a la fecha de ingreso');
    }
    for (const [tipo, talla] of Object.entries(dto.tallas ?? {})) {
      if (!valores('tipoTalla').includes(tipo)) errores.push(`Tipo de talla no válido: ${tipo}`);
      else if (talla !== null && talla !== undefined && (typeof talla !== 'string' || talla.trim().length > 10)) {
        errores.push('Cada talla debe tener máximo 10 caracteres');
      }
    }
    if (errores.length) throw new BadRequestException(errores);

    const resultado: Record<string, unknown> = {};
    for (const { campo, columna } of CAMPOS) {
      const v = dto[campo];
      resultado[columna] = v === undefined ? null : v;
    }
    return resultado;
  }

  private async guardarTallas(id: number, tallas: ColaboradorDto['tallas'], cx: Conexion) {
    if (!tallas) return;
    for (const [tipo, talla] of Object.entries(tallas)) {
      const t = typeof talla === 'string' ? talla.trim().toUpperCase() : '';
      if (t) {
        await cx.ejecutar(
          'INSERT INTO colaborador_tallas (colaborador_id, tipo_talla, talla) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE talla = VALUES(talla)',
          [id, tipo, t],
        );
      } else {
        await cx.ejecutar('DELETE FROM colaborador_tallas WHERE colaborador_id = ? AND tipo_talla = ?', [id, tipo]);
      }
    }
  }

  private traducirDuplicado(error: unknown, dto: ColaboradorDto) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      return new ConflictException(`Ya existe un colaborador con el documento ${dto.numeroDocumento}`);
    }
    return error;
  }
}
