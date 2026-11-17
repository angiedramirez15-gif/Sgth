import { BadRequestException, Body, Controller, Get, HttpCode, Ip, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import type { UsuarioToken } from '../common/tipos.js';
import { DatabaseService } from '../database/database.service.js';
import { CorreoService } from '../correo/correo.service.js';
import { ConfiguracionService } from './configuracion.service.js';
import { PARAMETROS, PARAMETROS_POR_CLAVE } from './parametros.js';

export class GuardarParametroDto {
  @IsString({ message: 'El valor debe ser texto' })
  @MaxLength(255, { message: 'El valor no puede superar 255 caracteres' })
  valor: string;
}

/** Pantalla de Configuración: parámetros generales del sistema. */
@Permisos('configuracion.gestionar')
@Controller('configuracion')
export class ConfiguracionController {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfiguracionService,
    private readonly auditoria: AuditoriaService,
    private readonly correo: CorreoService,
  ) {}

  /** GET /api/configuracion */
  @Get()
  async listar() {
    const filas = await this.db.consultar<{ clave: string; valor: string | null; actualizadoEn: string | null; actualizadoPor: string | null }>(
      `SELECT c.clave, c.valor, c.actualizado_en AS actualizadoEn, u.nombre_completo AS actualizadoPor
         FROM configuracion c LEFT JOIN usuarios u ON u.id = c.actualizado_por`,
    );
    const porClave = new Map(filas.map((f) => [f.clave, f]));
    return PARAMETROS.filter((p) => porClave.has(p.clave)).map((p) => ({ ...p, ...porClave.get(p.clave) }));
  }

  /** GET /api/configuracion/correo: si el servidor tiene configurado el envío de correos. */
  @Get('correo')
  estadoCorreo() {
    return this.correo.estado();
  }

  /** POST /api/configuracion/correo/prueba: envía un correo de prueba al destino de los avisos. */
  @Post('correo/prueba')
  @HttpCode(200)
  probarCorreo(@UsuarioActual() u: UsuarioToken) {
    return this.correo.probar(u.nombre);
  }

  /** PUT /api/configuracion/:clave  { valor } */
  @Put(':clave')
  async guardar(@Param('clave') clave: string, @Body() dto: GuardarParametroDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    const p = PARAMETROS_POR_CLAVE.get(clave);
    if (!p) throw new NotFoundException('El parámetro no existe');
    if (!p.editable) throw new BadRequestException(`"${p.etiqueta}" no se puede cambiar desde el sistema`);

    let valor = dto.valor.trim();
    if (p.tipo === 'texto') {
      if (!valor) throw new BadRequestException(`Escriba un valor para "${p.etiqueta}"`);
      if (p.maximo && valor.length > p.maximo) throw new BadRequestException(`"${p.etiqueta}" no puede superar ${p.maximo} caracteres`);
      if (p.formato === 'correo') {
        const correos = valor.split(/[,;]/).map((c) => c.trim()).filter(Boolean);
        if (!correos.length || correos.some((c) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))) {
          throw new BadRequestException(`"${p.etiqueta}" debe ser un correo válido, por ejemplo nombre@empresa.com`);
        }
        valor = correos.join(', ');
      }
      if (p.formato === 'url') {
        valor = valor.replace(/\/+$/, '');
        if (!/^https?:\/\/[^\s/]+(:\d+)?$/i.test(valor)) {
          throw new BadRequestException(`"${p.etiqueta}" debe tener la forma http://192.168.1.20:3000 (sin nada después del puerto)`);
        }
      }
    } else {
      // Acepta "1.750.905" o "1750905": se guardan solo los dígitos
      if (p.tipo === 'dinero') valor = valor.replace(/[.\s$]/g, '');
      const n = Number(valor);
      if (!valor || !Number.isInteger(n)) throw new BadRequestException(`"${p.etiqueta}" debe ser un número entero`);
      if ((p.minimo !== undefined && n < p.minimo) || (p.maximo !== undefined && n > p.maximo)) {
        throw new BadRequestException(`"${p.etiqueta}" debe estar entre ${p.minimo} y ${p.maximo}`);
      }
      valor = String(n);
    }

    const antes = await this.db.uno<{ valor: string | null }>('SELECT valor FROM configuracion WHERE clave = ?', [clave]);
    if (!antes) throw new NotFoundException('El parámetro no existe en la base de datos');
    await this.db.ejecutar('UPDATE configuracion SET valor = ?, actualizado_por = ? WHERE clave = ?', [valor, u.sub, clave]);
    this.config.invalidar();
    await this.auditoria.registrar({ usuarioId: u.sub, accion: 'EDITAR', tabla: 'configuracion', antes: { clave, valor: antes.valor }, despues: { clave, valor }, ip });
    return (await this.listar()).find((x) => x.clave === clave);
  }
}
