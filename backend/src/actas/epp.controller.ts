import { Body, Controller, Get, HttpCode, Ip, Param, Post, Put, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ArchivosService } from '../archivos/archivos.service.js';
import { disposicion } from '../common/descargas.js';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import { IdPipe } from '../common/id.pipe.js';
import type { UsuarioToken } from '../common/tipos.js';
import { MatrizCargoDto, PlanillaDto } from './dto/epp.dto.js';
import { EppService } from './epp.service.js';

const VER = ['inventario_epp.ver', 'inventario_epp.gestionar', 'actas_epp.gestionar'];
const MIME: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' };

@Controller()
export class EppController {
  constructor(
    private readonly epp: EppService,
    private readonly archivos: ArchivosService,
  ) {}

  @Permisos(...VER)
  @Get('epp/matriz')
  matriz() {
    return this.epp.matriz();
  }

  @Permisos('inventario_epp.gestionar')
  @Put('epp/matriz/:cargoId')
  guardarMatriz(@Param('cargoId', IdPipe) cargoId: number, @Body() dto: MatrizCargoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.epp.guardarMatriz(cargoId, dto, u, ip);
  }

  @Permisos(...VER)
  @Get('epp/reposiciones')
  reposiciones() {
    return this.epp.reposiciones();
  }

  @Permisos(...VER, 'colaboradores.ver')
  @Get('colaboradores/:id/epp')
  estado(@Param('id', IdPipe) id: number) {
    return this.epp.estadoColaborador(id);
  }

  @Permisos(...VER)
  @Get('epp/planillas')
  planillas() {
    return this.epp.listarPlanillas();
  }

  @Permisos('actas_epp.gestionar')
  @Post('epp/planillas')
  crearPlanilla(@Body() dto: PlanillaDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.epp.crearPlanilla(dto, u, ip);
  }

  @Permisos(...VER)
  @Get('epp/planillas/:id')
  planilla(@Param('id', IdPipe) id: number) {
    return this.epp.obtenerPlanilla(id);
  }

  @Permisos(...VER)
  @Get('epp/planillas/:id/pdf')
  async pdf(@Param('id', IdPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const r = await this.epp.pdfPlanilla(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': disposicion(r.nombre, true) });
    return r.contenido ? new StreamableFile(r.contenido) : new StreamableFile(await this.archivos.abrir(r.ruta!));
  }

  @Permisos('actas_epp.gestionar')
  @Post('epp/planillas/:id/firmada')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 52 * 1024 * 1024, files: 1 } }))
  subir(@Param('id', IdPipe) id: number, @UploadedFile() archivo: { buffer: Buffer } | undefined, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.epp.subirPlanillaFirmada(id, archivo?.buffer, u, ip);
  }

  @Permisos(...VER)
  @Get('epp/planillas/:id/firmada')
  async firmada(@Param('id', IdPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const f = await this.epp.rutaPlanillaFirmada(id);
    res.set({ 'Content-Type': MIME[f.nombre.split('.').pop()!] ?? 'application/octet-stream', 'Content-Disposition': disposicion(f.nombre, true) });
    return new StreamableFile(await this.archivos.abrir(f.ruta));
  }
}
