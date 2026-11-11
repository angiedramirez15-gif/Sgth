import { Body, Controller, Get, HttpCode, Ip, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, type Resultado } from './auth.service.js';
import { AceptarCompromisoDto, CambiarClaveDto, CodigoDto, LoginDto, ConfirmarClaveDto } from './dto/auth.dto.js';
import { PermitirSinCambioClave, Publico, UsuarioActual } from '../common/decorators/decoradores.js';
import type { UsuarioToken } from '../common/tipos.js';
import { borrarSesion, COOKIE_PREVIA, ponerPrevia, ponerSesion } from '../seguridad/cookies.js';

/** Máximo 10 intentos por minuto desde el mismo equipo en el ingreso y la verificación. */
const LIMITE_INGRESO = { general: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private responder(req: Request, res: Response, r: Resultado) {
    if (r.token) ponerSesion(req, res, r.token);
    if (r.tokenPrevio) ponerPrevia(req, res, r.tokenPrevio);
    return r.respuesta;
  }

  /** POST /api/auth/login  { usuario, clave } → LISTO, o CODIGO / CONFIGURAR si falta la doble verificación */
  @Publico()
  @Throttle(LIMITE_INGRESO)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.responder(req, res, await this.auth.login(dto.usuario, dto.clave, ip));
  }

  @Publico()
  @Throttle(LIMITE_INGRESO)
  @Post('verificacion/configurar')
  @HttpCode(200)
  configurar(@Req() req: Request) {
    return this.auth.configurarVerificacion(req.cookies?.[COOKIE_PREVIA]);
  }

  @Publico()
  @Throttle(LIMITE_INGRESO)
  @Post('verificacion/activar')
  @HttpCode(200)
  async activar(@Body() dto: CodigoDto, @Ip() ip: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.responder(req, res, await this.auth.activarVerificacion(req.cookies?.[COOKIE_PREVIA], dto.codigo, ip));
  }

  @Publico()
  @Throttle(LIMITE_INGRESO)
  @Post('verificacion/codigo')
  @HttpCode(200)
  async codigo(@Body() dto: CodigoDto, @Ip() ip: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.responder(req, res, await this.auth.verificarCodigo(req.cookies?.[COOKIE_PREVIA], dto.codigo, ip));
  }

  /** Cierra la sesión en este navegador. */
  @Publico()
  @Post('salir')
  @HttpCode(204)
  salir(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    borrarSesion(req, res);
  }

  /** POST /api/auth/cambiar-clave  { claveActual, claveNueva } — cierra las sesiones en otros equipos */
  @PermitirSinCambioClave()
  @Throttle(LIMITE_INGRESO)
  @Post('cambiar-clave')
  @HttpCode(200)
  async cambiarClave(@UsuarioActual() u: UsuarioToken, @Body() dto: CambiarClaveDto, @Ip() ip: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.responder(req, res, await this.auth.cambiarClave(u, dto.claveActual, dto.claveNueva, ip));
  }

  @PermitirSinCambioClave()
  @Get('compromiso')
  compromiso(@UsuarioActual() u: UsuarioToken) {
    return this.auth.compromiso(u.sub);
  }

  @PermitirSinCambioClave()
  @Post('compromiso')
  @HttpCode(200)
  async aceptar(@UsuarioActual() u: UsuarioToken, @Body() dto: AceptarCompromisoDto, @Ip() ip: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.responder(req, res, await this.auth.aceptarCompromiso(u, dto.textoId, ip));
  }

  @Throttle(LIMITE_INGRESO)
  @Post('verificacion/respaldos')
  @HttpCode(200)
  respaldos(@UsuarioActual() u: UsuarioToken, @Body() dto: ConfirmarClaveDto, @Ip() ip: string) {
    return this.auth.nuevosRespaldos(u, dto.clave, ip);
  }

  /** GET /api/auth/perfil — datos de la sesión (al abrir o recargar la página) */
  @PermitirSinCambioClave()
  @Get('perfil')
  perfil(@UsuarioActual() u: UsuarioToken) {
    return this.auth.perfil(u);
  }
}
