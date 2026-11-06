import { IdPipe } from '../common/id.pipe.js';
import { Body, Controller, Get, Ip, Param, Patch, Post, Put } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import type { UsuarioToken } from '../common/tipos.js';
import { CambiarEstadoDto } from '../usuarios/dto/usuarios.dto.js';
import { CatalogosService } from './catalogos.service.js';

export class GuardarCatalogoDto {
  @IsObject({ message: 'Datos no válidos' })
  datos: Record<string, unknown>;
}

@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly catalogos: CatalogosService) {}

  /** GET /api/catalogos — qué catálogos existen y sus campos (para armar las pantallas) */
  @Permisos('catalogos.ver', 'catalogos.gestionar')
  @Get()
  definiciones() {
    return this.catalogos.definiciones();
  }

  /** GET /api/catalogos/:catalogo — registros activos e inactivos */
  @Permisos('catalogos.ver', 'catalogos.gestionar')
  @Get(':catalogo')
  listar(@Param('catalogo') catalogo: string) {
    return this.catalogos.listar(catalogo);
  }

  /** POST /api/catalogos/:catalogo  { datos: {...} } */
  @Permisos('catalogos.gestionar')
  @Post(':catalogo')
  crear(@Param('catalogo') catalogo: string, @Body() dto: GuardarCatalogoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.catalogos.crear(catalogo, dto.datos, u, ip);
  }

  /** PUT /api/catalogos/:catalogo/:id  { datos: {...} } */
  @Permisos('catalogos.gestionar')
  @Put(':catalogo/:id')
  editar(
    @Param('catalogo') catalogo: string,
    @Param('id', IdPipe) id: number,
    @Body() dto: GuardarCatalogoDto,
    @UsuarioActual() u: UsuarioToken,
    @Ip() ip: string,
  ) {
    return this.catalogos.editar(catalogo, id, dto.datos, u, ip);
  }

  /** PATCH /api/catalogos/:catalogo/:id/estado  { activo } */
  @Permisos('catalogos.gestionar')
  @Patch(':catalogo/:id/estado')
  cambiarEstado(
    @Param('catalogo') catalogo: string,
    @Param('id', IdPipe) id: number,
    @Body() dto: CambiarEstadoDto,
    @UsuarioActual() u: UsuarioToken,
    @Ip() ip: string,
  ) {
    return this.catalogos.cambiarEstado(catalogo, id, dto.activo, u, ip);
  }
}
