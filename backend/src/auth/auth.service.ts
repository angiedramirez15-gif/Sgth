import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { UsuarioToken } from '../common/tipos.js';
import { cifrar, descifrar, hashRespaldo, nuevosCodigosRespaldo } from '../seguridad/cifrado.js';
import { problemaDeClave } from '../seguridad/politica-clave.js';
import { enlaceApp, nuevoSecreto, verificarCodigo } from '../seguridad/totp.js';

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
  version_sesion: number;
  clave_vencida: number; // 1 si la clave superó los días de vigencia
  totp_secreto: string | null;
  totp_activo: number;
  totp_respaldo: string | null;
  totp_ultimo_paso: number | null;
}

/** Lo que recibe el navegador: el token va aparte, en una cookie que JavaScript no puede leer. */
export interface Sesion {
  paso: 'LISTO';
  minutosInactividad: number;
  usuario: Omit<UsuarioToken, 'sub' | 'v' | 'ini'> & { id: number };
  codigosRespaldo?: string[];
}
export interface PasoVerificacion {
  paso: 'CODIGO' | 'CONFIGURAR';
}
export interface Resultado {
  respuesta: Sesion | PasoVerificacion;
  token?: string; // sesión completa
  tokenPrevio?: string; // solo para la doble verificación (10 minutos)
}

/** Datos del token temporal entre la clave y el código de verificación. */
export interface TokenPrevio {
  sub: number;
  fase: 'VERIFICACION';
  v: number;
}

const MENSAJE_INVALIDO = 'Usuario o clave incorrectos';
const MINUTOS_BLOQUEO = 15;
/** Permiso que obliga a usar la doble verificación (quien ve salarios y datos sensibles). */
export const PERMISO_DOBLE_VERIFICACION = 'colaboradores.ver_sensibles';
const HISTORIAL_CLAVES = 5;
/** Hash de una clave cualquiera: se compara contra él cuando el usuario no existe, para que la respuesta tarde lo mismo. */
const HASH_FALSO = bcrypt.hashSync('usuario-inexistente', 10);

