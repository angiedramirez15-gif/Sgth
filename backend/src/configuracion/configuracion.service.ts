import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

/** Lee los parámetros de la tabla configuracion (se guardan en memoria 1 minuto). */
@Injectable()
export class ConfiguracionService {
  private cache = new Map<string, string | null>();
  private cargadoEn = 0;

  constructor(private readonly db: DatabaseService) {}

  private async cargar() {
    if (Date.now() - this.cargadoEn < 60_000) return;
    const filas = await this.db.consultar<{ clave: string; valor: string | null }>(
      'SELECT clave, valor FROM configuracion',
    );
    this.cache = new Map(filas.map((f) => [f.clave, f.valor]));
    this.cargadoEn = Date.now();
  }

  async texto(clave: string, porDefecto = ''): Promise<string> {
    await this.cargar();
    return this.cache.get(clave) ?? porDefecto;
  }

  async numero(clave: string, porDefecto: number): Promise<number> {
    const valor = Number(await this.texto(clave, ''));
    return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
  }

  /** Llamar después de modificar la tabla configuracion. */
  invalidar() {
    this.cargadoEn = 0;
  }
}
