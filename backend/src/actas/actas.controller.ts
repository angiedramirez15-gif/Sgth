import { BadRequestException, Body, Controller, Get, HttpCode, Ip, Param, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ArchivosService } from '../archivos/archivos.service.js';
import { disposicion } from '../common/descargas.js';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import { IdPipe } from '../common/id.pipe.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ActasService } from './actas.service.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActaAntiguaDto, AnularDto, DevolucionDto, EntregaDto } from './dto/acta.dto.js';
import { MOTIVOS, MOTIVOS_POR_PLANTILLA } from './textos.js';

const GESTIONAR = ['actas_dotacion.gestionar', 'actas_activos.gestionar', 'actas_epp.gestionar'];
const VER = ['actas.ver', ...GESTIONAR];
const MIME: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' };

@Controller()
export class ActasController {
  constructor(
    private readonly actas: ActasService,
    private readonly archivos: ArchivosService,
  ) {}

  @Permisos(...VER)
  @Get('actas')
  listar(@UsuarioActual() u: UsuarioToken, @Query('colaboradorId') colaboradorId?: string) {
    return this.actas.listar(u, { colaboradorId: colaboradorId ? Number(colaboradorId) || undefined : undefined });
  }

  /** Motivos de cada tipo de acta y períodos de dotación, para los formularios. */
  @Permisos(...VER)
  @Get('actas/opciones')
  async opciones() {
    const motivos = Object.fromEntries(
      Object.entries(MOTIVOS_POR_PLANTILLA).map(([p, lista]) => [p, lista.map((m) => ({ valor: m, etiqueta: MOTIVOS[m].etiqueta }))]),
    );
    return { motivos, ...(await this.actas.periodos()) };
  }

  @Permisos(...VER)
  @Get('colaboradores/:id/tenencia')
  tenencia(@Param('id', IdPipe) id: number) {
    return this.actas.tenencia(id);
  }

  @Permisos(...VER)
  @Get('actas/:id')
  obtener(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken) {
    return this.actas.obtener(id, u);
  }

  @Permisos(...GESTIONAR)
  @Post('actas/entregas')
  entregar(@Body() dto: EntregaDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.actas.crearEntrega(dto, u, ip);
  }

  /** Acta antigua: llega como formulario con el archivo escaneado y los datos en JSON. */
  @Permisos(...GESTIONAR)
  @Post('actas/antiguas')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 52 * 1024 * 1024, files: 1 } }))
  async antigua(@Body('datos') datos: string, @UploadedFile() archivo: { buffer: Buffer } | undefined, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    let plano: unknown;
    try {
      plano = JSON.parse(datos ?? '');
    } catch {
      throw new BadRequestException('Datos del acta no válidos');
    }
    const dto = plainToInstance(ActaAntiguaDto, plano);
    const errores = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errores.length) {
      const mensajes = (e: (typeof errores)[number]): string[] => [...Object.values(e.constraints ?? {}), ...(e.children ?? []).flatMap(mensajes)];
      throw new BadRequestException(errores.flatMap(mensajes));
    }
    return this.actas.crearAntigua(dto, archivo?.buffer, u, ip);
  }

  @Permisos(...VER)
  @Get('actas/:id/original')
  async original(@Param('id', IdPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const f = await this.actas.rutaSoporte(id);
    res.set({ 'Content-Type': MIME[f.nombre.split('.').pop()!] ?? 'application/octet-stream', 'Content-Disposition': disposicion(f.nombre, true) });
    return new StreamableFile(await this.archivos.abrir(f.ruta));
  }

  @Permisos('actas_activos.gestionar')
  @Post('actas/devoluciones')
  devolver(@Body() dto: DevolucionDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.actas.crearDevolucion(dto, u, ip);
  }

  @Permisos(...GESTIONAR)
  @Post('actas/:id/anular')
  @HttpCode(200)
  anular(@Param('id', IdPipe) id: number, @Body() dto: AnularDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.actas.anular(id, dto.motivo, u, ip);
  }

  @Permisos(...VER)
  @Get('actas/:id/pdf')
  async pdf(@Param('id', IdPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const r = await this.actas.pdfGenerado(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': disposicion(r.nombre, true) });
    return r.contenido ? new StreamableFile(r.contenido) : new StreamableFile(await this.archivos.abrir(r.ruta!));
  }

  @Permisos(...GESTIONAR)
  @Post('actas/:id/firmada')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 52 * 1024 * 1024, files: 1 } }))
  subirFirmada(@Param('id', IdPipe) id: number, @UploadedFile() archivo: { buffer: Buffer } | undefined, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.actas.subirFirmada(id, archivo?.buffer, u, ip);
  }

  @Permisos(...VER)
  @Get('actas/:id/firmada')
  async firmada(@Param('id', IdPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const f = await this.actas.rutaFirmada(id);
    res.set({ 'Content-Type': MIME[f.nombre.split('.').pop()!] ?? 'application/octet-stream', 'Content-Disposition': disposicion(f.nombre, true) });
    return new StreamableFile(await this.archivos.abrir(f.ruta));
  }
}
