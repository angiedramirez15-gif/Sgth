import { IdPipe } from '../common/id.pipe.js';
import { Body, Controller, Get, HttpCode, Ip, Param, Patch, Post, Put } from '@nestjs/common';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import type { UsuarioToken } from '../common/tipos.js';
import { CambiarEstadoDto, CrearUsuarioDto, EditarUsuarioDto } from './dto/usuarios.dto.js';
import { UsuariosService } from './usuarios.service.js';

@Permisos('usuarios.gestionar')
@Controller()
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  /** GET /api/usuarios */
  @Get('usuarios')
  listar() {
    return this.usuarios.listar();
  }

  /** GET /api/roles — roles y sus permisos (solo lectura) */
  @Get('roles')
  roles() {
    return this.usuarios.roles();
  }

  /** POST /api/usuarios — devuelve el usuario y su clave temporal (se muestra una sola vez) */
  @Post('usuarios')
  crear(@Body() dto: CrearUsuarioDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.usuarios.crear(dto, u, ip);
  }

  /** PUT /api/usuarios/:id */
  @Put('usuarios/:id')
  editar(@Param('id', IdPipe) id: number, @Body() dto: EditarUsuarioDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.usuarios.editar(id, dto, u, ip);
  }

  /** PATCH /api/usuarios/:id/estado  { activo } */
  @Patch('usuarios/:id/estado')
  cambiarEstado(@Param('id', IdPipe) id: number, @Body() dto: CambiarEstadoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.usuarios.cambiarEstado(id, dto.activo, u, ip);
  }

  /** POST /api/usuarios/:id/restablecer-clave — devuelve la clave temporal nueva */
  @Post('usuarios/:id/restablecer-clave')
  @HttpCode(200)
  restablecerClave(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.usuarios.restablecerClave(id, u, ip);
  }

  /** POST /api/usuarios/:id/reiniciar-verificacion — para quien perdió o cambió el celular */
  @Post('usuarios/:id/reiniciar-verificacion')
  @HttpCode(200)
  reiniciarVerificacion(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.usuarios.reiniciarVerificacion(id, u, ip);
  }
}
