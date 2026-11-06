import { BadRequestException, Body, Controller, Get, Ip, NotFoundException, Param, Put } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import type { UsuarioToken } from '../common/tipos.js';
import { DatabaseService } from '../database/database.service.js';
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
