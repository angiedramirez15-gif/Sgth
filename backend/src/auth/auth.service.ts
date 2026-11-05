import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { UsuarioToken } from '../common/tipos.js';

interface FilaUsuario {
  id: number;
  usuario: string;
  clave_hash: string;
  nombre_completo: string;
  cargo: string;
  rol: string;
  debe_cambiar_clave: number;
  intentos_fallidos: number;
  activo: number;
  bloqueado: number; // 1 si bloqueado_hasta > NOW()
  bloqueado_hasta: string | null;
}

export interface RespuestaSesion {
  token: string;
  minutosInactividad: number;
  usuario: Omit<UsuarioToken, 'sub'> & { id: number };
}

const MENSAJE_INVALIDO = 'Usuario o clave incorrectos';
const MINUTOS_BLOQUEO = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
  ) {}

  private buscarUsuario(condicion: string, valor: string | number) {
    return this.db.uno<FilaUsuario>(
      `SELECT u.id, u.usuario, u.clave_hash, u.nombre_completo, u.cargo, r.codigo AS rol,
              u.debe_cambiar_clave, u.intentos_fallidos, u.activo, u.bloqueado_hasta,
              (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > NOW()) AS bloqueado
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
        WHERE ${condicion} = ?`,
      [valor],
    );
  }

  async login(usuario: string, clave: string, ip?: string): Promise<RespuestaSesion> {
    const u = await this.buscarUsuario('u.usuario', usuario.trim());

    if (!u || !u.activo) {
      await this.auditoria.registrar({ usuarioId: null, accion: 'LOGIN_FALLIDO', tabla: 'usuarios', despues: { usuario }, ip });
      throw new UnauthorizedException(MENSAJE_INVALIDO);
    }

    if (u.bloqueado) {
      const hora = u.bloqueado_hasta?.slice(11, 16);
      throw new UnauthorizedException(
        `Usuario bloqueado por intentos fallidos. Intente de nuevo después de las ${hora}`,
      );
    }

    if (!(await bcrypt.compare(clave, u.clave_hash))) {
      const maximo = await this.config.numero('login_intentos_maximos', 5);
      const intentos = u.intentos_fallidos + 1;
      if (intentos >= maximo) {
        await this.db.ejecutar(
          `UPDATE usuarios SET intentos_fallidos = 0,
                  bloqueado_hasta = NOW() + INTERVAL ${MINUTOS_BLOQUEO} MINUTE WHERE id = ?`,
          [u.id],
        );
      } else {
        await this.db.ejecutar('UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?', [intentos, u.id]);
      }
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'LOGIN_FALLIDO', tabla: 'usuarios', registroId: u.id, ip });
      throw new UnauthorizedException(
        intentos >= maximo
          ? `Demasiados intentos fallidos. El usuario quedó bloqueado ${MINUTOS_BLOQUEO} minutos`
          : MENSAJE_INVALIDO,
      );
    }

    await this.db.ejecutar(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW() WHERE id = ?',
      [u.id],
    );
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'LOGIN', tabla: 'usuarios', registroId: u.id, ip });
    return this.crearSesion(u);
  }

  async cambiarClave(usuarioId: number, claveActual: string, claveNueva: string, ip?: string) {
    const u = await this.buscarUsuario('u.id', usuarioId);
    if (!u || !u.activo) throw new UnauthorizedException('Usuario no válido');
    if (!(await bcrypt.compare(claveActual, u.clave_hash))) {
      throw new BadRequestException('La clave actual no es correcta');
    }
    if (claveActual === claveNueva) {
      throw new BadRequestException('La clave nueva debe ser diferente a la actual');
    }
    const hash = await bcrypt.hash(claveNueva, 10);
    await this.db.ejecutar(
      'UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0, actualizado_por = ? WHERE id = ?',
      [hash, usuarioId, usuarioId],
    );
    await this.auditoria.registrar({
      usuarioId,
      accion: 'EDITAR',
      tabla: 'usuarios',
      registroId: usuarioId,
      despues: { cambio: 'clave' },
      ip,
    });
    return this.crearSesion({ ...u, debe_cambiar_clave: 0 });
  }

  private async crearSesion(u: FilaUsuario): Promise<RespuestaSesion> {
    const permisos = await this.db.consultar<{ codigo: string }>(
      `SELECT p.codigo FROM rol_permisos rp
         JOIN permisos p ON p.id = rp.permiso_id
         JOIN roles r    ON r.id = rp.rol_id
        WHERE r.codigo = ? AND r.activo = 1
        ORDER BY p.codigo`,
      [u.rol],
    );
    const datos: UsuarioToken = {
      sub: u.id,
      usuario: u.usuario,
      nombre: u.nombre_completo,
      cargo: u.cargo,
      rol: u.rol,
      permisos: permisos.map((p) => p.codigo),
      cambiarClave: Boolean(u.debe_cambiar_clave),
    };
    const { sub, ...resto } = datos;
    return {
      token: await this.jwt.signAsync(datos),
      minutosInactividad: await this.config.numero('sesion_minutos_inactividad', 30),
      usuario: { id: sub, ...resto },
    };
  }
}
