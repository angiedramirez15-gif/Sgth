import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

/** Parámetros de una consulta: siempre con ? para evitar inyección SQL. */
export type Parametros = unknown[];

/** Operaciones disponibles dentro de una transacción. */
export interface Conexion {
  consultar<T>(sql: string, params?: Parametros): Promise<T[]>;
  uno<T>(sql: string, params?: Parametros): Promise<T | null>;
  ejecutar(sql: string, params?: Parametros): Promise<ResultSetHeader>;
}

function envolver(cx: Pool | PoolConnection): Conexion {
  return {
    async consultar<T>(sql: string, params: Parametros = []) {
      const [filas] = await cx.query<RowDataPacket[]>(sql, params);
      return filas as unknown as T[];
    },
    async uno<T>(sql: string, params: Parametros = []) {
      const [filas] = await cx.query<RowDataPacket[]>(sql, params);
      return (filas[0] as unknown as T) ?? null;
    },
    async ejecutar(sql: string, params: Parametros = []) {
      const [resultado] = await cx.query<ResultSetHeader>(sql, params);
      return resultado;
    },
  };
}

/**
 * Acceso a MariaDB con mysql2 (SQL directo).
 * Las consultas se escriben igual que en HeidiSQL, con ? en lugar de los valores.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy, Conexion {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  private readonly cx: Conexion;

  constructor(config: ConfigService) {
    this.pool = mysql.createPool({
      host: config.get<string>('DB_HOST', '127.0.0.1'),
      port: Number(config.get('DB_PORT', 3306)),
      user: config.getOrThrow<string>('DB_USER'),
      password: config.getOrThrow<string>('DB_PASSWORD'),
      database: config.get<string>('DB_NAME', 'sgth'),
      connectionLimit: 10,
      charset: 'utf8mb4',
      dateStrings: true, // fechas como texto 'YYYY-MM-DD', sin problemas de zona horaria
      decimalNumbers: true,
    });
    this.cx = envolver(this.pool);
  }

  consultar<T>(sql: string, params: Parametros = []): Promise<T[]> {
    return this.cx.consultar<T>(sql, params);
  }

  uno<T>(sql: string, params: Parametros = []): Promise<T | null> {
    return this.cx.uno<T>(sql, params);
  }

  ejecutar(sql: string, params: Parametros = []): Promise<ResultSetHeader> {
    return this.cx.ejecutar(sql, params);
  }

  /**
   * Ejecuta varias operaciones como una sola: si alguna falla, se deshacen todas.
   * Ejemplo: registrar un acta, sus líneas y descontar el inventario.
   */
  async transaccion<T>(trabajo: (cx: Conexion) => Promise<T>): Promise<T> {
    const conexion = await this.pool.getConnection();
    try {
      await conexion.beginTransaction();
      const resultado = await trabajo(envolver(conexion));
      await conexion.commit();
      return resultado;
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }

  /** true si la base de datos responde. */
  async disponible(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.error(`MariaDB no responde: ${(error as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
