import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CambiarClaveDto, LoginDto } from './dto/auth.dto.js';
import { PermitirSinCambioClave, Publico, UsuarioActual } from '../common/decorators/decoradores.js';
import type { UsuarioToken } from '../common/tipos.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/login  { usuario, clave } */
  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.usuario, dto.clave, ip);
  }

  /** POST /api/auth/cambiar-clave  { claveActual, claveNueva } — devuelve un token nuevo */
  @PermitirSinCambioClave()
  @Post('cambiar-clave')
  @HttpCode(200)
  cambiarClave(@UsuarioActual() u: UsuarioToken, @Body() dto: CambiarClaveDto, @Ip() ip: string) {
    return this.auth.cambiarClave(u.sub, dto.claveActual, dto.claveNueva, ip);
  }

  /** GET /api/auth/perfil — datos del usuario en sesión */
  @PermitirSinCambioClave()
  @Get('perfil')
  perfil(@UsuarioActual() u: UsuarioToken) {
    const { sub, ...resto } = u;
    return { id: sub, ...resto };
  }
}
