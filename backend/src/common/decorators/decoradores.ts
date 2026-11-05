import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { SolicitudAutenticada, UsuarioToken } from '../tipos.js';

export const ES_PUBLICO = 'es_publico';
export const PERMISOS = 'permisos';
export const SIN_CAMBIO_CLAVE = 'sin_cambio_clave';

/** La ruta no requiere iniciar sesión (ej.: login, salud). */
export const Publico = () => SetMetadata(ES_PUBLICO, true);

/**
 * La ruta requiere al menos uno de estos permisos.
 * Ejemplo: @Permisos('colaboradores.gestionar')
 */
export const Permisos = (...permisos: string[]) => SetMetadata(PERMISOS, permisos);

/** La ruta se puede usar aunque el usuario aún deba cambiar su clave. */
export const PermitirSinCambioClave = () => SetMetadata(SIN_CAMBIO_CLAVE, true);

/** Inyecta el usuario que inició sesión: metodo(@UsuarioActual() u: UsuarioToken) */
export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioToken | undefined =>
    ctx.switchToHttp().getRequest<SolicitudAutenticada>().usuario,
);
