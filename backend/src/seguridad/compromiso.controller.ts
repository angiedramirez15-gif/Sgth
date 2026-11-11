import { BadRequestException, Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { Permisos, UsuarioActual } from '../common/decorators/decoradores.js';
import type { UsuarioToken } from '../common/tipos.js';
import { DatabaseService } from '../database/database.service.js';

class CompromisoDto {
  @IsString({ message: 'Escriba el texto del compromiso' })
  @MinLength(50, { message: 'El compromiso debe tener al menos 50 caracteres' })
  @MaxLength(8000, { message: 'El compromiso puede tener hasta 8000 caracteres' })
  texto: string;
}

/** Compromiso de confidencialidad (Configuración). Cada cambio crea una versión y todos deben aceptarla de nuevo. */
@Permisos('configuracion.gestionar')
@Controller('compromiso')
export class CompromisoController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Get()
  async obtener() {
    const t = await this.db.uno<{ id: number; version: number; texto: string; creado_en: string; creado_por: string | null }>(
      `SELECT t.id, t.version, t.texto, DATE_FORMAT(t.creado_en, '%Y-%m-%d %H:%i') AS creado_en, u.nombre_completo AS creado_por
         FROM textos_legales t LEFT JOIN usuarios u ON u.id = t.creado_por
        WHERE t.tipo = 'CONFIDENCIALIDAD' AND t.vigente = 1 ORDER BY t.version DESC LIMIT 1`,
    );
    if (!t) return null;
    const c = await this.db.uno<{ total: number; aceptaron: number }>(
      `SELECT COUNT(*) AS total, SUM(EXISTS (SELECT 1 FROM aceptaciones_legales a WHERE a.usuario_id = u.id AND a.texto_id = ?)) AS aceptaron
         FROM usuarios u WHERE u.activo = 1`,
      [t.id],
    );
    return {
      id: t.id, version: t.version, texto: t.texto, creadoEn: t.creado_en, creadoPor: t.creado_por,
      usuariosActivos: Number(c?.total ?? 0), aceptaron: Number(c?.aceptaron ?? 0),
    };
  }

  @Post()
  async guardar(@Body() dto: CompromisoDto, @UsuarioActual() u: UsuarioToken, @Ip() ip: string) {
    const texto = dto.texto.replace(/\r\n/g, '\n').trim();
    const actual = await this.obtener();
    if (actual && actual.texto === texto) throw new BadRequestException('No hay cambios en el texto');
    await this.db.transaccion(async (cx) => {
      const v = await cx.uno<{ v: number }>(`SELECT COALESCE(MAX(version), 0) AS v FROM textos_legales WHERE tipo = 'CONFIDENCIALIDAD' FOR UPDATE`);
      await cx.ejecutar(`UPDATE textos_legales SET vigente = 0 WHERE tipo = 'CONFIDENCIALIDAD'`);
      const r = await cx.ejecutar(
        `INSERT INTO textos_legales (tipo, version, texto, creado_por) VALUES ('CONFIDENCIALIDAD', ?, ?, ?)`,
        [Number(v!.v) + 1, texto, u.sub],
      );
      await this.auditoria.registrar({ usuarioId: u.sub, accion: 'EDITAR', tabla: 'textos_legales', registroId: r.insertId, despues: { version: Number(v!.v) + 1 }, ip }, cx);
    });
    return this.obtener();
  }
}