@Injectable()
export class AuthService {
  private readonly secretoBase: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfiguracionService,
    env: ConfigService,
  ) {
    this.secretoBase = env.getOrThrow<string>('JWT_SECRETO');
  }

  private async buscarUsuario(condicion: string, valor: string | number) {
    const dias = await this.config.numero('clave_dias_vigencia', 90);
    return this.db.uno<FilaUsuario>(
      `SELECT u.id, u.usuario, u.clave_hash, u.nombre_completo, u.cargo, r.codigo AS rol,
              u.debe_cambiar_clave, u.intentos_fallidos, u.activo, u.bloqueado_hasta, u.version_sesion,
              (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > NOW()) AS bloqueado,
              (? > 0 AND COALESCE(u.clave_cambiada_en, u.creado_en) < NOW() - INTERVAL ? DAY) AS clave_vencida,
              u.totp_secreto, u.totp_activo, u.totp_respaldo, u.totp_ultimo_paso
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
        WHERE ${condicion} = ?`,
      [dias, dias, valor],
    );
  }

  private async permisos(rol: string): Promise<string[]> {
    const filas = await this.db.consultar<{ codigo: string }>(
      `SELECT p.codigo FROM rol_permisos rp
         JOIN permisos p ON p.id = rp.permiso_id
         JOIN roles r    ON r.id = rp.rol_id
        WHERE r.codigo = ? AND r.activo = 1
        ORDER BY p.codigo`,
      [rol],
    );
    return filas.map((p) => p.codigo);
  }

  /** Suma un intento fallido y bloquea al llegar al máximo. Devuelve el mensaje a mostrar. */
  private async intentoFallido(u: FilaUsuario, ip: string | undefined, mensaje: string): Promise<never> {
    const maximo = await this.config.numero('login_intentos_maximos', 5);
    const intentos = u.intentos_fallidos + 1;
    if (intentos >= maximo) {
      await this.db.ejecutar(
        `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NOW() + INTERVAL ${MINUTOS_BLOQUEO} MINUTE WHERE id = ?`,
        [u.id],
      );
    } else {
      await this.db.ejecutar('UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?', [intentos, u.id]);
    }
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'LOGIN_FALLIDO', tabla: 'usuarios', registroId: u.id, ip });
    throw new UnauthorizedException(
      intentos >= maximo ? `Demasiados intentos fallidos. El usuario quedó bloqueado ${MINUTOS_BLOQUEO} minutos` : mensaje,
    );
  }

  private verificarBloqueo(u: FilaUsuario) {
    if (u.bloqueado) {
      const hora = u.bloqueado_hasta?.slice(11, 16);
      throw new UnauthorizedException(`Usuario bloqueado por intentos fallidos. Intente de nuevo después de las ${hora}`);
    }
  }

  // ---------------------------------------------------------------------
  //  Paso 1: usuario y clave
  // ---------------------------------------------------------------------

  async login(usuario: string, clave: string, ip?: string): Promise<Resultado> {
    const u = await this.buscarUsuario('u.usuario', usuario.trim());
    if (!u || !u.activo) {
      // Se compara igual contra un hash para que la respuesta tarde lo mismo exista o no el usuario
      await bcrypt.compare(clave, HASH_FALSO);
      await this.auditoria.registrar({ usuarioId: null, accion: 'LOGIN_FALLIDO', tabla: 'usuarios', despues: { usuario }, ip });
      throw new UnauthorizedException(MENSAJE_INVALIDO);
    }
    this.verificarBloqueo(u);
    if (!(await bcrypt.compare(clave, u.clave_hash))) await this.intentoFallido(u, ip, MENSAJE_INVALIDO);

    const permisos = await this.permisos(u.rol);
    if (u.totp_activo || permisos.includes(PERMISO_DOBLE_VERIFICACION)) {
      // La clave es correcta, pero falta el código del celular: no se reinician los intentos todavía
      const previo: TokenPrevio = { sub: u.id, fase: 'VERIFICACION', v: u.version_sesion };
      return {
        respuesta: { paso: u.totp_activo ? 'CODIGO' : 'CONFIGURAR' },
        tokenPrevio: await this.jwt.signAsync(previo, { expiresIn: '10m' }),
      };
    }
    return this.completarIngreso(u, permisos, ip);
  }

  private async completarIngreso(u: FilaUsuario, permisos: string[], ip?: string, extra: Partial<Sesion> = {}): Promise<Resultado> {
    await this.db.ejecutar(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW() WHERE id = ?',
      [u.id],
    );
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'LOGIN', tabla: 'usuarios', registroId: u.id, ip });
    return this.crearSesion(u, permisos, Math.floor(Date.now() / 1000), extra);
  }

  // ---------------------------------------------------------------------
  //  Paso 2: doble verificación
  // ---------------------------------------------------------------------

  private async usuarioPrevio(tokenPrevio: string | undefined): Promise<FilaUsuario> {
    let datos: TokenPrevio;
    try {
      datos = await this.jwt.verifyAsync<TokenPrevio>(tokenPrevio ?? '');
    } catch {
      throw new UnauthorizedException('Pasaron más de 10 minutos. Escriba de nuevo su usuario y clave');
    }
    if (datos.fase !== 'VERIFICACION') throw new UnauthorizedException('Escriba de nuevo su usuario y clave');
    const u = await this.buscarUsuario('u.id', datos.sub);
    if (!u || !u.activo || u.version_sesion !== datos.v) throw new UnauthorizedException('Escriba de nuevo su usuario y clave');
    this.verificarBloqueo(u);
    return u;
  }

  /** Genera el secreto y el código QR para registrar el SGTH en la app del celular. */
  async configurarVerificacion(tokenPrevio: string | undefined) {
    const u = await this.usuarioPrevio(tokenPrevio);
    if (u.totp_activo) throw new BadRequestException('La doble verificación ya está activa. Escriba el código de la app');
    const secreto = nuevoSecreto();
    await this.db.ejecutar('UPDATE usuarios SET totp_secreto = ? WHERE id = ?', [cifrar(secreto, this.secretoBase), u.id]);
    const enlace = enlaceApp(secreto, u.usuario);
    return {
      qr: await QRCode.toDataURL(enlace, { margin: 1, width: 220, errorCorrectionLevel: 'M' }),
      secreto: secreto.match(/.{1,4}/g)!.join(' '),
      cuenta: u.usuario,
    };
  }

  /** Confirma el primer código: activa la doble verificación y entrega los códigos de respaldo. */
  async activarVerificacion(tokenPrevio: string | undefined, codigo: string, ip?: string): Promise<Resultado> {
    const u = await this.usuarioPrevio(tokenPrevio);
    if (u.totp_activo) throw new BadRequestException('La doble verificación ya está activa');
    if (!u.totp_secreto) throw new BadRequestException('Primero escanee el código QR');
    const paso = verificarCodigo(descifrar(u.totp_secreto, this.secretoBase), codigo, null);
    if (paso == null) await this.intentoFallido(u, ip, 'El código no coincide. Revise que la hora del celular sea automática y escriba el código que aparece ahora');
    const respaldo = nuevosCodigosRespaldo();
    await this.db.ejecutar(
      'UPDATE usuarios SET totp_activo = 1, totp_ultimo_paso = ?, totp_respaldo = ? WHERE id = ?',
      [paso, JSON.stringify(respaldo.map((c) => hashRespaldo(c, this.secretoBase))), u.id],
    );
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'EDITAR', tabla: 'usuarios', registroId: u.id, despues: { cambio: 'activó la doble verificación' }, ip });
    return this.completarIngreso(u, await this.permisos(u.rol), ip, { codigosRespaldo: respaldo });
  }

  /** Código de la app o uno de los códigos de respaldo (cada respaldo sirve una sola vez). */
  async verificarCodigo(tokenPrevio: string | undefined, codigo: string, ip?: string): Promise<Resultado> {
    const u = await this.usuarioPrevio(tokenPrevio);
    if (!u.totp_activo || !u.totp_secreto) throw new BadRequestException('Active primero la doble verificación');
    const limpio = codigo.trim();
    if (/^\d{3}\s?\d{3}$/.test(limpio)) {
      const paso = verificarCodigo(descifrar(u.totp_secreto, this.secretoBase), limpio, u.totp_ultimo_paso);
      if (paso == null) await this.intentoFallido(u, ip, 'El código no es correcto o ya se usó. Escriba el código que aparece ahora en la app');
      await this.db.ejecutar('UPDATE usuarios SET totp_ultimo_paso = ? WHERE id = ?', [paso, u.id]);
    } else {
      const lista = JSON.parse(u.totp_respaldo ?? '[]') as string[];
      const hash = hashRespaldo(limpio, this.secretoBase);
      if (!lista.includes(hash)) await this.intentoFallido(u, ip, 'El código de respaldo no es válido o ya se usó');
      const quedan = lista.filter((h) => h !== hash);
      await this.db.ejecutar('UPDATE usuarios SET totp_respaldo = ? WHERE id = ?', [JSON.stringify(quedan), u.id]);
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'EDITAR', tabla: 'usuarios', registroId: u.id, despues: { cambio: 'ingresó con código de respaldo', quedan: quedan.length }, ip });
    }
    return this.completarIngreso(u, await this.permisos(u.rol), ip);
  }

  // ---------------------------------------------------------------------
  //  Clave y compromiso de confidencialidad
  // ---------------------------------------------------------------------

  async cambiarClave(token: UsuarioToken, claveActual: string, claveNueva: string, ip?: string): Promise<Resultado> {
    const u = await this.buscarUsuario('u.id', token.sub);
    if (!u || !u.activo) throw new UnauthorizedException('Usuario no válido');
    if (!(await bcrypt.compare(claveActual, u.clave_hash))) throw new BadRequestException('La clave actual no es correcta');
    const minimo = Math.max(12, await this.config.numero('clave_longitud_minima', 12));
    const problema = problemaDeClave(claveNueva, { usuario: u.usuario, nombre: u.nombre_completo, minimo });
    if (problema) throw new BadRequestException(problema);
    const anteriores = await this.db.consultar<{ clave_hash: string }>(
      'SELECT clave_hash FROM historial_claves WHERE usuario_id = ? ORDER BY id DESC LIMIT ?', [u.id, HISTORIAL_CLAVES - 1],
    );
    for (const h of [u.clave_hash, ...anteriores.map((a) => a.clave_hash)]) {
      if (await bcrypt.compare(claveNueva, h)) throw new BadRequestException(`La clave nueva no puede ser igual a ninguna de sus últimas ${HISTORIAL_CLAVES} claves`);
    }
    const hash = await bcrypt.hash(claveNueva, 12);
    await this.db.transaccion(async (cx) => {
      await cx.ejecutar('INSERT INTO historial_claves (usuario_id, clave_hash) VALUES (?, ?)', [u.id, u.clave_hash]);
      // version_sesion + 1: se cierran las sesiones abiertas en otros equipos
      await cx.ejecutar(
        `UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0, clave_cambiada_en = NOW(),
                version_sesion = version_sesion + 1, actualizado_por = ? WHERE id = ?`,
        [hash, u.id, u.id],
      );
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'EDITAR', tabla: 'usuarios', registroId: u.id, despues: { cambio: 'clave' }, ip }, cx);
    });
    const nuevo = (await this.buscarUsuario('u.id', u.id))!;
    return this.crearSesion(nuevo, await this.permisos(nuevo.rol), token.ini);
  }

  /** Compromiso vigente y si el usuario ya lo aceptó. */
  async compromiso(usuarioId: number) {
    const t = await this.db.uno<{ id: number; version: number; texto: string; aceptado_en: string | null }>(
      `SELECT t.id, t.version, t.texto, DATE_FORMAT(a.aceptado_en, '%Y-%m-%d %H:%i') AS aceptado_en
         FROM textos_legales t
         LEFT JOIN aceptaciones_legales a ON a.texto_id = t.id AND a.usuario_id = ?
        WHERE t.tipo = 'CONFIDENCIALIDAD' AND t.vigente = 1 ORDER BY t.version DESC LIMIT 1`,
      [usuarioId],
    );
    return t ? { id: t.id, version: t.version, texto: t.texto, aceptadoEn: t.aceptado_en } : null;
  }

  async aceptarCompromiso(token: UsuarioToken, textoId: number, ip?: string): Promise<Resultado> {
    const vigente = await this.compromiso(token.sub);
    if (!vigente || vigente.id !== textoId) throw new BadRequestException('El compromiso cambió. Léalo de nuevo antes de aceptarlo');
    await this.db.ejecutar('INSERT IGNORE INTO aceptaciones_legales (usuario_id, texto_id, ip) VALUES (?, ?, ?)', [token.sub, textoId, ip ?? null]);
    await this.auditoria.registrar({ usuarioId: token.sub, accion: 'EDITAR', tabla: 'aceptaciones_legales', registroId: textoId, despues: { cambio: 'aceptó el compromiso de confidencialidad', version: vigente.version }, ip });
    const u = (await this.buscarUsuario('u.id', token.sub))!;
    return this.crearSesion(u, await this.permisos(u.rol), token.ini);
  }

  /** Datos de la sesión actual (al recargar la página). Si la sesión ya no es válida, el guard responde 401. */
  async perfil(token: UsuarioToken): Promise<Sesion> {
    return {
      paso: 'LISTO',
      minutosInactividad: await this.config.numero('sesion_minutos_inactividad', 30),
      usuario: this.publico(token),
    };
  }

  private publico(t: UsuarioToken): Sesion['usuario'] {
    const { sub, v, ini, ...resto } = t as UsuarioToken & { exp?: number; iat?: number };
    void v; void ini;
    delete (resto as { exp?: number }).exp;
    delete (resto as { iat?: number }).iat;
    return { id: sub, ...resto };
  }

  private async crearSesion(u: FilaUsuario, permisos: string[], inicio: number, extra: Partial<Sesion> = {}): Promise<Resultado> {
    const minutos = await this.config.numero('sesion_minutos_inactividad', 30);
    const compromiso = await this.compromiso(u.id);
    const motivoClave = u.debe_cambiar_clave ? 'TEMPORAL' : u.clave_vencida ? 'VENCIDA' : null;
    const datos: UsuarioToken = {
      sub: u.id,
      v: u.version_sesion,
      ini: inicio,
      usuario: u.usuario,
      nombre: u.nombre_completo,
      cargo: u.cargo,
      rol: u.rol,
      permisos,
      cambiarClave: motivoClave !== null,
      motivoClave,
      aceptarCompromiso: !!compromiso && !compromiso.aceptadoEn,
      dobleVerificacion: !!u.totp_activo || !!extra.codigosRespaldo,
    };
    return {
      token: await this.jwt.signAsync(datos, { expiresIn: `${minutos}m` }),
      respuesta: { paso: 'LISTO', minutosInactividad: minutos, usuario: this.publico(datos), ...extra },
    };
  }

  /** El usuario ve cuántos códigos de respaldo le quedan y puede generar unos nuevos. */
  async nuevosRespaldos(token: UsuarioToken, clave: string, ip?: string) {
    const u = await this.buscarUsuario('u.id', token.sub);
    if (!u?.totp_activo) throw new ForbiddenException('No tiene activa la doble verificación');
    if (!(await bcrypt.compare(clave, u.clave_hash))) throw new BadRequestException('La clave no es correcta');
    const respaldo = nuevosCodigosRespaldo();
    await this.db.ejecutar('UPDATE usuarios SET totp_respaldo = ? WHERE id = ?', [JSON.stringify(respaldo.map((c) => hashRespaldo(c, this.secretoBase))), u.id]);
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'EDITAR', tabla: 'usuarios', registroId: u.id, despues: { cambio: 'generó códigos de respaldo nuevos' }, ip });
    return { codigosRespaldo: respaldo };
  }
}
