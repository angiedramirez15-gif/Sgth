import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService, type Conexion } from '../database/database.service.js';

export type AccionAuditoria =
  | 'LOGIN'
  | 'LOGIN_FALLIDO'
  | 'CREAR'
  | 'EDITAR'
  | 'INACTIVAR'
  | 'ANULAR'
  | 'CONSULTAR_SENSIBLE'
  | 'DESCARGAR';

export interface RegistroAuditoria {
  usuarioId: number | null;
  accion: AccionAuditoria;
  tabla?: string;
  registroId?: number;
  antes?: unknown;
  despues?: unknown;
  ip?: string;
}

/** Registra en la tabla auditoria quién hizo qué y cuándo (RF-06, RNF-11). */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Si se pasa cx, el registro queda dentro de la misma transacción. */
  async registrar(r: RegistroAuditoria, cx: Conexion = this.db): Promise<void> {
    try {
      await cx.ejecutar(
        `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, datos_antes, datos_despues, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          r.usuarioId,
          r.accion,
          r.tabla ?? null,
          r.registroId ?? null,
          r.antes === undefined ? null : JSON.stringify(r.antes),
          r.despues === undefined ? null : JSON.stringify(r.despues),
          r.ip ?? null,
        ],
      );
    } catch (error) {
      // La auditoría nunca debe impedir la operación principal fuera de una transacción
      if (cx !== this.db) throw error;
      this.logger.error(`No se pudo registrar auditoría: ${(error as Error).message}`);
    }
  }
}
