import { BadRequestException, Controller, Get, Ip, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { disposicion } from '../common/descargas.js';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import type { UsuarioToken } from '../common/tipos.js';
import { type Reporte, REPORTES, ReportesService } from './reportes.service.js';

@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Permisos('reportes.ver')
  @Get(':reporte')
  async descargar(
    @Param('reporte') reporte: string,
    @UsuarioActual() u: UsuarioToken,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
    @Query('estado') estado?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('plantilla') plantilla?: string,
    @Query('cargoId') cargoId?: string,
  ) {
    if (!(REPORTES as readonly string[]).includes(reporte)) throw new BadRequestException('Reporte no válido');
    const r = await this.reportes.generar(reporte as Reporte, {
      estado: estado || undefined, desde: desde || undefined, hasta: hasta || undefined, plantilla: plantilla || undefined,
      cargoId: cargoId ? Number(cargoId) || undefined : undefined,
    }, u, ip);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': disposicion(r.nombre, false) });
    return new StreamableFile(r.contenido);
  }
}
