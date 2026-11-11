import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { generarClaveTemporal } from '../common/claves.js';
import type { UsuarioToken } from '../common/tipos.js';
import { DatabaseService, type Conexion } from '../database/database.service.js';
import type { CrearUsuarioDto, EditarUsuarioDto } from './dto/usuarios.dto.js';

export interface FilaUsuarioLista {
  id: number;
  usuario: string;
  nombreCompleto: string;
  cargo: string;
  correo: string | null;
  rol: string;
  rolNombre: string;
  activo: boolean;
  debeCambiarClave: boolean;
  bloqueado: boolean;
  ultimoAcceso: string | null;
  creadoEn: string;
  dobleVerificacion: boolean;
  compromisoAceptado: string | null;
}

const SELECT_USUARIOS = `
  SELECT u.id, u.usuario, u.nombre_completo AS nombreCompleto, u.cargo, u.correo,
         r.codigo AS rol, r.nombre AS rolNombre, u.activo, u.debe_cambiar_clave AS debeCambiarClave,
         (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > NOW()) AS bloqueado,
         u.ultimo_acceso AS ultimoAcceso, u.creado_en AS creadoEn, u.totp_activo AS dobleVerificacion,
         (SELECT DATE_FORMAT(MAX(a.aceptado_en), '%Y-%m-%d %H:%i') FROM aceptaciones_legales a
            JOIN textos_legales t ON t.id = a.texto_id AND t.vigente = 1 AND t.tipo = 'CONFIDENCIALIDAD'
           WHERE a.usuario_id = u.id) AS compromisoAceptado
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id`;

function normalizar(f: Record<string, unknown>): FilaUsuarioLista {
  return { ...f, activo: !!f.activo, debeCambiarClave: !!f.debeCambiarClave, bloqueado: !!f.bloqueado, dobleVerificacion: !!f.dobleVerificacion } as FilaUsuarioLista;
}

