import { Controller, Get, Query } from '@nestjs/common';
import { Permisos } from '../common/decorators/decoradores.js';
import { DatabaseService } from '../database/database.service.js';

/** Nombre en español de cada tabla que aparece en la auditoría. */
export const MODULOS: Record<string, string> = {
  usuarios: 'Usuarios', colaboradores: 'Colaboradores', documentos: 'Documentos', colaborador_tallas: 'Tallas',
  actas: 'Actas', planillas_epp: 'Planillas de EPP', plantillas_acta: 'Plantillas', elementos: 'Elementos de inventario',
  activos: 'Equipos y muebles', movimientos_inventario: 'Movimientos de inventario', matriz_epp_cargo: 'Matriz de EPP',
  alertas: 'Alertas', reportes: 'Reportes', certificados_laborales: 'Certificados laborales', configuracion: 'Configuración',
  textos_legales: 'Compromiso de confidencialidad', aceptaciones_legales: 'Aceptación del compromiso',
  areas: 'Áreas', cargos: 'Cargos', tipos_documento_expediente: 'Tipos de documento', entidades: 'Entidades', proveedores: 'Proveedores',
  documentos_obligatorios_cargo: 'Documentos por cargo',
};
export const ACCIONES: Record<string, string> = {
  LOGIN: 'Ingresó', LOGIN_FALLIDO: 'Ingreso fallido', CREAR: 'Creó', EDITAR: 'Modificó', INACTIVAR: 'Inactivó',
  ANULAR: 'Anuló', CONSULTAR_SENSIBLE: 'Consultó datos sensibles', DESCARGAR: 'Descargó',
};
const POR_PAGINA = 100;
const fecha = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Consulta del registro de auditoría (solo lectura): quién hizo qué y cuándo. */
@Permisos('auditoria.ver')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly db: DatabaseService) {}

  @Get('opciones')
  async opciones() {
    const usuarios = await this.db.consultar<{ id: number; nombre: string; usuario: string }>(
      'SELECT id, nombre_completo AS nombre, usuario FROM usuarios ORDER BY nombre_completo',
    );
    const tablas = await this.db.consultar<{ tabla: string }>('SELECT DISTINCT tabla FROM auditoria WHERE tabla IS NOT NULL ORDER BY tabla');
    return {
      usuarios,
      modulos: tablas.map((t) => ({ valor: t.tabla, nombre: MODULOS[t.tabla] ?? t.tabla })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      acciones: Object.entries(ACCIONES).map(([valor, nombre]) => ({ valor, nombre })),
    };
  }

  @Get()
  async listar(
    @Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('usuarioId') usuarioId?: string,
    @Query('accion') accion?: string, @Query('modulo') modulo?: string, @Query('pagina') pagina?: string,
  ) {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    if (fecha(desde)) { condiciones.push('a.fecha >= ?'); params.push(`${desde} 00:00:00`); }
    if (fecha(hasta)) { condiciones.push('a.fecha <= ?'); params.push(`${hasta} 23:59:59`); }
    if (usuarioId && /^\d+$/.test(usuarioId)) { condiciones.push('a.usuario_id = ?'); params.push(Number(usuarioId)); }
    if (accion && ACCIONES[accion]) { condiciones.push('a.accion = ?'); params.push(accion); }
    if (modulo && /^[a-z_]{1,60}$/.test(modulo)) { condiciones.push('a.tabla = ?'); params.push(modulo); }
    const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const n = Math.max(1, Number(pagina) || 1);
    const total = await this.db.uno<{ total: number }>(`SELECT COUNT(*) AS total FROM auditoria a ${donde}`, params);
    const filas = await this.db.consultar<{
      id: number; fecha: string; usuario: string | null; accion: string; tabla: string | null; registroId: number | null;
      antes: string | null; despues: string | null; ip: string | null;
    }>(
      `SELECT a.id, DATE_FORMAT(a.fecha, '%Y-%m-%d %H:%i:%s') AS fecha, u.nombre_completo AS usuario, a.accion, a.tabla,
              a.registro_id AS registroId, a.datos_antes AS antes, a.datos_despues AS despues, a.ip
         FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
         ${donde}
        ORDER BY a.id DESC
        LIMIT ${POR_PAGINA} OFFSET ${(n - 1) * POR_PAGINA}`,
      params,
    );
    const leer = (t: string | null) => { try { return t ? JSON.parse(t) : null; } catch { return t; } };
    return {
      total: Number(total?.total ?? 0),
      pagina: n,
      porPagina: POR_PAGINA,
      filas: filas.map((f) => ({
        ...f,
        accionNombre: ACCIONES[f.accion] ?? f.accion,
        modulo: f.tabla ? (MODULOS[f.tabla] ?? f.tabla) : '',
        antes: leer(f.antes),
        despues: leer(f.despues),
      })),
    };
  }
}
