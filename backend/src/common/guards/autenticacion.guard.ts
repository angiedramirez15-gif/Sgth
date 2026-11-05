import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ES_PUBLICO, PERMISOS, SIN_CAMBIO_CLAVE } from '../decorators/decoradores.js';
import type { SolicitudAutenticada, UsuarioToken } from '../tipos.js';

/**
 * Se aplica a TODAS las rutas (RNF-02):
 *  1. Verifica el token JWT, salvo en rutas @Publico().
 *  2. Si el usuario debe cambiar la clave, solo deja pasar rutas @PermitirSinCambioClave().
 *  3. Si la ruta tiene @Permisos(...), exige al menos uno de ellos.
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) return true;

    const solicitud = ctx.switchToHttp().getRequest<SolicitudAutenticada>();
    const [tipo, token] = solicitud.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }

    let usuario: UsuarioToken;
    try {
      usuario = await this.jwt.verifyAsync<UsuarioToken>(token);
    } catch {
      throw new UnauthorizedException('La sesión expiró. Inicie sesión de nuevo');
    }
    solicitud.usuario = usuario;

    if (usuario.cambiarClave && !this.reflector.getAllAndOverride<boolean>(SIN_CAMBIO_CLAVE, objetivos)) {
      throw new ForbiddenException('Debe cambiar su clave antes de continuar');
    }

    const requeridos = this.reflector.getAllAndOverride<string[]>(PERMISOS, objetivos);
    if (requeridos?.length && !requeridos.some((p) => usuario.permisos.includes(p))) {
      throw new ForbiddenException('No tiene permiso para esta acción');
    }
    return true;
  }
}
