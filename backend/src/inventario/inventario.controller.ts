import { BadRequestException, Body, Controller, Get, HttpCode, Ip, Param, Patch, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import { IdPipe } from '../common/id.pipe.js';
import type { UsuarioToken } from '../common/tipos.js';
import { DatabaseService } from '../database/database.service.js';
import { ActivosService } from './activos.service.js';
import { esCategoria, PERMISOS_GESTIONAR_INVENTARIO, PERMISOS_VER_INVENTARIO } from './categorias.js';
import { ActivoDto, AjusteDto, ElementoDto, EntradaDto, EstadoActivoDto, EstadoRegistroDto, StickersDto } from './dto/inventario.dto.js';
import { ElementosService } from './elementos.service.js';
import { StickersService } from './stickers.service.js';

const VER = [...PERMISOS_VER_INVENTARIO, ...PERMISOS_GESTIONAR_INVENTARIO];

/**
 * Inventario: catálogo de elementos, stock por talla, entradas, ajustes y activos con placa.
 * El permiso exacto depende de la categoría (dotación, EPP o equipos/muebles/otros) y lo valida el servicio.
 */
@Controller('inventario')
export class InventarioController {
  constructor(
    private readonly elementos: ElementosService,
    private readonly activos: ActivosService,
    private readonly stickers: StickersService,
    private readonly db: DatabaseService,
  ) {}

  // ---------- Catálogo y stock ----------

  @Permisos(...VER)
  @Get('elementos')
  listar(@Query('categoria') categoria: string, @UsuarioActual() u: UsuarioToken) {
    if (!esCategoria(categoria)) throw new BadRequestException('Categoría no válida');
    return this.elementos.listar(categoria, u);
  }

  @Permisos(...PERMISOS_GESTIONAR_INVENTARIO)
  @Post('elementos')
  crear(@Body() dto: ElementoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.elementos.crear(dto, u, ip);
  }

  @Permisos(...PERMISOS_GESTIONAR_INVENTARIO)
  @Put('elementos/:id')
  editar(@Param('id', IdPipe) id: number, @Body() dto: ElementoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.elementos.editar(id, dto, u, ip);
  }

  @Permisos(...PERMISOS_GESTIONAR_INVENTARIO)
  @Patch('elementos/:id/estado')
  cambiarActivo(@Param('id', IdPipe) id: number, @Body() dto: EstadoRegistroDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.elementos.cambiarActivo(id, dto.activo, u, ip);
  }

  @Permisos(...VER)
  @Get('elementos/:id/movimientos')
  movimientos(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken) {
    return this.elementos.movimientos(id, u);
  }

  @Permisos(...PERMISOS_GESTIONAR_INVENTARIO)
  @Post('entradas')
  entrada(@Body() dto: EntradaDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.elementos.registrarEntrada(dto, u, ip);
  }

  @Permisos(...PERMISOS_GESTIONAR_INVENTARIO)
  @Post('ajustes')
  ajuste(@Body() dto: AjusteDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.elementos.ajustar(dto, u, ip);
  }

  /** Proveedores activos para las listas de entradas y activos. */
  @Permisos(...VER)
  @Get('proveedores')
  proveedores() {
    return this.db.consultar<{ id: number; nombre: string }>('SELECT id, nombre FROM proveedores WHERE activo = 1 ORDER BY nombre');
  }

  // ---------- Activos (equipos y muebles) ----------

  @Permisos('inventario_activos.ver', 'inventario_activos.gestionar')
  @Get('activos')
  listarActivos(@UsuarioActual() u: UsuarioToken) {
    return this.activos.listar(u);
  }

  /** PDF para imprimir en hoja carta de 10 etiquetas. */
  @Permisos('inventario_activos.ver', 'inventario_activos.gestionar')
  @Post('activos/stickers')
  @HttpCode(200)
  async generarStickers(@Body() dto: StickersDto, @UsuarioActual() u: UsuarioToken, @Res({ passthrough: true }) res: Response) {
    const activos = await this.activos.varios(dto.ids, u);
    const pdf = await this.stickers.generar(activos, dto);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Stickers_placas_SGTH.pdf"' });
    return new StreamableFile(pdf);
  }

  @Permisos('inventario_activos.ver', 'inventario_activos.gestionar')
  @Get('activos/:id')
  obtenerActivo(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken) {
    return this.activos.obtener(id, u);
  }

  @Permisos('inventario_activos.ver', 'inventario_activos.gestionar')
  @Get('activos/:id/historial')
  historial(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken) {
    return this.activos.historial(id, u);
  }

  @Permisos('inventario_activos.gestionar')
  @Post('activos')
  crearActivo(@Body() dto: ActivoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.activos.crear(dto, u, ip);
  }

  @Permisos('inventario_activos.gestionar')
  @Put('activos/:id')
  editarActivo(@Param('id', IdPipe) id: number, @Body() dto: ActivoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.activos.editar(id, dto, u, ip);
  }

  @Permisos('inventario_activos.gestionar')
  @Patch('activos/:id/estado')
  estadoActivo(@Param('id', IdPipe) id: number, @Body() dto: EstadoActivoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.activos.cambiarEstado(id, dto, u, ip);
  }
}
