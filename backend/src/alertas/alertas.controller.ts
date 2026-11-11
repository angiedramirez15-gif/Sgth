import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import { IdPipe } from '../common/id.pipe.js';
import type { UsuarioToken } from '../common/tipos.js';
import { AlertasService } from './alertas.service.js';

class DescartarDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Explique por qué se descarta' }) @IsNotEmpty({ message: 'Explique por qué se descarta' })
  @MaxLength(255, { message: 'El motivo no puede superar 255 caracteres' })
  motivo: string;
}

const VER = ['alertas_th.ver', 'alertas_sst.ver'];

@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Permisos(...VER)
  @Get()
  listar(@UsuarioActual() u: UsuarioToken, @Query('estado') estado?: string) {
    const e = estado === 'DESCARTADA' || estado === 'ATENDIDA' ? estado : 'ACTIVA';
    return this.alertas.listar(u, e);
  }

  @Permisos(...VER)
  @Get('resumen')
  resumen(@UsuarioActual() u: UsuarioToken) {
    return this.alertas.resumen(u);
  }

  @Permisos(...VER)
  @Post('actualizar')
  @HttpCode(200)
  async actualizar(@UsuarioActual() u: UsuarioToken) {
    await this.alertas.asegurarAlDia(true);
    return this.alertas.resumen(u);
  }

  @Permisos(...VER)
  @Post(':id/descartar')
  @HttpCode(200)
  descartar(@Param('id', IdPipe) id: number, @Body() dto: DescartarDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.alertas.descartar(id, dto.motivo, u, ip);
  }

  @Permisos(...VER)
  @Post(':id/reactivar')
  @HttpCode(200)
  reactivar(@Param('id', IdPipe) id: number, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    return this.alertas.reactivar(id, u, ip);
  }
}
