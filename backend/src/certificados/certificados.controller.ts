import { Body, Controller, Get, HttpCode, Ip, Param, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ArchivosService } from '../archivos/archivos.service.js';
import { disposicion } from '../common/descargas.js';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import { IdPipe } from '../common/id.pipe.js';
import type { UsuarioToken } from '../common/tipos.js';
import { CertificadosService } from './certificados.service.js';
import { CertificadoDto } from './dto/certificado.dto.js';

/** Expedir un certificado: Talento Humano (gestiona colaboradores). */
const EXPEDIR = 'colaboradores.gestionar';

@Controller()
export class CertificadosController {
  constructor(
    private readonly certificados: CertificadosService,
    private readonly archivos: ArchivosService,
  ) {}

  @Permisos(EXPEDIR)
  @Get('colaboradores/:id/certificados')
  listar(@Param('id', IdPipe) id: number) {
    return this.certificados.listar(id);
  }

  @Permisos(EXPEDIR)
  @Get('colaboradores/:id/certificados/estado')
  estado(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken) {
    return this.certificados.estado(id, u);
  }

  @Permisos(EXPEDIR)
  @Post('colaboradores/:id/certificados')
  crear(@Param('id', IdPipe) id: number, @Body() dto: CertificadoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.certificados.crear(id, dto, u, ip);
  }

  @Permisos(EXPEDIR)
  @Get('certificados/:id/pdf')
  async pdf(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.certificados.archivo(id, u, ip);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': disposicion(f.nombre, true) });
    return new StreamableFile(await this.archivos.abrir(f.ruta));
  }

  // --- Firma escaneada (Configuración) ---

  @Permisos('configuracion.gestionar')
  @Get('certificados/configuracion')
  async configuracion() {
    return { faltantes: await this.certificados.faltantes() };
  }

  @Permisos('configuracion.gestionar')
  @Get('certificados/firma')
  async firma(@Res({ passthrough: true }) res: Response) {
    const f = await this.certificados.rutaFirma();
    res.set({ 'Content-Type': f.mime, 'Cache-Control': 'no-store' });
    return new StreamableFile(await this.archivos.abrir(f.ruta));
  }

  @Permisos('configuracion.gestionar')
  @Post('certificados/firma')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 3 * 1024 * 1024, files: 1 } }))
  subirFirma(@UploadedFile() archivo: { buffer: Buffer } | undefined, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.certificados.subirFirma(archivo?.buffer, u, ip);
  }
}
