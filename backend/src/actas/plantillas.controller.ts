import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import type { UsuarioToken } from '../common/tipos.js';
import { PlantillaDto } from './dto/plantilla.dto.js';
import { PlantillasService } from './plantillas.service.js';
import type { Plantilla } from './textos.js';

const VER = ['plantillas.ver', 'plantillas.gestionar'];

@Controller('plantillas')
export class PlantillasController {
  constructor(private readonly plantillas: PlantillasService) {}

  @Permisos(...VER)
  @Get()
  listar() {
    return this.plantillas.listar();
  }

  @Permisos(...VER)
  @Get(':plantilla')
  obtener(@Param('plantilla') plantilla: Plantilla, @Query('version') id?: string) {
    return this.plantillas.obtener(plantilla, id ? Number(id) || undefined : undefined);
  }

  @Permisos(...VER)
  @Get(':plantilla/versiones')
  versiones(@Param('plantilla') plantilla: Plantilla) {
    return this.plantillas.versiones(plantilla);
  }

  @Permisos('plantillas.gestionar')
  @Post(':plantilla')
  guardar(@Param('plantilla') plantilla: Plantilla, @Body() dto: PlantillaDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.plantillas.guardar(plantilla, dto, u, ip);
  }

  @Permisos(...VER)
  @Post(':plantilla/vista-previa')
  @HttpCode(200)
  async vistaPrevia(@Param('plantilla') plantilla: Plantilla, @Body() dto: PlantillaDto, @Res({ passthrough: true }) res: Response) {
    const pdf = await this.plantillas.vistaPrevia(plantilla, dto);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Vista_previa_acta.pdf"' });
    return new StreamableFile(pdf);
  }
}