/** Administración de usuarios del sistema (RF-03, RF-05). */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(): Promise<FilaUsuarioLista[]> {
    const filas = await this.db.consultar<Record<string, unknown>>(`${SELECT_USUARIOS} ORDER BY u.activo DESC, u.nombre_completo`);
    return filas.map(normalizar);
  }

  async obtener(id: number, cx: Conexion = this.db): Promise<FilaUsuarioLista> {
    const fila = await cx.uno<Record<string, unknown>>(`${SELECT_USUARIOS} WHERE u.id = ?`, [id]);
    if (!fila) throw new NotFoundException('El usuario no existe');
    return normalizar(fila);
  }

  /** Roles con sus permisos, para mostrarlos en la pantalla (solo lectura). */
  async roles() {
    const roles = await this.db.consultar<{ id: number; codigo: string; nombre: string; descripcion: string }>(
      'SELECT id, codigo, nombre, descripcion FROM roles WHERE activo = 1 ORDER BY id',
    );
    const permisos = await this.db.consultar<{ rolId: number; codigo: string; modulo: string; descripcion: string }>(
      `SELECT rp.rol_id AS rolId, p.codigo, p.modulo, p.descripcion
         FROM rol_permisos rp JOIN permisos p ON p.id = rp.permiso_id
        ORDER BY p.modulo, p.codigo`,
    );
    return roles.map((r) => ({ ...r, permisos: permisos.filter((p) => p.rolId === r.id).map(({ rolId, ...p }) => p) }));
  }

  async crear(dto: CrearUsuarioDto, actor: UsuarioToken, ip?: string) {
    const rolId = await this.idRol(dto.rol);
    const claveTemporal = generarClaveTemporal(12);
    const hash = await bcrypt.hash(claveTemporal, 12);
    try {
      const r = await this.db.ejecutar(
        `INSERT INTO usuarios (usuario, clave_hash, nombre_completo, cargo, correo, rol_id, debe_cambiar_clave, clave_cambiada_en, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), ?)`,
        [dto.usuario, hash, dto.nombreCompleto, dto.cargo, dto.correo ?? null, rolId, actor.sub],
      );
      const usuario = await this.obtener(r.insertId);
      await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'CREAR', tabla: 'usuarios', registroId: r.insertId, despues: usuario, ip });
      return { usuario, claveTemporal };
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`Ya existe un usuario con el nombre de inicio de sesión "${dto.usuario}"`);
      }
      throw error;
    }
  }

  async editar(id: number, dto: EditarUsuarioDto, actor: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      const antes = await this.obtener(id, cx);
      if (antes.rol === 'ADMIN' && dto.rol !== 'ADMIN') {
        if (id === actor.sub) throw new BadRequestException('No puede quitarse a sí mismo el rol de Administrador');
        await this.verificarOtroAdministrador(id, cx);
      }
      const rolId = await this.idRol(dto.rol, cx);
      await cx.ejecutar(
        // Si cambia el rol, se cierran sus sesiones para que entre con los permisos nuevos
        `UPDATE usuarios SET nombre_completo = ?, cargo = ?, correo = ?, rol_id = ?, actualizado_por = ?,
                version_sesion = version_sesion + IF(rol_id <> ?, 1, 0) WHERE id = ?`,
        [dto.nombreCompleto, dto.cargo, dto.correo ?? null, rolId, actor.sub, rolId, id],
      );
      const despues = await this.obtener(id, cx);
      await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'EDITAR', tabla: 'usuarios', registroId: id, antes, despues, ip }, cx);
      return despues;
    });
  }

  async cambiarEstado(id: number, activo: boolean, actor: UsuarioToken, ip?: string) {
    return this.db.transaccion(async (cx) => {
      const antes = await this.obtener(id, cx);
      if (!activo) {
        if (id === actor.sub) throw new BadRequestException('No puede inactivar su propio usuario');
        if (antes.rol === 'ADMIN') await this.verificarOtroAdministrador(id, cx);
      }
      await cx.ejecutar('UPDATE usuarios SET activo = ?, actualizado_por = ?, version_sesion = version_sesion + 1 WHERE id = ?', [activo ? 1 : 0, actor.sub, id]);
      const despues = await this.obtener(id, cx);
      await this.auditoria.registrar(
        { usuarioId: actor.sub, accion: activo ? 'EDITAR' : 'INACTIVAR', tabla: 'usuarios', registroId: id, antes: { activo: antes.activo }, despues: { activo }, ip },
        cx,
      );
      return despues;
    });
  }

  /** Genera una clave temporal nueva y desbloquea el usuario. */
  async restablecerClave(id: number, actor: UsuarioToken, ip?: string) {
    if (id === actor.sub) {
      throw new BadRequestException('Para cambiar su propia clave use la opción "Cambiar clave" del menú de su cuenta');
    }
    const usuario = await this.obtener(id);
    if (!usuario.activo) throw new BadRequestException('Active el usuario antes de restablecer su clave');
    const claveTemporal = generarClaveTemporal(12);
    await this.db.ejecutar(
      `UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 1, intentos_fallidos = 0, clave_cambiada_en = NOW(),
              bloqueado_hasta = NULL, version_sesion = version_sesion + 1, actualizado_por = ? WHERE id = ?`,
      [await bcrypt.hash(claveTemporal, 12), actor.sub, id],
    );
    await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'EDITAR', tabla: 'usuarios', registroId: id, despues: { cambio: 'restablecer clave' }, ip });
    return { usuario: await this.obtener(id), claveTemporal };
  }

  /** Borra la doble verificación (celular perdido o cambiado): la configura de nuevo al ingresar. */
  async reiniciarVerificacion(id: number, actor: UsuarioToken, ip?: string) {
    if (id === actor.sub) throw new BadRequestException('Otro administrador debe reiniciar su doble verificación');
    await this.obtener(id);
    await this.db.ejecutar(
      `UPDATE usuarios SET totp_activo = 0, totp_secreto = NULL, totp_respaldo = NULL, totp_ultimo_paso = NULL,
              version_sesion = version_sesion + 1, actualizado_por = ? WHERE id = ?`,
      [actor.sub, id],
    );
    await this.auditoria.registrar({ usuarioId: actor.sub, accion: 'EDITAR', tabla: 'usuarios', registroId: id, despues: { cambio: 'reinició la doble verificación' }, ip });
    return this.obtener(id);
  }

  private async idRol(codigo: string, cx: Conexion = this.db): Promise<number> {
    const rol = await cx.uno<{ id: number }>('SELECT id FROM roles WHERE codigo = ? AND activo = 1', [codigo]);
    if (!rol) throw new BadRequestException('El rol seleccionado no existe');
    return rol.id;
  }

  /** Siempre debe quedar al menos un administrador activo. */
  private async verificarOtroAdministrador(idExcluido: number, cx: Conexion) {
    const otro = await cx.uno<{ total: number }>(
      `SELECT COUNT(*) AS total FROM usuarios u JOIN roles r ON r.id = u.rol_id
        WHERE r.codigo = 'ADMIN' AND u.activo = 1 AND u.id <> ?`,
      [idExcluido],
    );
    if (!otro || Number(otro.total) === 0) {
      throw new BadRequestException('Debe quedar al menos un administrador activo en el sistema');
    }
  }
}
