import {
  Body, Controller, Get, HttpCode, Ip, Param, Patch, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsInt } from 'class-validator';
import type { Response } from 'express';
import { ArchivosService } from '../archivos/archivos.service.js';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import { IdPipe } from '../common/id.pipe.js';
import type { UsuarioToken } from '../common/tipos.js';
import { ColaboradoresService } from './colaboradores.service.js';
import { DocumentosService, type DatosDocumento } from './documentos.service.js';
import { ColaboradorDto, RetiroDto } from './dto/colaborador.dto.js';
import { ImportacionService } from './importacion.service.js';

export class ObligatoriosDto {
  @IsArray({ message: 'Lista de documentos no válida' })
  @IsInt({ each: true, message: 'Lista de documentos no válida' })
  tipos: number[];
}

type ArchivoSubido = { buffer: Buffer; originalname: string; size: number };

// Tope de seguridad al recibir; el tamaño máximo real se valida con el parámetro de Configuración
const LIMITE_SUBIDA = { limits: { fileSize: 52 * 1024 * 1024, files: 1 } };

/** Nombre de archivo seguro para la cabecera de descarga. */
function disposicion(nombre: string, inline: boolean) {
  const ascii = nombre.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'archivo';
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

@Controller()
export class ColaboradoresController {
  constructor(
    private readonly colaboradores: ColaboradoresService,
    private readonly documentos: DocumentosService,
    private readonly importacion: ImportacionService,
    private readonly archivos: ArchivosService,
  ) {}

  // ---------- Colaboradores ----------

  @Permisos('colaboradores.ver')
  @Get('colaboradores')
  listar() {
    return this.colaboradores.listar();
  }

  @Permisos('colaboradores.ver')
  @Get('colaboradores/opciones')
  opciones() {
    return this.colaboradores.opciones();
  }

  @Permisos('colaboradores.gestionar')
  @Get('colaboradores/importacion/plantilla')
  async plantilla(@Res({ passthrough: true }) res: Response) {
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': disposicion('Plantilla_colaboradores_SGTH.xlsx', false),
    });
    return new StreamableFile(await this.importacion.plantilla());
  }

  /** POST /api/colaboradores/importacion?confirmar=true — sin confirmar solo revisa */
  @Permisos('colaboradores.gestionar')
  @Post('colaboradores/importacion')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  importar(@UploadedFile() archivo: ArchivoSubido | undefined, @Query('confirmar') confirmar: string, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.importacion.importar(archivo?.buffer, confirmar === 'true', u, ip);
  }

  @Permisos('colaboradores.ver')
  @Get('colaboradores/:id')
  obtener(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.colaboradores.obtener(id, u, ip);
  }

  @Permisos('colaboradores.gestionar')
  @Post('colaboradores')
  crear(@Body() dto: ColaboradorDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.colaboradores.crear(dto, u, ip);
  }

  @Permisos('colaboradores.gestionar')
  @Put('colaboradores/:id')
  editar(@Param('id', IdPipe) id: number, @Body() dto: ColaboradorDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.colaboradores.editar(id, dto, u, ip);
  }

  @Permisos('colaboradores.gestionar')
  @Post('colaboradores/:id/retiro')
  @HttpCode(200)
  retirar(@Param('id', IdPipe) id: number, @Body() dto: RetiroDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.colaboradores.retirar(id, dto.fechaRetiro, dto.motivoRetiro, u, ip);
  }

  @Permisos('colaboradores.gestionar')
  @Post('colaboradores/:id/reactivar')
  @HttpCode(200)
  reactivar(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.colaboradores.reactivar(id, u, ip);
  }

  // ---------- Foto ----------

  @Permisos('colaboradores.gestionar')
  @Post('colaboradores/:id/foto')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('archivo', LIMITE_SUBIDA))
  async subirFoto(@Param('id', IdPipe) id: number, @UploadedFile() archivo: ArchivoSubido | undefined, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    const g = await this.archivos.guardar(archivo?.buffer as Buffer, `colaboradores/${id}/foto`, ['jpg', 'png'], 3);
    await this.colaboradores.guardarFoto(id, g.ruta, u, ip);
    return { ok: true };
  }

  @Permisos('colaboradores.ver')
  @Get('colaboradores/:id/foto')
  async foto(@Param('id', IdPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const ruta = await this.colaboradores.rutaFoto(id);
    res.set({ 'Content-Type': ruta.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, max-age=300' });
    return new StreamableFile(await this.archivos.abrir(ruta));
  }

  // ---------- Documentos del expediente ----------

  @Permisos('documentos.ver', 'documentos.ver_sst')
  @Get('colaboradores/:id/documentos')
  documentosDe(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken) {
    return this.documentos.listar(id, u);
  }

  @Permisos('documentos.gestionar')
  @Post('colaboradores/:id/documentos')
  @UseInterceptors(FileInterceptor('archivo', LIMITE_SUBIDA))
  subirDocumento(
    @Param('id', IdPipe) id: number,
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @Body() datos: DatosDocumento,
    @UsuarioActual() u: UsuarioToken,
    @Ip() ip: string,
  ) {
    return this.documentos.subir(id, archivo, datos, u, ip);
  }

  /** GET /api/documentos/:id/archivo?descargar=true */
  @Permisos('documentos.ver', 'documentos.ver_sst')
  @Get('documentos/:id/archivo')
  async archivo(@Param('id', IdPipe) id: number, @Query('descargar') descargar: string, @UsuarioActual() u: UsuarioToken, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const a = await this.documentos.abrir(id, u, ip);
    res.set({ 'Content-Type': a.mime, 'Content-Disposition': disposicion(a.nombre, descargar !== 'true'), 'Cache-Control': 'no-store' });
    return new StreamableFile(a.flujo);
  }

  @Permisos('documentos.gestionar')
  @Patch('documentos/:id/inactivar')
  @HttpCode(200)
  async inactivarDocumento(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    await this.documentos.inactivar(id, u, ip);
    return { ok: true };
  }

  // ---------- Documentos obligatorios por cargo ----------

  @Permisos('catalogos.gestionar', 'documentos.gestionar')
  @Get('cargos/:id/documentos-obligatorios')
  obligatorios(@Param('id', IdPipe) id: number) {
    return this.documentos.obligatorios(id);
  }

  @Permisos('catalogos.gestionar')
  @Put('cargos/:id/documentos-obligatorios')
  guardarObligatorios(@Param('id', IdPipe) id: number, @Body() dto: ObligatoriosDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.documentos.guardarObligatorios(id, dto.tipos, u, ip);
  }
}
