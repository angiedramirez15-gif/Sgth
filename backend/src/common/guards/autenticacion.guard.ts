import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { ConfiguracionService } from '../../configuracion/configuracion.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { CABECERA_SGTH, COOKIE_SESION, ponerSesion } from '../../seguridad/cookies.js';
import { ES_PUBLICO, PERMISOS, SIN_CAMBIO_CLAVE } from '../decorators/decoradores.js';
import type { SolicitudAutenticada, UsuarioToken } from '../tipos.js';

/** Una sesión dura como máximo 12 horas aunque haya actividad. */
const MAXIMO_SESION_SEG = 12 * 60 * 60;
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Se aplica a TODAS las rutas (RNF-02):
 *  1. Verifica la sesión (cookie httpOnly), salvo en rutas @Publico().
 *  2. Revisa en la base que el usuario siga activo y que la sesión no se haya cerrado
 *     (al inactivarlo, cambiar su rol o su clave).
 *  3. En peticiones que cambian datos exige la cabecera X-SGTH (protección CSRF).
 *  4. Si debe cambiar la clave o aceptar el compromiso de confidencialidad, solo deja
 *     pasar rutas @PermitirSinCambioClave().
 *  5. Si la ruta tiene @Permisos(...), exige al menos uno de ellos.
 *  6. Renueva la sesión mientras hay actividad (vence tras los minutos de inactividad).
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
    private readonly config: ConfiguracionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) return true;

    const solicitud = ctx.switchToHttp().getRequest<SolicitudAutenticada>();
    const respuesta = ctx.switchToHttp().getResponse<Response>();
    const deCookie = solicitud.cookies?.[COOKIE_SESION] as string | undefined;
    const [tipo, deCabecera] = solicitud.headers.authorization?.split(' ') ?? [];
    const token = deCookie ?? (tipo === 'Bearer' ? deCabecera : undefined);
    if (!token) throw new UnauthorizedException('Debe iniciar sesión');

    // Con cookie, el navegador la envía solo: se exige la cabecera que otra página no puede poner
    if (deCookie && !METODOS_SEGUROS.has(solicitud.method) && solicitud.headers[CABECERA_SGTH] !== '1') {
      throw new ForbiddenException('Solicitud no permitida');
    }

    let usuario: UsuarioToken & { exp: number };
    try {
      usuario = await this.jwt.verifyAsync<UsuarioToken & { exp: number }>(token);
    } catch {
      throw new UnauthorizedException('La sesión expiró. Inicie sesión de nuevo');
    }
    const ahora = Math.floor(Date.now() / 1000);
    if ((usuario as { fase?: string }).fase || !usuario.ini || ahora - usuario.ini > MAXIMO_SESION_SEG) {
      throw new UnauthorizedException('La sesión expiró. Inicie sesión de nuevo');
    }

    const actual = await this.db.uno<{ activo: number; version_sesion: number }>(
      'SELECT activo, version_sesion FROM usuarios WHERE id = ?', [usuario.sub],
    );
    if (!actual?.activo || actual.version_sesion !== usuario.v) {
      throw new UnauthorizedException('Su sesión se cerró porque cambiaron sus datos de acceso. Inicie sesión de nuevo');
    }
    solicitud.usuario = usuario;

    const permitidaPendiente = this.reflector.getAllAndOverride<boolean>(SIN_CAMBIO_CLAVE, objetivos);
    if (usuario.cambiarClave && !permitidaPendiente) {
      throw new ForbiddenException('Debe cambiar su clave antes de continuar');
    }
    if (usuario.aceptarCompromiso && !permitidaPendiente) {
      throw new ForbiddenException('Debe aceptar el compromiso de confidencialidad antes de continuar');
    }

    const requeridos = this.reflector.getAllAndOverride<string[]>(PERMISOS, objetivos);
    if (requeridos?.length && !requeridos.some((p) => usuario.permisos.includes(p))) {
      throw new ForbiddenException('No tiene permiso para esta acción');
    }

    // Sesión deslizante: si ya pasó la mitad del tiempo, se entrega un token nuevo
    if (deCookie) {
      const minutos = await this.config.numero('sesion_minutos_inactividad', 30);
      if (usuario.exp - ahora < (minutos * 60) / 2) {
        const { exp, iat, ...datos } = usuario as UsuarioToken & { exp: number; iat?: number };
        void exp; void iat;
        ponerSesion(solicitud, respuesta, await this.jwt.signAsync(datos, { expiresIn: `${minutos}m` }));
      }
    }
    return true;
  }
}
